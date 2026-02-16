const express = require('express')
const cors = require('cors')
require('dotenv').config()

const authRoutes = require('./routes/authRoutes')
const userRoutes = require('./routes/userRoutes')
const adminUserRoutes = require('./routes/adminUserRoutes')

const lessonRoutes = require('./routes/lessonRoutes')
const taskRoutes = require('./routes/taskRoutes')
const leaderboardRoutes = require('./routes/leaderBoardRoutes')
const adminLessonRoutes = require('./routes/adminLessonRoutes')

const progressRoutes = require('./routes/progressRoutes')

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/', (req, res) => {
  res.send('GOOOOOOOD JOOOOB')
})

app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/admin', adminUserRoutes)

app.use('/api/lessons', lessonRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/admin', adminLessonRoutes)

app.use('/api/progress', progressRoutes)

const PORT = process.env.PORT

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
