const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        username: true,
        email: true,
        level: true,
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

// GET /api/users/me/streak
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

module.exports = router
