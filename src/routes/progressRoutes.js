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

function buildLessonGroups(lessons) {
  const groupedByLevel = new Map()

  for (const lesson of lessons) {
    if (!groupedByLevel.has(lesson.level)) {
      groupedByLevel.set(lesson.level, [])
    }
    groupedByLevel.get(lesson.level).push(lesson)
  }

  const orderedLevels = [...groupedByLevel.keys()].sort(
    (a, b) => (LEVEL_ORDER[a] ?? 0) - (LEVEL_ORDER[b] ?? 0),
  )

  const groups = []
  for (const level of orderedLevels) {
    const levelLessons = groupedByLevel.get(level).sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
      return a.id - b.id
    })

    for (let i = 0; i < levelLessons.length; i += 6) {
      groups.push({
        level,
        groupIndex: Math.floor(i / 6),
        lessons: levelLessons.slice(i, i + 6),
      })
    }
  }

  return groups
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
        description: true,
        lectureText: true,
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
      description: l.description,
      lectureText: l.lectureText,
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
            description: true,
            lectureText: true,
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
      description: r.lesson.description,
      lectureText: r.lesson.lectureText,
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
          select: {
            title: true,
            description: true,
            lectureText: true,
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
      description: r.lesson.description,
      lectureText: r.lesson.lectureText,
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
      select: {
        id: true,
        title: true,
        description: true,
        lectureText: true,
        level: true,
        orderIndex: true,
      },
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
        description: l.description,
        lectureText: l.lectureText,
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

// GET /api/progress/xp-stats
router.get('/xp-stats', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { xp: true },
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const rows = await prisma.userXpHistory.findMany({
      where: { userId: req.userId },
      select: {
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const byDay = new Map()

    for (const row of rows) {
      const isoDay = new Date(row.createdAt).toISOString().slice(0, 10)
      byDay.set(isoDay, (byDay.get(isoDay) || 0) + (row.amount || 0))
    }

    const now = new Date()
    const startOfToday = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ))

    const dailyXp = rows
      .filter((row) => new Date(row.createdAt) >= startOfToday)
      .reduce((sum, row) => sum + (row.amount || 0), 0)

    const startOfWeek = new Date(startOfToday)
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 6)

    const weeklyXp = rows
      .filter((row) => new Date(row.createdAt) >= startOfWeek)
      .reduce((sum, row) => sum + (row.amount || 0), 0)

    const historyAllTimeXp = rows.reduce((sum, row) => sum + (row.amount || 0), 0)
    const allTimeXp = Math.max(historyAllTimeXp, user.xp || 0)

    const dayTotals = Array.from(byDay.values())
    const bestDayXp = dayTotals.length ? Math.max(...dayTotals) : 0

    const sortedDays = Array.from(byDay.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )
    let bestWeekXp = 0
    for (let i = 0; i < sortedDays.length; i += 1) {
      let windowSum = 0
      for (let j = i; j < sortedDays.length; j += 1) {
        const start = new Date(`${sortedDays[i][0]}T00:00:00.000Z`)
        const end = new Date(`${sortedDays[j][0]}T00:00:00.000Z`)
        const diffDays = Math.floor((end - start) / 86400000)
        if (diffDays > 6) break
        windowSum += sortedDays[j][1]
      }
      if (windowSum > bestWeekXp) bestWeekXp = windowSum
    }

    const activeDays = dayTotals.length
    const averagePerActiveDay = activeDays
      ? Math.round(allTimeXp / activeDays)
      : 0

    res.json({
      dailyXp,
      weeklyXp,
      allTimeXp,
      bestDayXp,
      bestWeekXp,
      averagePerActiveDay,
      activeDays,
      currentXp: user.xp || 0,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/progress/circle-rewards
router.get('/circle-rewards', requireAuth, async (req, res) => {
  try {
    const claims = await prisma.circleRewardClaim.findMany({
      where: { userId: req.userId },
      select: {
        level: true,
        groupIndex: true,
        reward: true,
        claimedAt: true,
      },
      orderBy: [{ level: 'asc' }, { groupIndex: 'asc' }],
    })

    return res.json(claims)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// POST /api/progress/circle-rewards/claim
router.post('/circle-rewards/claim', requireAuth, async (req, res) => {
  try {
    const level = String(req.body?.level || '')
      .trim()
      .toUpperCase()
    const groupIndex = Number.parseInt(req.body?.groupIndex, 10)

    if (!(level in LEVEL_ORDER)) {
      return res.status(400).json({ message: 'Invalid level' })
    }

    if (!Number.isInteger(groupIndex) || groupIndex < 0) {
      return res.status(400).json({ message: 'Invalid groupIndex' })
    }

    const existingClaim = await prisma.circleRewardClaim.findUnique({
      where: {
        userId_level_groupIndex: {
          userId: req.userId,
          level,
          groupIndex,
        },
      },
      select: { id: true, reward: true, claimedAt: true },
    })

    if (existingClaim) {
      return res.json({
        alreadyClaimed: true,
        earnedSilvEgg: 0,
        reward: existingClaim.reward,
        claimedAt: existingClaim.claimedAt,
      })
    }

    const lessons = await prisma.lesson.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        level: true,
        orderIndex: true,
      },
      orderBy: [{ level: 'asc' }, { orderIndex: 'asc' }, { id: 'asc' }],
    })

    const targetGroup = buildLessonGroups(lessons).find(
      (group) => group.level === level && group.groupIndex === groupIndex,
    )

    if (!targetGroup || targetGroup.lessons.length !== 6) {
      return res.status(404).json({ message: 'Circle reward group not found' })
    }

    const progresses = await prisma.progress.findMany({
      where: {
        userId: req.userId,
        lessonId: { in: targetGroup.lessons.map((lesson) => lesson.id) },
      },
      select: {
        lessonId: true,
        status: true,
      },
    })

    const completedLessonIds = new Set(
      progresses
        .filter((item) => item.status === 'COMPLETED')
        .map((item) => item.lessonId),
    )

    const allCompleted = targetGroup.lessons.every((lesson) =>
      completedLessonIds.has(lesson.id),
    )

    if (!allCompleted) {
      return res.status(400).json({
        message: 'Complete all 6 lessons in this circle first',
      })
    }

    const reward = 5

    await prisma.$transaction([
      prisma.circleRewardClaim.create({
        data: {
          userId: req.userId,
          level,
          groupIndex,
          reward,
        },
      }),
      prisma.user.update({
        where: { id: req.userId },
        data: {
          silvEgg: { increment: reward },
        },
      }),
    ])

    return res.json({
      alreadyClaimed: false,
      earnedSilvEgg: reward,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
