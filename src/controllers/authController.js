const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ message: 'username, email, password обязательны' })
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }] },
      select: { id: true },
    })

    if (existing) {
      return res.status(409).json({ message: 'Пользователь уже существует' })
    }

    const hash = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: { username, email, password: hash, role: 'USER' },
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

    return res.status(201).json(user)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'email и password обязательны' })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      return res.status(400).json({ message: 'Неверный email или пароль' })
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      return res.status(400).json({ message: 'Неверный email или пароль' })
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
    )

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        level: user.level,
        xp: user.xp,
        createdAt: user.createdAt,
      },
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
}
