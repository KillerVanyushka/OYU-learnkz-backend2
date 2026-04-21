const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')
const requireRole = require('../middlewares/requireRole')

const staff = [requireAuth, requireRole('ADMIN', 'MODERATOR')]

const ALLOWED_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const ALLOWED_TASK_TYPES = ['SENTENCE_BUILD', 'AUDIO_DICTATION', 'AUDIO_TRANSLATE']
const ALLOWED_LANGS = ['KZ', 'RU', 'EN']

function normalizeLevel(level) {
  const value = String(level || '').trim().toUpperCase()
  return ALLOWED_LEVELS.includes(value) ? value : null
}

function normalizeTaskType(type) {
  const value = String(type || '').trim().toUpperCase()
  return ALLOWED_TASK_TYPES.includes(value) ? value : null
}

function normalizeLang(lang) {
  const value = String(lang || '').trim().toUpperCase()
  return ALLOWED_LANGS.includes(value) ? value : null
}

// GET /api/admin/lessons
router.get('/lessons', requireAuth, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        lectureText: true,
        level: true,
        orderIndex: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ level: 'asc' }, { orderIndex: 'asc' }, { id: 'asc' }],
    })

    res.json(lessons)
  } catch (err) {
    console.error('GET /api/admin/lessons error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// POST /api/admin/lessons
router.post('/lessons', ...staff, async (req, res) => {
  try {
    const { title, description, lectureText, orderIndex, level } = req.body || {}

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'title is required' })
    }

    const normalizedLevel = normalizeLevel(level ?? 'A0')
    if (!normalizedLevel) {
      return res.status(400).json({
        message: `level must be one of: ${ALLOWED_LEVELS.join(', ')}`,
      })
    }

    const parsedOrderIndex = Number(orderIndex)
    const lesson = await prisma.lesson.create({
      data: {
        title: String(title).trim(),
        level: normalizedLevel,
        description: description ? String(description).trim() : null,
        lectureText: lectureText ? String(lectureText).trim() : null,
        orderIndex: Number.isFinite(parsedOrderIndex) ? parsedOrderIndex : 0,
      },
      select: {
        id: true,
        title: true,
        description: true,
        lectureText: true,
        level: true,
        orderIndex: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.status(201).json({
      message: 'Lesson created successfully',
      lesson,
    })
  } catch (err) {
    console.error('POST /api/admin/lessons error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// PATCH /api/admin/lessons/:id
router.patch('/lessons/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid lesson id' })
    }

    const { title, description, lectureText, orderIndex, isArchived, level } = req.body || {}
    const data = {}

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ message: 'title cannot be empty' })
      }
      data.title = String(title).trim()
    }

    if (description !== undefined) {
      data.description = description === null ? null : String(description).trim()
    }

    if (lectureText !== undefined) {
      data.lectureText = lectureText === null ? null : String(lectureText).trim()
    }

    if (orderIndex !== undefined) {
      const parsedOrderIndex = Number(orderIndex)
      if (!Number.isFinite(parsedOrderIndex)) {
        return res.status(400).json({ message: 'orderIndex must be a number' })
      }
      data.orderIndex = parsedOrderIndex
    }

    if (typeof isArchived === 'boolean') {
      data.isArchived = isArchived
    }

    if (level !== undefined) {
      const normalizedLevel = normalizeLevel(level)
      if (!normalizedLevel) {
        return res.status(400).json({
          message: `level must be one of: ${ALLOWED_LEVELS.join(', ')}`,
        })
      }
      data.level = normalizedLevel
    }

    const lesson = await prisma.lesson.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        lectureText: true,
        level: true,
        orderIndex: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.json({
      message: 'Lesson updated successfully',
      lesson,
    })
  } catch (err) {
    console.error('PATCH /api/admin/lessons/:id error:', err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Lesson not found' })
    }
    res.status(500).json({ message: 'Server error' })
  }
})

