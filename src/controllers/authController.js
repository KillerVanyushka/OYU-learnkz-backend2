const crypto = require('crypto')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../utils/prisma')
const sendMail = require('../utils/mailer')

const EMAIL_CONFIRMATION_TTL_MS = 60 * 1000

async function generateUniqueNickname() {
  for (let i = 0; i < 10; i++) {
    const nickname = `user${Math.floor(100000000 + Math.random() * 900000000)}`

    const exists = await prisma.user.findUnique({
      where: { nickname },
      select: { id: true },
    })

    if (!exists) return nickname
  }

  throw new Error('Failed to generate unique nickname')
}

function getEmailConfirmationExpiry() {
  return new Date(Date.now() + EMAIL_CONFIRMATION_TTL_MS)
}

function isEmailConfirmationExpired(user) {
  if (!user || user.emailConfirmed || !user.emailConfirmationExpiry) {
    return false
  }

  return user.emailConfirmationExpiry.getTime() <= Date.now()
}

async function deleteExpiredUnconfirmedUser(user) {
  if (!isEmailConfirmationExpired(user)) {
    return false
  }

  await prisma.user.delete({ where: { id: user.id } })
  return true
}

exports.register = async (req, res) => {
  try {
    const { username, email, password, repeatPassword } = req.body

    if (!username || !email || !password || !repeatPassword) {
      return res.status(400).json({ message: 'All fields are required' })
    }

    if (password !== repeatPassword) {
      return res.status(400).json({ message: 'Passwords do not match' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (existing) {
      const deletedExpiredUser = await deleteExpiredUnconfirmedUser(existing)

      if (!deletedExpiredUser) {
        const message = existing.emailConfirmed
          ? 'User already exists'
          : 'Account already created. Confirm your email within 1 minute or register again after it expires.'

        return res.status(409).json({ message })
      }
    }

    const hash = await bcrypt.hash(password, 10)
    const emailToken = crypto.randomBytes(6).toString('hex')
    const emailConfirmationExpiry = getEmailConfirmationExpiry()
    const nickname = await generateUniqueNickname()

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        nickname,
        email: normalizedEmail,
        password: hash,
        role: 'USER',
        emailConfirmed: false,
        emailConfirmationToken: emailToken,
        emailConfirmationExpiry,
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        role: true,
        level: true,
        interfaceLanguage: true,
        initialSetupCompleted: true,
        xp: true,
        silvEgg: true,
        createdAt: true,
      },
    })

    const html = `
      <p>You registered in OYU LearnKZ.</p>
      <p>Enter this code in the app to confirm your email. The code is valid for 1 minute:</p>
      <h2>${emailToken}</h2>
    `

    await sendMail(user.email, 'Confirm your email - OYU LearnKZ', html)

    return res.status(201).json({
      message: 'User created. Check your email and enter the confirmation code within 1 minute.',
      user,
      expiresAt: emailConfirmationExpiry.toISOString(),
    })
  } catch (err) {
    console.error(err)

    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Nickname conflict, try again' })
    }

    return res.status(500).json({ message: err.message || 'Registration failed' })
  }
}

exports.confirmEmail = async (req, res) => {
  try {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({ message: 'Confirmation code is required' })
    }

    const user = await prisma.user.findFirst({
      where: { emailConfirmationToken: token },
    })

    if (!user) {
      return res.status(400).json({ message: 'Invalid confirmation code' })
    }

    const deletedExpiredUser = await deleteExpiredUnconfirmedUser(user)
    if (deletedExpiredUser) {
      return res.status(410).json({
        message: 'Confirmation code expired. The account was removed. Please register again.',
      })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailConfirmed: true,
        emailConfirmationToken: null,
        emailConfirmationExpiry: null,
      },
    })

    return res.json({ message: 'Email confirmed successfully' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: err.message || 'Email confirmation failed' })
  }
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' })
    }

    if (!user.emailConfirmed) {
      const deletedExpiredUser = await deleteExpiredUnconfirmedUser(user)
      if (deletedExpiredUser) {
        return res.status(410).json({
          message: 'Confirmation time expired. The account was removed. Please register again.',
        })
      }

      return res.status(403).json({ message: 'Email is not confirmed. Check your inbox.' })
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      return res.status(400).json({ message: 'Invalid email or password' })
    }

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
        nickname: user.nickname,
        email: user.email,
        role: user.role,
        level: user.level,
        interfaceLanguage: user.interfaceLanguage,
        initialSetupCompleted: user.initialSetupCompleted,
        xp: user.xp,
        silvEgg: user.silvEgg,
        createdAt: user.createdAt,
      },
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: err.message || 'Login failed' })
  }
}

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) {
      return res.json({ message: 'If the email exists, the reset code was sent' })
    }

    const token = crypto.randomBytes(6).toString('hex')
    const expiry = new Date(Date.now() + 3600 * 1000)

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: token, resetPasswordExpiry: expiry },
    })

    const html = `
      <p>You requested a password reset.</p>
      <p>Enter this code in the app to reset your password. It is valid for 1 hour:</p>
      <h2>${token}</h2>
    `

    await sendMail(normalizedEmail, 'Reset password - OYU LearnKZ', html)

    return res.json({ message: 'If the email exists, the reset code was sent' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: err.message || 'Password reset request failed' })
  }
}

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword, repeatPassword } = req.body

    if (!token || !newPassword || !repeatPassword) {
      return res.status(400).json({ message: 'All fields are required' })
    }

    if (newPassword !== repeatPassword) {
      return res.status(400).json({ message: 'Passwords do not match' })
    }

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: { gt: new Date() },
      },
    })

    if (!user) {
      return res.status(400).json({ message: 'Reset code is invalid or expired' })
    }

    const hash = await bcrypt.hash(newPassword, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    })

    return res.json({ message: 'Password updated successfully' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: err.message || 'Password reset failed' })
  }
}
