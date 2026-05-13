const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')
const { evaluateWordMatch } = require('../utils/taskMatching')

const LEVEL_ORDER = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 }

function normalize(str) {
  return String(str).trim().toLowerCase().replace(/\s+/g, ' ')
}

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

    const { answerWords, answerText, answerPairs } = req.body || {}

    const task = await prisma.task.findFirst({
      where: { id: taskId, isArchived: false, lesson: { isArchived: false } },
      select: {
        id: true,
        lessonId: true,
        type: true,
        correctWords: true,
        xpReward: true,
        audioText: true,
        translateText: true,
        optionsWords: true,
        lesson: { select: { level: true } },
      },
    })

    if (!task) return res.status(404).json({ message: 'Task not found' })

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { level: true },
    })
    if (!user) return res.status(404).json({ message: 'User not found' })

    if (!task.lesson?.level) {
      return res.status(500).json({ message: 'Task has no lesson level' })
    }
    const userRank = LEVEL_ORDER[user?.level ?? 'A0']

    if (LEVEL_ORDER[task.lesson.level] > userRank) {
      return res
        .status(403)
        .json({ message: 'Lesson is locked for your level' })
    }

    let isCorrect = false

    if (task.type === 'SENTENCE_BUILD') {
      if (!Array.isArray(answerWords) || answerWords.length === 0) {
        return res
          .status(400)
          .json({ message: 'answerWords must be a non-empty array' })
      }
      if (!Array.isArray(task.correctWords) || task.correctWords.length === 0) {
        return res.status(500).json({ message: 'Task has no correctWords' })
      }
      isCorrect = isSameStringArray(answerWords, task.correctWords)
    }

    if (task.type === 'AUDIO_DICTATION') {
      if (!answerText || String(answerText).trim().length === 0) {
        return res.status(400).json({ message: 'answerText required' })
      }
      if (!task.audioText) {
        return res.status(500).json({ message: 'Task has no audioText' })
      }
      isCorrect = normalize(answerText) === normalize(task.audioText)
    }

    if (task.type === 'AUDIO_TRANSLATE') {
      if (!answerText || String(answerText).trim().length === 0) {
        return res.status(400).json({ message: 'answerText required' })
      }
      if (!task.translateText) {
        return res.status(500).json({ message: 'Task has no translateText' })
      }
      isCorrect = normalize(answerText) === normalize(task.translateText)
    }

    let pairResults = undefined

    if (task.type === 'WORD_MATCH') {
      const evaluation = evaluateWordMatch(answerPairs, task.optionsWords)

      if (evaluation.error) {
        const statusCode = evaluation.error.startsWith('answerPairs') ? 400 : 500
        return res.status(statusCode).json({ message: evaluation.error })
      }

      isCorrect = evaluation.isCorrect
      pairResults = evaluation.pairResults
    }

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

    const attemptAnswer =
      task.type === 'SENTENCE_BUILD'
        ? answerWords
        : task.type === 'WORD_MATCH'
          ? answerPairs
          : answerText

    const existingAttempt = await prisma.taskAttempt.findUnique({
      where: { userId_taskId: { userId: req.userId, taskId: task.id } },
      select: { id: true, isCorrect: true },
    })

    // ✅ попытка: благодаря @@unique([userId, taskId]) XP будет максимум один раз
    let attempt

    if (existingAttempt?.isCorrect) {
      return res.json({ isCorrect, earnedXp: 0, alreadySubmitted: true, pairResults })
    }

    if (!existingAttempt) {
      // ✅ первой сдачей создаём attempt
      attempt = await prisma.taskAttempt.create({
        data: {
          userId: req.userId,
          taskId: task.id,
          answerWords: attemptAnswer,
          isCorrect,
          earnedXp: isCorrect ? task.xpReward : 0,
        },
      })
    } else {
      // ✅ попытка была, но неправильная — обновляем
      attempt = await prisma.taskAttempt.update({
        where: { id: existingAttempt.id },
        data: {
          answerWords: attemptAnswer,
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
      await prisma.$transaction([
        prisma.user.update({
          where: { id: req.userId },
          data: { xp: { increment: task.xpReward } },
        }),
        prisma.progress.update({
          where: {
            userId_lessonId: { userId: req.userId, lessonId: task.lessonId },
          },
          data: { score: { increment: task.xpReward } },
        }),
        prisma.userXpHistory.create({
          data: {
            userId: req.userId,
            amount: task.xpReward,
            source: 'TASK_CORRECT',
            taskAttemptId: attempt.id,
          },
        }),
      ])
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
      pairResults,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
