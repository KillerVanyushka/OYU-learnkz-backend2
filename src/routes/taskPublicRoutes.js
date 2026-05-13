const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')
const { buildMatchingOptions } = require('../utils/taskMatching')

const LEVEL_ORDER = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 }

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id))
      return res.status(400).json({ message: 'Invalid task id' })

    const task = await prisma.task.findFirst({
      where: { id, isArchived: false, lesson: { isArchived: false } },
      select: {
        id: true,
        lessonId: true,
        type: true,
        promptLang: true,
        targetLang: true,
        promptText: true,
        optionsWords: true,
        xpReward: true,
        orderIndex: true,
        // для аудио
        audioUrl: true,
        // НЕ отдаём правильные ответы пользователю:
        // audioText / translateText / correctWords — не включаем
        lesson: { select: { level: true } },
      },
    })

    if (!task) return res.status(404).json({ message: 'Task not found' })

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { level: true },
    })
    if (!user) return res.status(404).json({ message: 'User not found' })

    const userRank = LEVEL_ORDER[user.level ?? 'A0']
    const lessonRank = LEVEL_ORDER[task.lesson.level ?? 'A0']

    if (lessonRank > userRank) {
      return res
        .status(403)
        .json({ message: 'Lesson is locked for your level' })
    }

    // убираем вложенную lesson из ответа
    const { lesson, ...cleanTask } = task
    if (cleanTask.type === 'WORD_MATCH') {
      cleanTask.matchingOptions = buildMatchingOptions(cleanTask.optionsWords)
      delete cleanTask.optionsWords
    }
    return res.json(cleanTask)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
