const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')

const LEVEL_ORDER = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 }

function isSameStringArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (String(a[i]) !== String(b[i])) return false
  }
  return true
}

function dayKeyAlmaty(date = new Date()) {
  // Алматы UTC+5
  const ms = date.getTime() + 5 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10) // YYYY-MM-DD
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
      select: {
        id: true,
        lessonId: true,
        correctWords: true,
        xpReward: true,
        lesson: { select: { level: true } },
      },
    })

    if (!task) return res.status(404).json({ message: 'Task not found' })

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { level: true },
    })
    const userRank = LEVEL_ORDER[user?.level ?? 'A0']

    if (LEVEL_ORDER[task.lesson.level] > userRank) {
      return res
        .status(403)
        .json({ message: 'Lesson is locked for your level' })
    }

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

    const existingAttempt = await prisma.taskAttempt.findUnique({
      where: { userId_taskId: { userId: req.userId, taskId: task.id } },
      select: { id: true, isCorrect: true },
    })

    // ✅ попытка: благодаря @@unique([userId, taskId]) XP будет максимум один раз
    let attempt

    if (existingAttempt?.isCorrect) {
      return res.json({ isCorrect, earnedXp: 0, alreadySubmitted: true })
    }

    if (!existingAttempt) {
      // ✅ первой сдачей создаём attempt
      attempt = await prisma.taskAttempt.create({
        data: {
          userId: req.userId,
          taskId: task.id,
          answerWords,
          isCorrect,
          earnedXp: isCorrect ? task.xpReward : 0,
        },
      })
    } else {
      // ✅ попытка была, но неправильная — обновляем
      attempt = await prisma.taskAttempt.update({
        where: { id: existingAttempt.id },
        data: {
          answerWords,
          isCorrect,
          earnedXp: isCorrect ? task.xpReward : 0,
        },
      })
    }
    // try {
    //   // console.log(
    //   //   'delegates:',
    //   //   Object.keys(prisma)
    //   //     .filter((k) => !k.startsWith('_'))
    //   //     .slice(0, 50),
    //   // )
    //   // console.log('has taskAttempt:', prisma.taskAttempt)
    //   attempt = await prisma.taskAttempt.create({
    //     data: {
    //       userId: req.userId,
    //       taskId: task.id,
    //       answerWords,
    //       isCorrect,
    //       earnedXp: isCorrect ? task.xpReward : 0,
    //     },
    //   })
    // } catch (e) {
    //   // уже сдавал эту задачу
    //   if (e.code === 'P2002') {
    //     return res.json({ isCorrect, earnedXp: 0, alreadySubmitted: true })
    //   }
    //   throw e
    // }

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
      // ✅ проверяем, не был ли урок уже COMPLETED раньше
      const prev = await prisma.progress.findUnique({
        where: {
          userId_lessonId: { userId: req.userId, lessonId: task.lessonId },
        },
        select: { status: true },
      })

      if (prev?.status !== 'COMPLETED') {
        // ✅ впервые закрыли урок -> ставим COMPLETED
        await prisma.progress.update({
          where: {
            userId_lessonId: { userId: req.userId, lessonId: task.lessonId },
          },
          data: { status: 'COMPLETED' },
        })

        // ✅ обновляем streak (1 раз в день)
        const today = dayKeyAlmaty()
        const yesterday = dayKeyAlmaty(
          new Date(Date.now() - 24 * 60 * 60 * 1000),
        )

        const u = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { streakCount: true, streakLastDay: true },
        })

        if (!u?.streakLastDay) {
          await prisma.user.update({
            where: { id: req.userId },
            data: { streakCount: 1, streakLastDay: today },
          })
        } else if (u.streakLastDay === today) {
          // уже засчитали сегодня — ничего
        } else if (u.streakLastDay === yesterday) {
          await prisma.user.update({
            where: { id: req.userId },
            data: {
              streakCount: (u.streakCount ?? 0) + 1,
              streakLastDay: today,
            },
          })
        } else {
          await prisma.user.update({
            where: { id: req.userId },
            data: { streakCount: 1, streakLastDay: today },
          })
        }
      }

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
