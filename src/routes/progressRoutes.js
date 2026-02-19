const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')

const LEVEL_ORDER = {
  A0: 0,
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
}

// 1) Статус конкретного урока для текущего пользователя
// GET /api/progress/lessons/:lessonId
router.get('/lessons/:lessonId', requireAuth, async (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId)
    if (Number.isNaN(lessonId))
      return res.status(400).json({ message: 'Invalid lessonId' })

    const progress = await prisma.progress.findUnique({
      where: { userId_lessonId: { userId: req.userId, lessonId } },
      select: { status: true, score: true, updatedAt: true },
    })

    // если ещё не начинал урок — возвращаем NOT_STARTED
    return res.json(progress ?? { status: 'NOT_STARTED', score: 0 })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// 2) Список уроков + статус для текущего пользователя
// GET /api/progress/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        title: true,
        level: true,
        orderIndex: true,
      },
      orderBy: [{ level: 'asc' }, { orderIndex: 'asc' }, { id: 'asc' }],
    })

    const progresses = await prisma.progress.findMany({
      where: { userId: req.userId },
      select: { lessonId: true, status: true, score: true, updatedAt: true },
    })

    const map = new Map(progresses.map((p) => [p.lessonId, p]))
    const result = lessons.map((l) => ({
      lessonId: l.id,
      title: l.title,
      level: l.level,
      orderIndex: l.orderIndex,
      status: map.get(l.id)?.status ?? 'NOT_STARTED',
      score: map.get(l.id)?.score ?? 0,
      updatedAt: map.get(l.id)?.updatedAt ?? null,
    }))

    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// 3) Какие уровни прошёл пользователь
// GET /api/progress/levels
// Логика: уровень считается пройденным, если ВСЕ уроки этого уровня (не архивные) имеют Progress.status=COMPLETED
router.get('/levels', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { level: true, xp: true },
    })

    const lessons = await prisma.lesson.findMany({
      where: { isArchived: false },
      select: { id: true, level: true },
    })

    const progresses = await prisma.progress.findMany({
      where: { userId: req.userId },
      select: { lessonId: true, status: true },
    })

    const statusByLesson = new Map(
      progresses.map((p) => [p.lessonId, p.status]),
    )

    // сгруппируем уроки по уровню
    const byLevel = new Map() // level -> lessonIds[]
    for (const l of lessons) {
      if (!byLevel.has(l.level)) byLevel.set(l.level, [])
      byLevel.get(l.level).push(l.id)
    }

    const passedLevels = []
    for (const [level, lessonIds] of byLevel.entries()) {
      if (lessonIds.length === 0) continue

      const allCompleted = lessonIds.every(
        (id) => statusByLesson.get(id) === 'COMPLETED',
      )
      if (allCompleted) passedLevels.push(level)
    }

    res.json({
      currentLevel: user?.level ?? 'A0',
      xp: user?.xp ?? 0,
      passedLevels,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

//api/progress/completed
router.get('/completed', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.progress.findMany({
      where: {
        userId: req.userId,
        status: 'COMPLETED',
        lesson: { isArchived: false },
      },
      select: {
        lessonId: true,
        status: true,
        score: true,
        updatedAt: true,
        lesson: {
          select: {
            title: true,
            level: true,
            orderIndex: true,
          },
        },
      },
      orderBy: [
        { lesson: { level: 'asc' } },
        { lesson: { orderIndex: 'asc' } },
      ],
    })

    const result = rows.map((r) => ({
      lessonId: r.lessonId,
      title: r.lesson.title,
      level: r.lesson.level,
      orderIndex: r.lesson.orderIndex,
      score: r.score,
      updatedAt: r.updatedAt,
    }))

    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

///api/progress/in-progress
router.get('/in-progress', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.progress.findMany({
      where: {
        userId: req.userId,
        status: 'IN_PROGRESS',
        lesson: { isArchived: false },
      },
      select: {
        lessonId: true,
        score: true,
        updatedAt: true,
        lesson: {
          select: { title: true, level: true, orderIndex: true },
        },
      },
      orderBy: [
        { lesson: { level: 'asc' } },
        { lesson: { orderIndex: 'asc' } },
      ],
    })

    const result = rows.map((r) => ({
      lessonId: r.lessonId,
      title: r.lesson.title,
      level: r.lesson.level,
      orderIndex: r.lesson.orderIndex,
      score: r.score,
      updatedAt: r.updatedAt,
    }))

    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

//api/progress/not-started
router.get('/not-started', requireAuth, async (req, res) => {
  try {
    // 1️⃣ получаем уровень пользователя
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { level: true },
    })

    if (!user) return res.status(404).json({ message: 'User not found' })

    const userLevelOrder = LEVEL_ORDER[user.level]

    // 2️⃣ получаем только доступные уроки
    const lessons = await prisma.lesson.findMany({
      where: {
        isArchived: false,
      },
      select: { id: true, title: true, level: true, orderIndex: true },
      orderBy: [{ level: 'asc' }, { orderIndex: 'asc' }, { id: 'asc' }],
    })

    // 3️⃣ фильтруем по уровню
    const allowedLessons = lessons.filter(
      (l) => LEVEL_ORDER[l.level] <= userLevelOrder,
    )

    // 4️⃣ получаем прогресс
    const progresses = await prisma.progress.findMany({
      where: { userId: req.userId },
      select: { lessonId: true },
    })

    const startedIds = new Set(progresses.map((p) => p.lessonId))

    const result = allowedLessons
      .filter((l) => !startedIds.has(l.id))
      .map((l) => ({
        lessonId: l.id,
        title: l.title,
        level: l.level,
        orderIndex: l.orderIndex,
        score: 0,
        updatedAt: null,
      }))

    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
