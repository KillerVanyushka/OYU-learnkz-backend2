const router = require('express').Router()
const prisma = require('../utils/prisma')

const ALLOWED_PERIODS = new Set(['all', 'day', 'week', 'month'])

function getPeriodStart(period) {
  const now = Date.now()

  if (period === 'day') {
    return new Date(now - 24 * 60 * 60 * 1000)
  }

  if (period === 'week') {
    return new Date(now - 7 * 24 * 60 * 60 * 1000)
  }

  if (period === 'month') {
    return new Date(now - 30 * 24 * 60 * 60 * 1000)
  }

  return null
}

// GET /api/leaderboard?limit=50&period=all|day|week|month
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const period = String(req.query.period || 'all').trim().toLowerCase()

    if (!ALLOWED_PERIODS.has(period)) {
      return res
        .status(400)
        .json({ message: 'period must be one of: all, day, week, month' })
    }

    if (period === 'all') {
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

      return res.json(
        users.map((user, index) => ({
          rank: index + 1,
          id: user.id,
          username: user.username,
          level: user.level,
          xp: user.xp,
          period,
          periodXp: user.xp,
          createdAt: user.createdAt,
        })),
      )
    }

    const totals = await prisma.userXpHistory.groupBy({
      by: ['userId'],
      where: {
        createdAt: {
          gte: getPeriodStart(period),
        },
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        _sum: {
          amount: 'desc',
        },
      },
      take: limit,
    })

    if (totals.length === 0) {
      return res.json([])
    }

    const users = await prisma.user.findMany({
      where: {
        id: {
          in: totals.map((item) => item.userId),
        },
      },
      select: {
        id: true,
        username: true,
        level: true,
        xp: true,
        createdAt: true,
      },
    })

    const usersMap = new Map(users.map((user) => [user.id, user]))

    const items = totals
      .map((item) => {
        const user = usersMap.get(item.userId)
        if (!user) return null

        return {
          id: user.id,
          username: user.username,
          level: user.level,
          xp: user.xp,
          periodXp: item._sum.amount ?? 0,
          createdAt: user.createdAt,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.periodXp !== a.periodXp) return b.periodXp - a.periodXp
        return a.id - b.id
      })
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      }))

    return res.json(
      items.map((item) => ({
        ...item,
        period,
      })),
    )
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