// PATCH /api/admin/lessons/:id/archive
router.patch('/lessons/:id/archive', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { isArchived } = req.body || {}

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid lesson id' })
    }

    if (typeof isArchived !== 'boolean') {
      return res.status(400).json({ message: 'isArchived boolean required' })
    }

    const lesson = await prisma.lesson.update({
      where: { id },
      data: { isArchived },
      select: {
        id: true,
        title: true,
        description: true,
        lectureText: true,
        level: true,
        orderIndex: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.json({
      message: isArchived
          ? 'Lesson archived successfully'
          : 'Lesson unarchived successfully',
      lesson,
    })
  } catch (err) {
    console.error('PATCH /api/admin/lessons/:id/archive error:', err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Lesson not found' })
    }
    res.status(500).json({ message: 'Server error' })
  }
})

// POST /api/admin/lessons/:id/tasks
router.post('/lessons/:id/tasks', ...staff, async (req, res) => {
  try {
    const lessonId = Number(req.params.id)
    if (Number.isNaN(lessonId)) {
      return res.status(400).json({ message: 'Invalid lesson id' })
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    })

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' })
    }

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

    const taskType = normalizeTaskType(type ?? 'SENTENCE_BUILD')
    if (!taskType) {
      return res.status(400).json({
        message: `type must be one of: ${ALLOWED_TASK_TYPES.join(', ')}`,
      })
    }

    const normalizedPromptLang = normalizeLang(promptLang)
    const normalizedTargetLang = normalizeLang(targetLang)

    if (!normalizedPromptLang || !normalizedTargetLang) {
      return res.status(400).json({
        message: `promptLang and targetLang must be one of: ${ALLOWED_LANGS.join(', ')}`,
      })
    }

    if (taskType === 'SENTENCE_BUILD') {
      if (!promptText || !String(promptText).trim()) {
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
      if (!audioUrl || !String(audioUrl).trim()) {
        return res
            .status(400)
            .json({ message: 'audioUrl required for AUDIO_DICTATION' })
      }

      if (!audioText || !String(audioText).trim()) {
        return res
            .status(400)
            .json({ message: 'audioText required for AUDIO_DICTATION' })
      }
    }

    if (taskType === 'AUDIO_TRANSLATE') {
      if (!audioUrl || !String(audioUrl).trim()) {
        return res
            .status(400)
            .json({ message: 'audioUrl required for AUDIO_TRANSLATE' })
      }

      if (!translateText || !String(translateText).trim()) {
        return res
            .status(400)
            .json({ message: 'translateText required for AUDIO_TRANSLATE' })
      }
    }

    const parsedXpReward = Number(xpReward)
    const parsedOrderIndex = Number(orderIndex)

    const task = await prisma.task.create({
      data: {
        lessonId,
        type: taskType,
        promptLang: normalizedPromptLang,
        targetLang: normalizedTargetLang,

        promptText: taskType === 'SENTENCE_BUILD' ? String(promptText).trim() : null,
        optionsWords: taskType === 'SENTENCE_BUILD' ? optionsWords : undefined,
        correctWords: taskType === 'SENTENCE_BUILD' ? correctWords : undefined,

        audioUrl: taskType !== 'SENTENCE_BUILD' ? String(audioUrl).trim() : null,
        audioText:
            taskType === 'AUDIO_DICTATION'
                ? String(audioText).trim()
                : (audioText ? String(audioText).trim() : null),
        translateText:
            taskType === 'AUDIO_TRANSLATE' ? String(translateText).trim() : null,

        xpReward: Number.isFinite(parsedXpReward) ? parsedXpReward : 10,
        orderIndex: Number.isFinite(parsedOrderIndex) ? parsedOrderIndex : 0,
      },
    })

    return res.status(201).json({
      message: 'Task created successfully',
      task,
    })
  } catch (err) {
    console.error('POST /api/admin/lessons/:id/tasks error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// PATCH /api/admin/tasks/:id
router.patch('/tasks/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid task id' })
    }

    const {
      type,
      promptLang,
      targetLang,
      promptText,
      optionsWords,
      correctWords,
      xpReward,
      orderIndex,
      isArchived,
      audioUrl,
      audioText,
      translateText,
    } = req.body || {}

    const data = {}

    if (type !== undefined) {
      const normalizedType = normalizeTaskType(type)
      if (!normalizedType) {
        return res.status(400).json({
          message: `type must be one of: ${ALLOWED_TASK_TYPES.join(', ')}`,
        })
      }
      data.type = normalizedType
    }

    if (promptLang !== undefined) {
      const normalizedPromptLang = normalizeLang(promptLang)
      if (!normalizedPromptLang) {
        return res.status(400).json({
          message: `promptLang must be one of: ${ALLOWED_LANGS.join(', ')}`,
        })
      }
      data.promptLang = normalizedPromptLang
    }

    if (targetLang !== undefined) {
      const normalizedTargetLang = normalizeLang(targetLang)
      if (!normalizedTargetLang) {
        return res.status(400).json({
          message: `targetLang must be one of: ${ALLOWED_LANGS.join(', ')}`,
        })
      }
      data.targetLang = normalizedTargetLang
    }

    if (promptText !== undefined) {
      data.promptText = promptText === null ? null : String(promptText).trim()
    }

    if (optionsWords !== undefined) {
      if (!Array.isArray(optionsWords)) {
        return res.status(400).json({ message: 'optionsWords must be an array' })
      }
      data.optionsWords = optionsWords
    }

    if (correctWords !== undefined) {
      if (!Array.isArray(correctWords)) {
        return res.status(400).json({ message: 'correctWords must be an array' })
      }
      data.correctWords = correctWords
    }

    if (xpReward !== undefined) {
      const parsedXpReward = Number(xpReward)
      if (!Number.isFinite(parsedXpReward)) {
        return res.status(400).json({ message: 'xpReward must be a number' })
      }
      data.xpReward = parsedXpReward
    }

    if (orderIndex !== undefined) {
      const parsedOrderIndex = Number(orderIndex)
      if (!Number.isFinite(parsedOrderIndex)) {
        return res.status(400).json({ message: 'orderIndex must be a number' })
      }
      data.orderIndex = parsedOrderIndex
    }

    if (typeof isArchived === 'boolean') {
      data.isArchived = isArchived
    }

    if (audioUrl !== undefined) {
      data.audioUrl = audioUrl === null ? null : String(audioUrl).trim()
    }

    if (audioText !== undefined) {
      data.audioText = audioText === null ? null : String(audioText).trim()
    }

    if (translateText !== undefined) {
      data.translateText = translateText === null ? null : String(translateText).trim()
    }

    const task = await prisma.task.update({
      where: { id },
      data,
    })

    res.json({
      message: 'Task updated successfully',
      task,
    })
  } catch (err) {
    console.error('PATCH /api/admin/tasks/:id error:', err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Task not found' })
    }
    res.status(500).json({ message: 'Server error' })
  }
})

