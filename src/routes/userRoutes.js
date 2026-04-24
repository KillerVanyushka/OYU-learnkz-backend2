const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')

const ONBOARDING_QUESTIONNAIRE = {
  goals: [
    'Учёба',
    'Работа',
    'Путешествия',
    'Общение с друзьями/семьёй',
    'Переезд',
    'Другое',
  ],
  studyMinutesDaily: [5, 10, 15, 30],
  currentLevels: [
    'Никогда не изучал (A0)',
    'Начальный (A1)',
    'Средний (A2–B1)',
    'Продвинутый',
  ],
  learningStyles: ['Читать', 'Слушать', 'Писать', 'Комбинированно'],
  focusAreas: ['Разговор', 'Понимание на слух', 'Грамматика', 'Словарный запас'],
  preferredPaces: ['Лёгкий', 'Средний', 'Интенсивный'],
}

function normalizeTextAnswer(value) {
  return String(value || '').trim()
}

function validateOnboardingPayload(body) {
  const goal = normalizeTextAnswer(body?.goal)
  const studyMinutesDaily = Number(body?.studyMinutesDaily)
  const currentLevel = normalizeTextAnswer(body?.currentLevel)
  const learningStyle = normalizeTextAnswer(body?.learningStyle)
  const focusArea = normalizeTextAnswer(body?.focusArea)
  const preferredPace = normalizeTextAnswer(body?.preferredPace)

  if (!ONBOARDING_QUESTIONNAIRE.goals.includes(goal)) {
    return { error: `goal must be one of: ${ONBOARDING_QUESTIONNAIRE.goals.join(', ')}` }
  }

  if (!ONBOARDING_QUESTIONNAIRE.studyMinutesDaily.includes(studyMinutesDaily)) {
    return {
      error: `studyMinutesDaily must be one of: ${ONBOARDING_QUESTIONNAIRE.studyMinutesDaily.join(', ')}`,
    }
  }

  if (!ONBOARDING_QUESTIONNAIRE.currentLevels.includes(currentLevel)) {
    return {
      error: `currentLevel must be one of: ${ONBOARDING_QUESTIONNAIRE.currentLevels.join(', ')}`,
    }
  }

  if (!ONBOARDING_QUESTIONNAIRE.learningStyles.includes(learningStyle)) {
    return {
      error: `learningStyle must be one of: ${ONBOARDING_QUESTIONNAIRE.learningStyles.join(', ')}`,
    }
  }

  if (!ONBOARDING_QUESTIONNAIRE.focusAreas.includes(focusArea)) {
    return {
      error: `focusArea must be one of: ${ONBOARDING_QUESTIONNAIRE.focusAreas.join(', ')}`,
    }
  }

  if (!ONBOARDING_QUESTIONNAIRE.preferredPaces.includes(preferredPace)) {
    return {
      error: `preferredPace must be one of: ${ONBOARDING_QUESTIONNAIRE.preferredPaces.join(', ')}`,
    }
  }

  return {
    data: {
      goal,
      studyMinutesDaily,
      currentLevel,
      learningStyle,
      focusArea,
      preferredPace,
    },
  }
}

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        username: true,
        email: true,
        level: true,
        role: true,
        streakCount: true,
        streakLastDay: true,
        xp: true,
        createdAt: true,
      },
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/user/me/streak
router.get('/me/streak', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { streakCount: true, streakLastDay: true },
  })
  res.json({
    streak: user?.streakCount ?? 0,
    lastDay: user?.streakLastDay ?? null,
  })
})

