const express = require('express')
const app = express()
app.use(express.json())
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const Path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
// const format = require('date-fns')

const dbPath = Path.join(__dirname, 'twitterClone.db')
let db

async function initilizeDatabase() {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('The server has started with port number 3000.')
    })
  } catch (err) {
    console.log('Error Occured', err)
    process.exit(0)
  }
}

initilizeDatabase()

app.post('/register', async (request, response) => {
  let {username, password, name, gender} = request.body
  let user = await db.get(`select * from user where username="${username}";`)
  if (user !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      let enc_password = await bcrypt.hash(password, 10)
      let query = `insert into user (name,username,password,gender) values ("${name}","${username}","${enc_password}","${gender}");`
      let ans = await db.run(query)
      response.send('User created successfully')
    }
  }
})

app.post('/login', async (request, response) => {
  let {username, password} = request.body
  let user = await db.get(`select * from user where username="${username}";`)
  if (user === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    let verify = await bcrypt.compare(password, user.password)
    if (verify) {
      let token = jwt.sign(
        {username: username, user_id: user.user_id},
        'my-secret-string',
      )
      response.send({jwtToken: token})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

async function authentication(request, response, next) {
  let auth = request.headers['authorization']
  if (auth === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    let token = auth.split(' ')[1]
    let ans = jwt.verify(token, 'my-secret-string', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        // console.log(payload)
        // console.log('successfully completed the authentication.')
        request.username = payload.username
        request.user_id = payload.user_id
        next()
      }
    })
  }
}

async function authorization(request, response, next) {
  let {tweetId} = request.params
  let {username, user_id} = request
  let query2 = `select following_user_id from follower where follower_user_id=${user_id}`
  let following = await db.all(query2)
  following = following.map(obj => obj['following_user_id'])
  // console.log(following)
  let query3 = `select tweet.user_id from tweet where tweet.tweet_id=${tweetId};`
  let tweeted = await db.get(query3)
  // console.log(tweeted, tweeted.user_id)
  tweeted_user = tweeted.user_id
  if (following.includes(tweeted_user)) {
    next()
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
}

app.get('/user/tweets/feed', authentication, async (request, response) => {
  // console.log('api called')
  // console.log(request.username)
  let username = request.username
  let user_id = request.user_id
  console.log(request.username, request.user_id)
  let query = `select 
    twitter.tweeted_name as username, twitter.tweet as tweet,
    twitter.dateTime from user join follower
    on user.user_id=follower.follower_user_id join 
    (select tweet.user_id as tweet_id, tweet.tweet as tweet,
    tweet.date_time as dateTime, user.username as tweeted_name
    from tweet join user on tweet.user_id=user.user_id) 
    as twitter on twitter.tweet_id=follower.following_user_id
    where user.username="${username}";`
  let query2 = `select 
    user.username, tweet.tweet, tweet.date_time as dateTime
    from follower join tweet on 
    follower.following_user_id=tweet.user_id join user
    on tweet.user_id=user.user_id 
    where follower.follower_user_id=${user_id} order by dateTime desc;`
  let ans = await db.all(query2)
  response.send(ans.splice(0, 4))
})

app.get('/user/following', authentication, async (request, response) => {
  let username = request.username
  let user_id = request.user_id
  let query = `select user.name from follower join user on follower.following_user_id=user.user_id where follower.follower_user_id=${user_id};`
  let ans = await db.all(query)
  response.send(ans)
})

app.get('/user/followers', authentication, async (request, response) => {
  let username = request.username
  let user_id = request.user_id
  let query = `select user.name from follower join user on follower.follower_user_id=user.user_id where follower.following_user_id=${user_id};`
  let ans = await db.all(query)
  response.send(ans)
})

app.get(
  '/tweets/:tweetId',
  authentication,
  authorization,
  async (request, response) => {
    let {tweetId} = request.params
    let {username, user_id} = request
    let query = `select tweet, (select count(*) from like join tweet on like.tweet_id=tweet.tweet_id where like.tweet_id=${tweetId}) as likes, (select count(*) from reply join tweet on reply.tweet_id=tweet.tweet_id where reply.tweet_id=${tweetId}) as replies, tweet.date_time as dateTime from tweet where tweet.tweet_id=${tweetId};`
    let ans = await db.get(query)
    response.send(ans)
  },
)

app.get(
  '/tweets/:tweetId/likes',
  authentication,
  authorization,
  async (request, response) => {
    let {tweetId} = request.params
    let query = `select user.username from like join user on like.user_id=user.user_id where like.tweet_id=${tweetId};`
    let ans = await db.all(query)
    let list_ans = ans.map(ele => ele.username)
    response.send({likes: list_ans})
  },
)

app.get(
  '/tweets/:tweetId/replies',
  authentication,
  authorization,
  async (request, response) => {
    let {tweetId} = request.params
    let query = `select user.name, reply.reply from reply join user on reply.user_id=user.user_id where reply.tweet_id=${tweetId} ;`
    let ans = await db.all(query)
    //let query2 = `select tweet from tweet where tweet_id=${tweetId};`
    //let ans2 = await db.get(query2)
    response.send({tweet: ans2['tweet'], replies: ans})
  },
)

app.get('/user/tweets', authentication, async (request, response) => {
  let {username, user_id} = request
  let query = `select t1.tweet, t1.likes, t2.replies, t1.date_time as dateTime from (select tweet.tweet, count(like.like_id) as likes, tweet.date_time from tweet left join like on tweet.tweet_id=like.tweet_id where tweet.user_id=${user_id} group by tweet, date_time) as t1 join (select tweet.tweet, count(reply.reply) as replies
  from tweet left join reply on tweet.tweet_id = reply.tweet_id where tweet.user_id=${user_id} group by tweet) as t2 on t1.tweet=t2.tweet;`
  let ans = await db.all(query)
  response.send(ans)
})

// function formatDateTime() {
//   let date = new Date()
//   return format(date, 'yyyy-MM-dd HH:mm:ss')
// }

app.post('/user/tweets', authentication, async (request, response) => {
  let {user_id} = request
  let tweet_msg = request.body.tweet
  let query = `insert into tweet (tweet, user_id) values ("${tweet_msg}", ${user_id});`
  let ans = await db.run(query)
  response.send('Created a Tweet')
})

app.delete('/tweets/:tweetId', authentication, async (request, response) => {
  let {tweetId} = request.params
  let {user_id} = request
  let user_tweets = await db.all(
    `select tweet_id from tweet where user_id=${user_id};`,
  )
  user_tweets = user_tweets.map(ele => ele.tweet_id)
  // console.log(user_tweets)
  // console.log(parseInt(tweetId))
  if (user_tweets.includes(parseInt(tweetId))) {
    let query = `delete from tweet where tweet_id=${tweetId};`
    let ans = await db.run(query)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
