const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')

const LEVEL_ORDER = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 }

// GET /api/lessons - список уроков (без архивных)
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { level: true },
    })

    const userRank = LEVEL_ORDER[user?.level ?? 'A0']

    const lessons = await prisma.lesson.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        title: true,
        description: true,
        level: true,
        orderIndex: true,
      },
      orderBy: [{ level: 'asc' }, { orderIndex: 'asc' }, { id: 'asc' }],
    })

    const decentLessons = lessons.filter(
      (l) => LEVEL_ORDER[l.level] <= userRank,
    )

    res.json(decentLessons)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/lessons/:id/tasks - задания урока (без архивных)
router.get('/:id/tasks', requireAuth, async (req, res) => {
  try {
    const lessonId = Number(req.params.id)
    if (Number.isNaN(lessonId))
      return res.status(400).json({ message: 'Invalid lesson id' })

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { level: true },
    })
    const userRank = LEVEL_ORDER[user?.level ?? 'A0']

    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, isArchived: false },
      select: { id: true, level: true },
    })

    if (!lesson) return res.status(404).json({ message: 'Lesson not found' })

    if (LEVEL_ORDER[lesson.level] > userRank) {
      return res
        .status(403)
        .json({ message: 'Lesson is locked for your level' })
    }

    const tasks = await prisma.task.findMany({
      where: { lessonId, isArchived: false },
      select: {
        id: true,
        type: true,
        promptLang: true,
        targetLang: true,
        promptText: true,
        optionsWords: true,
        xpReward: true,
        orderIndex: true,
      },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    })

    res.json(tasks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