// GET /api/user/me/stats
router.get('/me/stats', requireAuth, async (req, res) => {
  try {
    const now = Date.now()
    const dayStart = new Date(now - 24 * 60 * 60 * 1000)
    const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now - 30 * 24 * 60 * 60 * 1000)

    const [
      user,
      completedLessonsCount,
      inProgressLessonsCount,
      completedLecturesCount,
      dayXp,
      weekXp,
      monthXp,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, xp: true },
      }),
      prisma.progress.count({
        where: {
          userId: req.userId,
          status: 'COMPLETED',
          lesson: { isArchived: false },
        },
      }),
      prisma.progress.count({
        where: {
          userId: req.userId,
          status: 'IN_PROGRESS',
          lesson: { isArchived: false },
        },
      }),
      prisma.userLectureProgress.count({
        where: {
          userId: req.userId,
          lesson: {
            isArchived: false,
            lectureText: { not: null },
          },
        },
      }),
      prisma.userXpHistory.aggregate({
        where: {
          userId: req.userId,
          createdAt: { gte: dayStart },
        },
        _sum: { amount: true },
      }),
      prisma.userXpHistory.aggregate({
        where: {
          userId: req.userId,
          createdAt: { gte: weekStart },
        },
        _sum: { amount: true },
      }),
      prisma.userXpHistory.aggregate({
        where: {
          userId: req.userId,
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
    ])

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    return res.json({
      completedLessons: completedLessonsCount,
      inProgressLessons: inProgressLessonsCount,
      completedLectures: completedLecturesCount,
      xp: {
        day: dayXp._sum.amount ?? 0,
        week: weekXp._sum.amount ?? 0,
        month: monthXp._sum.amount ?? 0,
        allTime: user.xp ?? 0,
      },
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

router.get('/onboarding/questions', requireAuth, async (req, res) => {
  return res.json({
    questions: [
      {
        key: 'goal',
        question: 'Зачем вы хотите изучать казахский язык?',
        options: ONBOARDING_QUESTIONNAIRE.goals,
      },
      {
        key: 'studyMinutesDaily',
        question: 'Сколько времени вы готовы уделять в день?',
        options: ONBOARDING_QUESTIONNAIRE.studyMinutesDaily.map((minutes) =>
          minutes >= 30 ? '30+ минут' : `${minutes} минут`,
        ),
      },
      {
        key: 'currentLevel',
        question: 'Ваш уровень:',
        options: ONBOARDING_QUESTIONNAIRE.currentLevels,
      },
      {
        key: 'learningStyle',
        question: 'Как вам удобнее учиться?',
        options: ONBOARDING_QUESTIONNAIRE.learningStyles,
      },
      {
        key: 'focusArea',
        question: 'Что хотите развить в первую очередь?',
        options: ONBOARDING_QUESTIONNAIRE.focusAreas,
      },
      {
        key: 'preferredPace',
        question: 'Какой темп вам подходит?',
        options: ONBOARDING_QUESTIONNAIRE.preferredPaces,
      },
    ],
  })
})

router.get('/onboarding/answers', requireAuth, async (req, res) => {
  try {
    const answers = await prisma.userOnboardingAnswer.findUnique({
      where: { userId: req.userId },
      select: {
        id: true,
        userId: true,
        goal: true,
        studyMinutesDaily: true,
        currentLevel: true,
        learningStyle: true,
        focusArea: true,
        preferredPace: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return res.json({
      answers,
      questions: ONBOARDING_QUESTIONNAIRE,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

router.post('/onboarding/answers', requireAuth, async (req, res) => {
  try {
    const { data, error } = validateOnboardingPayload(req.body)
    if (error) {
      return res.status(400).json({ message: error })
    }

    const answers = await prisma.userOnboardingAnswer.upsert({
      where: { userId: req.userId },
      update: data,
      create: {
        userId: req.userId,
        ...data,
      },
      select: {
        id: true,
        userId: true,
        goal: true,
        studyMinutesDaily: true,
        currentLevel: true,
        learningStyle: true,
        focusArea: true,
        preferredPace: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return res.status(201).json({
      message: 'Onboarding answers saved successfully',
      answers,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// POST /api/user/dictionary
router.post('/dictionary', requireAuth, async (req, res) => {
  try {
    const { word, translationEn, translationRu, description } = req.body || {}

    if (!word || !String(word).trim()) {
      return res.status(400).json({ message: 'word is required' })
    }

    const entry = await prisma.userDictionaryEntry.create({
      data: {
        userId: req.userId,
        word: String(word).trim(),
        translationEn:
          translationEn === undefined || translationEn === null
            ? null
            : String(translationEn).trim(),
        translationRu:
          translationRu === undefined || translationRu === null
            ? null
            : String(translationRu).trim(),
        description:
          description === undefined || description === null
            ? null
            : String(description).trim(),
      },
      select: {
        id: true,
        word: true,
        translationEn: true,
        translationRu: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return res.status(201).json({
      message: 'Word saved to dictionary',
      entry,
    })
  } catch (err) {
    console.error(err)
    if (err.code === 'P2002') {
      return res
        .status(409)
        .json({ message: 'This word is already in your dictionary' })
    }
    return res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/user/dictionary
router.get('/dictionary', requireAuth, async (req, res) => {
  try {
    const entries = await prisma.userDictionaryEntry.findMany({
      where: { userId: req.userId },
      select: {
        id: true,
        word: true,
        translationEn: true,
        translationRu: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })

    return res.json(entries)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// ------------------------------
// FOLLOW CRUD
// БАЗОВЫЕ ЭНДПОИНТЫ:
//
// POST   /api/user/:id/follow      -> подписаться на пользователя :id
// DELETE /api/user/:id/follow      -> отписаться
// GET    /api/user/:id/followers   -> подписчики пользователя :id
// GET    /api/user/:id/following   -> на кого подписан пользователь :id
// GET    /api/user/:id/follow/status -> подписан ли текущий на :id
// GET    /api/user/:id/follow/counts -> количество followers/following у :id
// ------------------------------

// POST /api/user/:id/follow
router.post('/:id/follow', requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id)
    const currentUserId = req.userId

    if (!Number.isInteger(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user id' })
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: "You can't follow yourself" })
    }

    // проверим что цель существует
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    })
    if (!target)
      return res.status(404).json({ message: 'Target user not found' })

    const follow = await prisma.follow.create({
      data: {
        followerId: currentUserId,
        followingId: targetUserId,
      },
      select: {
        id: true,
        followerId: true,
        followingId: true,
        createdAt: true,
      },
    })

    return res.status(201).json({ message: 'Followed', follow })
  } catch (err) {
    console.error(err)
    // P2002 = unique constraint failed (у нас @@unique([followerId, followingId]))
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Already following' })
    }
    return res.status(500).json({ message: 'Server error' })
  }
})

// DELETE /api/user/:id/follow
router.delete('/:id/follow', requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id)
    const currentUserId = req.userId

    if (!Number.isInteger(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user id' })
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: "You can't unfollow yourself" })
    }

    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    })

    return res.json({ message: 'Unfollowed' })
  } catch (err) {
    console.error(err)
    // P2025 = record not found
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Follow relation not found' })
    }
    return res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/user/:id/follow/status
router.get('/:id/follow/status', requireAuth, async (req, res) => {
  try {
    const targetUserId = Number(req.params.id)
    const currentUserId = req.userId

    if (!Number.isInteger(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user id' })
    }

    if (targetUserId === currentUserId) {
      return res.json({ isFollowing: false })
    }

    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
      select: { id: true },
    })

    return res.json({ isFollowing: !!follow })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/user/:id/follow/counts
router.get('/:id/follow/counts', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.params.id)
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: 'Invalid user id' })
    }

    const [followersCount, followingCount] = await Promise.all([
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
    ])

    return res.json({ userId, followersCount, followingCount })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/user/:id/followers?cursor=...&take=20
router.get('/:id/followers', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.params.id)
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: 'Invalid user id' })
    }

    const take = Math.min(Number(req.query.take) || 20, 50)
    const cursor = req.query.cursor ? Number(req.query.cursor) : null

    const rows = await prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { id: 'desc' },
      take: take + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        createdAt: true,
        follower: {
          select: {
            id: true,
            username: true,
            level: true,
            xp: true,
            createdAt: true,
          },
        },
      },
    })

    const hasMore = rows.length > take
    const items = hasMore ? rows.slice(0, take) : rows
    const nextCursor = hasMore ? items[items.length - 1].id : null

    return res.json({ items, nextCursor })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/user/:id/following?cursor=...&take=20
router.get('/:id/following', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.params.id)
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: 'Invalid user id' })
    }

    const take = Math.min(Number(req.query.take) || 20, 50)
    const cursor = req.query.cursor ? Number(req.query.cursor) : null

    const rows = await prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { id: 'desc' },
      take: take + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        createdAt: true,
        following: {
          select: {
            id: true,
            username: true,
            level: true,
            xp: true,
            createdAt: true,
          },
        },
      },
    })

    const hasMore = rows.length > take
    const items = hasMore ? rows.slice(0, take) : rows
    const nextCursor = hasMore ? items[items.length - 1].id : null

    return res.json({ items, nextCursor })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// ------------------------------

// DELETE /api/user/me
router.delete('/me', requireAuth, async (req, res) => {
  try {
    const deletedUser = await prisma.user.delete({
      where: { id: req.userId },
    })

    res.json({ message: 'User deleted successfully', userId: deletedUser.id })
  } catch (err) {
    console.error(err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' })
    }
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/search-nickname/:nickname', requireAuth, async (req, res) => {
  try {
    const { nickname } = req.params

    if (!nickname || nickname.trim().length < 1) {
      return res.json([])
    }

    const users = await prisma.user.findMany({
      where: {
        nickname: {
          contains: nickname.trim(),
          mode: 'insensitive', // регистронезависимый поиск
        },
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        level: true,
        xp: true,
      },
      take: 10, // лимит результатов
    })

    res.json(users)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// PATCH /api/user/me/nickname
router.patch('/me/nickname', requireAuth, async (req, res) => {
  try {
    let { nickname } = req.body
    if (!nickname)
      return res.status(400).json({ message: 'Nickname обязателен' })

    // нормализация
    nickname = String(nickname).trim().toLowerCase()

    // простая валидация (можешь поменять правила)
    if (nickname.length < 3 || nickname.length > 20) {
      return res
        .status(400)
        .json({ message: 'Nickname должен быть 3-20 символов' })
    }
    if (!/^[a-z0-9_]+$/.test(nickname)) {
      return res
        .status(400)
        .json({ message: 'Nickname может содержать только a-z, 0-9 и _' })
    }

    // запретить "user123..." если хочешь — убери/оставь
    // if (nickname.startsWith('user')) ...

    // если пользователь вводит свой текущий ник — просто вернем
    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, nickname: true },
    })
    if (!me) return res.status(404).json({ message: 'User not found' })
    if (me.nickname === nickname) {
      return res.json({
        message: 'Nickname updated',
        nickname: me.nickname,
        autoGenerated: false,
      })
    }

    // 1) пробуем поставить ник который ввел пользователь
    try {
      const updated = await prisma.user.update({
        where: { id: req.userId },
        data: { nickname },
        select: { id: true, username: true, nickname: true },
      })

      return res.json({
        message: 'Nickname updated',
        user: updated,
        autoGenerated: false,
      })
    } catch (e) {
      // если ник занят — генерим новый
      if (e.code !== 'P2002') throw e
    }

    // 2) ник занят -> генерим новый и сохраняем
    let newNick = null
    for (let i = 0; i < 10; i++) {
      const candidate = `user${Math.floor(100000000 + Math.random() * 900000000)}`
      try {
        const updated = await prisma.user.update({
          where: { id: req.userId },
          data: { nickname: candidate },
          select: { id: true, username: true, nickname: true },
        })
        newNick = updated.nickname
        return res.status(409).json({
          message: 'Nickname already taken. New nickname generated.',
          user: updated,
          autoGenerated: true,
        })
      } catch (e) {
        if (e.code !== 'P2002') throw e
      }
    }

    return res
      .status(500)
      .json({ message: 'Не удалось подобрать свободный nickname' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/user/nickname/check?nickname=abc
router.get('/nickname/check', requireAuth, async (req, res) => {
  let nickname = String(req.query.nickname || '')
    .trim()
    .toLowerCase()
  if (!nickname) return res.status(400).json({ message: 'nickname обязателен' })

  const exists = await prisma.user.findUnique({
    where: { nickname },
    select: { id: true },
  })

  res.json({ nickname, available: !exists })
})

// PATCH /api/user/me/username
router.patch('/me/username', requireAuth, async (req, res) => {
  try {
    let { username } = req.body
    if (username === undefined || username === null) {
      return res.status(400).json({ message: 'Username обязателен' })
    }

    // нормализация
    username = String(username).trim()

    // валидация (можешь поменять правила)
    if (username.length < 2 || username.length > 50) {
      return res
        .status(400)
        .json({ message: 'Username должен быть 2-50 символов' })
    }

    // (опционально) запретить странные символы — оставь/убери как хочешь
    // Разрешим буквы (лат/кир), цифры, пробел, _ и -
    if (!/^[a-zA-Zа-яА-ЯёЁ0-9 _-]+$/.test(username)) {
      return res
        .status(400)
        .json({ message: 'Username содержит недопустимые символы' })
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { username },
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        level: true,
        role: true,
        updatedAt: true,
      },
    })

    return res.json({ message: 'Username updated', user: updated })
  } catch (err) {
    console.error(err)
    // P2025 = user not found
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' })
    }
    return res.status(500).json({ message: 'Server error' })
  }
})

router.get('/search', requireAuth, async (req, res) => {
  try {
    const nickname = String(req.query.nickname || '').trim()

    if (!nickname) {
      return res.status(400).json({ message: 'nickname query required' })
    }

    const users = await prisma.user.findMany({
      where: {
        nickname: {
          contains: nickname,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        xp: true,
        level: true,
      },
      take: 20,
    })

    return res.json(users)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
