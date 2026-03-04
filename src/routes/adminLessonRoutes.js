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
      type,
      promptLang,
      targetLang,
      promptText,
      optionsWords,
      correctWords,
      xpReward,
      orderIndex,
      audioUrl,
      audioText,
      translateText,
    } = req.body || {}

    const taskType = type ?? 'SENTENCE_BUILD'

    // базовые проверки
    if (!promptLang || !targetLang) {
      return res
        .status(400)
        .json({ message: 'promptLang and targetLang required' })
    }

    // валидация по типу
    if (taskType === 'SENTENCE_BUILD') {
      if (!promptText) {
        return res
          .status(400)
          .json({ message: 'promptText required for SENTENCE_BUILD' })
      }
      if (!Array.isArray(optionsWords) || !Array.isArray(correctWords)) {
        return res
          .status(400)
          .json({ message: 'optionsWords and correctWords must be arrays' })
      }
      if (correctWords.length === 0) {
        return res
          .status(400)
          .json({ message: 'correctWords must be non-empty' })
      }
    }

    if (taskType === 'AUDIO_DICTATION') {
      if (!audioUrl)
        return res
          .status(400)
          .json({ message: 'audioUrl required for AUDIO_DICTATION' })
      if (!audioText)
        return res
          .status(400)
          .json({ message: 'audioText required for AUDIO_DICTATION' })
    }

    if (taskType === 'AUDIO_TRANSLATE') {
      if (!audioUrl)
        return res
          .status(400)
          .json({ message: 'audioUrl required for AUDIO_TRANSLATE' })
      if (!translateText) {
        return res
          .status(400)
          .json({ message: 'translateText required for AUDIO_TRANSLATE' })
      }
      // audioText можно не требовать, но можно хранить если есть
    }

    const task = await prisma.task.create({
      data: {
        lessonId,
        type: taskType,

        promptLang,
        targetLang,

        // для SENTENCE_BUILD
        promptText: taskType === 'SENTENCE_BUILD' ? promptText : null,
        optionsWords: taskType === 'SENTENCE_BUILD' ? optionsWords : undefined,
        correctWords: taskType === 'SENTENCE_BUILD' ? correctWords : undefined,

        // для AUDIO
        audioUrl: taskType !== 'SENTENCE_BUILD' ? audioUrl : null,
        audioText:
          taskType === 'AUDIO_DICTATION' ? audioText : (audioText ?? null),
        translateText: taskType === 'AUDIO_TRANSLATE' ? translateText : null,

        xpReward: Number.isFinite(xpReward) ? xpReward : 10,
        orderIndex: Number.isFinite(orderIndex) ? orderIndex : 0,
      },
    })

    return res.status(201).json(task)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
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

// DELETE /api/admin/tasks/:id  (удалить задание полностью)
router.delete('/tasks/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id))
      return res.status(400).json({ message: 'Invalid task id' })

    await prisma.task.delete({ where: { id } })

    return res.json({ message: 'Task deleted' })
  } catch (err) {
    console.error(err)
    if (err.code === 'P2025')
      return res.status(404).json({ message: 'Task not found' })
    return res.status(500).json({ message: 'Server error' })
  }
})

// DELETE /api/admin/lessons/:id  (удалить урок полностью + задачи каскадом)
router.delete('/lessons/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id))
      return res.status(400).json({ message: 'Invalid lesson id' })

    await prisma.lesson.delete({ where: { id } })

    return res.json({ message: 'Lesson deleted' })
  } catch (err) {
    console.error(err)

    // если каскад не настроен, может упасть с FK constraint
    if (err.code === 'P2025')
      return res.status(404).json({ message: 'Lesson not found' })

    // Prisma может вернуть P2003 (foreign key constraint failed)
    if (err.code === 'P2003')
      return res.status(409).json({
        message:
          'Cannot delete lesson because it has related tasks. Enable cascade delete in Prisma schema.',
      })

    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
