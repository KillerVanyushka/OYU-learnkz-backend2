const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')
const requireRole = require('../middlewares/requireRole')

// ADMIN + MODERATOR
const staff = [requireAuth, requireRole('ADMIN', 'MODERATOR')]

// POST /api/admin/lessons
router.post('/lessons', ...staff, async (req, res) => {
  try {
    const { title, description, orderIndex, level } = req.body
    if (!title) return res.status(400).json({ message: 'title is required' })

    const lesson = await prisma.lesson.create({
      data: {
        title,
        level: level ?? 'A0',
        description: description ?? null,
        orderIndex: Number.isFinite(orderIndex) ? orderIndex : 0,
      },
    })

    res.status(201).json(lesson)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// PATCH /api/admin/lessons/:id
router.patch('/lessons/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id))
      return res.status(400).json({ message: 'Invalid lesson id' })

    const { title, description, orderIndex, isArchived, level } = req.body

    const lesson = await prisma.lesson.update({
      where: { id },
      data: {
        title: title ?? undefined,
        description: description ?? undefined,
        orderIndex: Number.isFinite(orderIndex) ? orderIndex : undefined,
        isArchived: typeof isArchived === 'boolean' ? isArchived : undefined,
        level: level ?? undefined,
      },
    })

    res.json(lesson)
  } catch (err) {
    console.error(err)
    if (err.code === 'P2025')
      return res.status(404).json({ message: 'Lesson not found' })
    res.status(500).json({ message: 'Server error' })
  }
})

// PATCH /api/admin/lessons/:id/archive  body: { isArchived: true/false }
router.patch('/lessons/:id/archive', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { isArchived } = req.body
    if (Number.isNaN(id))
      return res.status(400).json({ message: 'Invalid lesson id' })
    if (typeof isArchived !== 'boolean')
      return res.status(400).json({ message: 'isArchived boolean required' })

    const lesson = await prisma.lesson.update({
      where: { id },
      data: { isArchived },
    })

    res.json(lesson)
  } catch (err) {
    console.error(err)
    if (err.code === 'P2025')
      return res.status(404).json({ message: 'Lesson not found' })
    res.status(500).json({ message: 'Server error' })
  }
})

// POST /api/admin/lessons/:id/tasks
router.post('/lessons/:id/tasks', ...staff, async (req, res) => {
  try {
    const lessonId = Number(req.params.id)
    if (Number.isNaN(lessonId))
      return res.status(400).json({ message: 'Invalid lesson id' })

    const {
      promptLang,
      targetLang,
      promptText,
      optionsWords,
      correctWords,
      xpReward,
      orderIndex,
    } = req.body

    if (!promptLang || !targetLang || !promptText) {
      return res
        .status(400)
        .json({ message: 'promptLang, targetLang, promptText required' })
    }
    if (!Array.isArray(optionsWords) || !Array.isArray(correctWords)) {
      return res
        .status(400)
        .json({ message: 'optionsWords and correctWords must be arrays' })
    }

    const task = await prisma.task.create({
      data: {
        lessonId,
        type: 'SENTENCE_BUILD',
        promptLang,
        targetLang,
        promptText,
        optionsWords,
        correctWords,
        xpReward: Number.isFinite(xpReward) ? xpReward : 10,
        orderIndex: Number.isFinite(orderIndex) ? orderIndex : 0,
      },
    })

    res.status(201).json(task)
  } catch (err) {
    console.error(err)
    // Prisma может ругаться на enum значения
    res.status(500).json({ message: 'Server error' })
  }
})

// PATCH /api/admin/tasks/:id
router.patch('/tasks/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id))
      return res.status(400).json({ message: 'Invalid task id' })

    const {
      promptLang,
      targetLang,
      promptText,
      optionsWords,
      correctWords,
      xpReward,
      orderIndex,
      isArchived,
    } = req.body

    const task = await prisma.task.update({
      where: { id },
      data: {
        promptLang: promptLang ?? undefined,
        targetLang: targetLang ?? undefined,
        promptText: promptText ?? undefined,
        optionsWords: Array.isArray(optionsWords) ? optionsWords : undefined,
        correctWords: Array.isArray(correctWords) ? correctWords : undefined,
        xpReward: Number.isFinite(xpReward) ? xpReward : undefined,
        orderIndex: Number.isFinite(orderIndex) ? orderIndex : undefined,
        isArchived: typeof isArchived === 'boolean' ? isArchived : undefined,
      },
    })

    res.json(task)
  } catch (err) {
    console.error(err)
    if (err.code === 'P2025')
      return res.status(404).json({ message: 'Task not found' })
    res.status(500).json({ message: 'Server error' })
  }
})

// PATCH /api/admin/tasks/:id/archive body: { isArchived: true/false }
router.patch('/tasks/:id/archive', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { isArchived } = req.body
    if (Number.isNaN(id))
      return res.status(400).json({ message: 'Invalid task id' })
    if (typeof isArchived !== 'boolean')
      return res.status(400).json({ message: 'isArchived boolean required' })

    const task = await prisma.task.update({
      where: { id },
      data: { isArchived },
    })

    res.json(task)
  } catch (err) {
    console.error(err)
    if (err.code === 'P2025')
      return res.status(404).json({ message: 'Task not found' })
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
