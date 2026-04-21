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
const uploadRoutes = require('./routes/uploadRoutes')

const progressRoutes = require('./routes/progressRoutes')
const chatRoutes = require('./routes/chatRoutes');

const taskPublicRoutes = require('./routes/taskPublicRoutes')
const taskAudioRoutes = require('./routes/taskAudioRoutes')

const alphabetRoutes = require('./routes/alphabetRoutes')
const adminAlphabetRoutes = require('./routes/adminAlphabetRoutes')
const booksRoutes = require('./routes/booksRoutes')
const adminBookRoutes = require('./routes/adminBookRoutes')

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
app.use('/api/admin', adminLessonRoutes)
app.use('/api/admin', uploadRoutes)

app.use('/api/lessons', lessonRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/chat', chatRoutes);

app.use('/api/tasks', taskRoutes)
app.use('/api/tasks', taskPublicRoutes)
app.use('/api/tasks', taskAudioRoutes)

app.use('/api/alphabet', alphabetRoutes)
app.use('/api/admin/alphabet', adminAlphabetRoutes)
app.use('/api/books', booksRoutes)
app.use('/api/admin', adminBookRoutes)

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
