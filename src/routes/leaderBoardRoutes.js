const router = require('express').Router()
const prisma = require('../utils/prisma')

// GET /api/leaderboard?limit=50
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200)

    const users = await prisma.user.findMany({
      take: limit,
      orderBy: [{ xp: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        username: true,
        level: true,
        xp: true,
        createdAt: true,
      },
    })

    res.json(users)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
