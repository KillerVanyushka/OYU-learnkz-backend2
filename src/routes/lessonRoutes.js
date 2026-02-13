const router = require('express').Router()
const prisma = require('../utils/prisma')

// GET /api/lessons - список уроков (без архивных)
router.get('/', async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        title: true,
        description: true,
        orderIndex: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    })
    res.json(lessons)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/lessons/:id/tasks - задания урока (без архивных)
router.get('/:id/tasks', async (req, res) => {
  try {
    const lessonId = Number(req.params.id)
    if (Number.isNaN(lessonId))
      return res.status(400).json({ message: 'Invalid lesson id' })

    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, isArchived: false },
      select: { id: true },
    })

    if (!lesson) return res.status(404).json({ message: 'Lesson not found' })

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
