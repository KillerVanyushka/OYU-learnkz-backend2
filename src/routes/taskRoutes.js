const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')

function isSameStringArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (String(a[i]) !== String(b[i])) return false
  }
  return true
}

//POST /api/tasks/:id/submit
router.post('/:id/submit', requireAuth, async (req, res) => {
  try {
    const taskId = Number(req.params.id)
    if (Number.isNaN(taskId))
      return res.status(400).json({ message: 'Invalid task id' })

    const { answerWords } = req.body || {}
    if (!Array.isArray(answerWords) || answerWords.length === 0) {
      return res
        .status(400)
        .json({ message: 'answerWords must be a non-empty array' })
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, isArchived: false, lesson: { isArchived: false } },
      select: { id: true, lessonId: true, correctWords: true, xpReward: true },
    })

    if (!task) return res.status(404).json({ message: 'Task not found' })

    const isCorrect = isSameStringArray(answerWords, task.correctWords)

    // ✅ создаём/обновляем прогресс урока (если нет — создастся)
    await prisma.progress.upsert({
      where: {
        userId_lessonId: { userId: req.userId, lessonId: task.lessonId },
      },
      create: {
        userId: req.userId,
        lessonId: task.lessonId,
        status: 'IN_PROGRESS',
        score: 0,
      },
      update: {},
    })

    // ✅ попытка: благодаря @@unique([userId, taskId]) XP будет максимум один раз
    let attempt
    try {
      // console.log(
      //   'delegates:',
      //   Object.keys(prisma)
      //     .filter((k) => !k.startsWith('_'))
      //     .slice(0, 50),
      // )
      // console.log('has taskAttempt:', prisma.taskAttempt)
      attempt = await prisma.taskAttempt.create({
        data: {
          userId: req.userId,
          taskId: task.id,
          answerWords,
          isCorrect,
          earnedXp: isCorrect ? task.xpReward : 0,
        },
      })
    } catch (e) {
      // уже сдавал эту задачу
      if (e.code === 'P2002') {
        return res.json({ isCorrect, earnedXp: 0, alreadySubmitted: true })
      }
      throw e
    }

    // ✅ если верно — начисляем XP и score урока
    if (isCorrect) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { xp: { increment: task.xpReward } },
      })

      await prisma.progress.update({
        where: {
          userId_lessonId: { userId: req.userId, lessonId: task.lessonId },
        },
        data: { score: { increment: task.xpReward } },
      })
    }

    const totalTasks = await prisma.task.count({
      where: { lessonId: task.lessonId, isArchived: false },
    })

    const solvedCorrect = await prisma.taskAttempt.count({
      where: {
        userId: req.userId,
        isCorrect: true,
        task: { lessonId: task.lessonId, isArchived: false },
      },
    })

    let lessonStatus = 'IN_PROGRESS'
    if (totalTasks > 0 && solvedCorrect >= totalTasks) {
      await prisma.progress.update({
        where: {
          userId_lessonId: { userId: req.userId, lessonId: task.lessonId },
        },
        data: { status: 'COMPLETED' },
      })
      lessonStatus = 'COMPLETED'
    }

    return res.json({
      isCorrect,
      earnedXp: attempt.earnedXp,
      alreadySubmitted: false,
      lessonStatus,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
