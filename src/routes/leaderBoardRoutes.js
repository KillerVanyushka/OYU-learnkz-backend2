const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')

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
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.max(3, Math.min(Number(req.query.limit) || 50, 200))
    const period = String(req.query.period || 'all').trim().toLowerCase()

    if (!ALLOWED_PERIODS.has(period)) {
      return res
        .status(400)
        .json({ message: 'period must be one of: all, day, week, month' })
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        level: true,
        xp: true,
        createdAt: true,
      },
    })

    const periodTotals = new Map()

    if (period !== 'all') {
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
      })

      for (const item of totals) {
        periodTotals.set(item.userId, item._sum.amount ?? 0)
      }
    }

    const ranked = users
      .map((user) => {
        const rawPeriodXp = period === 'all' ? user.xp : (periodTotals.get(user.id) ?? 0)
        const safePeriodXp = Math.min(rawPeriodXp, user.xp ?? 0)

        return {
          id: user.id,
          username: user.username,
          level: user.level,
          xp: user.xp,
          period,
          periodXp: period === 'all' ? user.xp : safePeriodXp,
          createdAt: user.createdAt,
        }
      })
      .sort((a, b) => {
        if (b.periodXp !== a.periodXp) return b.periodXp - a.periodXp
        if (b.xp !== a.xp) return b.xp - a.xp
        return a.id - b.id
      })
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      }))

    const topItems = ranked.slice(0, limit)
    const currentUserRow = ranked.find((item) => item.id === req.userId)

    if (currentUserRow && !topItems.some((item) => item.id === currentUserRow.id)) {
      return res.json([...topItems.slice(0, 3), currentUserRow])
    }

    return res.json(topItems)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
