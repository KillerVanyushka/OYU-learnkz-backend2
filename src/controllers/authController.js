const crypto = require('crypto')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')
const sendMail = require('../utils/mailer')

// =======================
// Регистрация с email
// =======================
exports.register = async (req, res) => {
  try {
    const { username, email, password, repeatPassword } = req.body
    if (!username || !email || !password || !repeatPassword) {
      return res.status(400).json({ message: 'Все поля обязательны' })
    }

    if (password !== repeatPassword) {
      return res.status(400).json({ message: 'Пароли не совпадают' })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ message: 'Пользователь уже существует' })
    }

    const hash = await bcrypt.hash(password, 10)
    const emailToken = crypto.randomBytes(6).toString('hex') // код для Flutter

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hash,
        role: 'USER',
        emailConfirmed: false,
        emailConfirmationToken: emailToken,
      },
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

    // Отправка кода на email
    const html = `
      <p>Вы зарегистрировались в OYU LearnKZ.</p>
      <p>Введите этот код в приложении для подтверждения email:</p>
      <h2>${emailToken}</h2>
    `
    await sendMail(user.email, 'Подтверждение email OYU LearnKZ', html)

    return res.status(201).json({
      message: 'Пользователь создан. Проверьте почту для подтверждения.',
      user,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
}

// =======================
// Подтверждение email
// =======================
exports.confirmEmail = async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ message: 'Токен обязателен' })

    const user = await prisma.user.findFirst({
      where: { emailConfirmationToken: token },
    })
    if (!user) return res.status(400).json({ message: 'Неверный код' })

    await prisma.user.update({
      where: { id: user.id },
      data: { emailConfirmed: true, emailConfirmationToken: null },
    })

    res.json({ message: 'Email успешно подтверждён' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

// =======================
// Логин
// =======================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ message: 'Email и пароль обязательны' })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(400).json({ message: 'Неверный email или пароль' })

    // Проверка подтверждения email
    if (!user.emailConfirmed) {
      return res.status(403).json({ message: 'Email не подтверждён. Проверьте почту.' })
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(400).json({ message: 'Неверный email или пароль' })

    const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
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

// =======================
// Сброс пароля - запрос кода
// =======================
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ message: 'Email обязателен' })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.json({ message: 'Если email существует, код отправлен' })

    const token = crypto.randomBytes(6).toString('hex') // код для Flutter
    const expiry = new Date(Date.now() + 3600 * 1000) // 1 час

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: token, resetPasswordExpiry: expiry },
    })

    const html = `
      <p>Вы запросили смену пароля.</p>
      <p>Введите этот код в приложении для сброса пароля (действует 1 час):</p>
      <h2>${token}</h2>
    `
    await sendMail(email, 'Сброс пароля OYU LearnKZ', html)

    res.json({ message: 'Если email существует, код отправлен' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

// =======================
// Сброс пароля - установка нового
// =======================
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword, repeatPassword } = req.body
    if (!token || !newPassword || !repeatPassword)
      return res.status(400).json({ message: 'Все поля обязательны' })

    if (newPassword !== repeatPassword)
      return res.status(400).json({ message: 'Пароли не совпадают' })

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: { gt: new Date() },
      },
    })
    if (!user) return res.status(400).json({ message: 'Код недействителен или просрочен' })

    const hash = await bcrypt.hash(newPassword, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    })

    res.json({ message: 'Пароль успешно изменён' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}