// PATCH /api/admin/tasks/:id/archive
router.patch('/tasks/:id/archive', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { isArchived } = req.body || {}

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid task id' })
    }

    if (typeof isArchived !== 'boolean') {
      return res.status(400).json({ message: 'isArchived boolean required' })
    }

    const task = await prisma.task.update({
      where: { id },
      data: { isArchived },
    })

    res.json({
      message: isArchived
          ? 'Task archived successfully'
          : 'Task unarchived successfully',
      task,
    })
  } catch (err) {
    console.error('PATCH /api/admin/tasks/:id/archive error:', err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Task not found' })
    }
    res.status(500).json({ message: 'Server error' })
  }
})

// DELETE /api/admin/tasks/:id
router.delete('/tasks/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid task id' })
    }

    await prisma.task.delete({ where: { id } })

    return res.json({ message: 'Task deleted' })
  } catch (err) {
    console.error('DELETE /api/admin/tasks/:id error:', err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Task not found' })
    }
    return res.status(500).json({ message: 'Server error' })
  }
})

// DELETE /api/admin/lessons/:id
router.delete('/lessons/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid lesson id' })
    }

    await prisma.lesson.delete({ where: { id } })

    return res.json({ message: 'Lesson deleted' })
  } catch (err) {
    console.error('DELETE /api/admin/lessons/:id error:', err)

    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Lesson not found' })
    }

    if (err.code === 'P2003') {
      return res.status(409).json({
        message:
            'Cannot delete lesson because it has related tasks. Enable cascade delete in Prisma schema.',
      })
    }

    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
