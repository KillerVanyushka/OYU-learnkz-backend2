const { OAuth2Client } = require('google-auth-library')
const prisma = require('../utils/prisma')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

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

async function getGoogleProfile({ idToken, accessToken }) {
  if (idToken) {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()
    return {
      email: payload?.email?.trim().toLowerCase(),
      name: payload?.name?.trim(),
    }
  }

  if (accessToken) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Google userinfo request failed with status ${response.status}`)
    }

    const payload = await response.json()
    return {
      email: payload?.email?.trim().toLowerCase(),
      name: payload?.name?.trim(),
    }
  }

  return {
    email: null,
    name: null,
  }
}

exports.googleLogin = async (req, res) => {
  try {
    const { idToken, accessToken } = req.body || {}

    if (!idToken && !accessToken) {
      return res.status(400).json({ message: 'idToken or accessToken is required' })
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ message: 'GOOGLE_CLIENT_ID is not configured' })
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'JWT_SECRET is not configured' })
    }

    const profile = await getGoogleProfile({ idToken, accessToken })
    const email = profile.email
    const name = profile.name

    if (!email) {
      return res.status(400).json({ message: 'Google account email was not provided' })
    }

    let user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      const nickname = await generateUniqueNickname()

      user = await prisma.user.create({
        data: {
          email,
          username: name || email.split('@')[0] || 'User',
          nickname,
          password: crypto.randomBytes(16).toString('hex'),
          role: 'USER',
          emailConfirmed: true,
          emailConfirmationToken: null,
        },
      })
    } else if (!user.emailConfirmed) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailConfirmed: true,
          emailConfirmationToken: null,
        },
      })
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
        nickname: user.nickname,
        email: user.email,
        role: user.role,
        level: user.level,
        interfaceLanguage: user.interfaceLanguage,
        initialSetupCompleted: user.initialSetupCompleted,
        xp: user.xp,
        createdAt: user.createdAt,
      },
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
}
