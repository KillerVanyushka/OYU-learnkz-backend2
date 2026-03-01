const { OAuth2Client } = require('google-auth-library')
const prisma = require('../utils/prisma')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

exports.googleLogin = async (req, res) => {
    try {
        const { idToken } = req.body
        if (!idToken) return res.status(400).json({ message: 'idToken обязателен' })

        // проверяем токен у Google
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        })
        const payload = ticket.getPayload()
        const { email, name } = payload

        // проверяем есть ли пользователь
        let user = await prisma.user.findUnique({ where: { email } })

        if (!user) {
            // создаём нового пользователя
            user = await prisma.user.create({
                data: {
                    email,
                    username: name,
                    password: crypto.randomBytes(16).toString('hex'), // случайный пароль
                    role: 'USER',
                },
            })
        }

        // создаём JWT
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.json({
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
        res.status(500).json({ message: 'Server error' })
    }
}