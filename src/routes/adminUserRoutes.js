const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')
const requireRole = require('../middlewares/requireRole')

// ✅ Admin + Moderator: список всех пользователей
router.get(
  '/users',
  requireAuth,
  requireRole('ADMIN', 'MODERATOR'),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          level: true,
          xp: true,
          createdAt: true,
        },
        orderBy: { id: 'asc' },
      })
      res.json(users)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// ✅ Admin + Moderator: конкретный пользователь
router.get(
  '/users/:id',
  requireAuth,
  requireRole('ADMIN', 'MODERATOR'),
  async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (Number.isNaN(id))
        return res.status(400).json({ message: 'Invalid id' })

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          level: true,
          xp: true,
          createdAt: true,
        },
      })

      if (!user) return res.status(404).json({ message: 'User not found' })
      res.json(user)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// ✅ Только Admin: менять роль
router.patch(
  '/users/:id/role',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const id = Number(req.params.id)
      const { role } = req.body

      if (Number.isNaN(id))
        return res.status(400).json({ message: 'Invalid id' })

      const allowed = ['USER', 'MODERATOR', 'ADMIN']
      if (!allowed.includes(role)) {
        return res.status(400).json({ message: 'Invalid role' })
      }

      // (опционально) запретить самому себе снять ADMIN
      if (req.userId === id && role !== 'ADMIN') {
        return res
          .status(400)
          .json({ message: "You can't change your own admin role" })
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { role },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          level: true,
          xp: true,
          createdAt: true,
        },
      })

      res.json(updated)
    } catch (err) {
      console.error(err)
      // если id не найден
      if (err.code === 'P2025')
        return res.status(404).json({ message: 'User not found' })
      res.status(500).json({ message: 'Server error' })
    }
  },
)

module.exports = router
