const express = require('express')
const prisma = require('../utils/prisma')
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const r2 = require('../utils/r2')

const router = express.Router()

function extractKeyFromAudioUrl(audioUrl) {
    if (!audioUrl) return null

    const publicBase = process.env.R2_PUBLIC_BASE_URL
    const endpoint = process.env.R2_ENDPOINT
    const bucket = process.env.R2_BUCKET

    if (publicBase) {
        const normalizedBase = publicBase.replace(/\/$/, '')
        if (audioUrl.startsWith(normalizedBase + '/')) {
            return audioUrl.slice((normalizedBase + '/').length)
        }
    }

    if (endpoint && bucket) {
        const prefix = `${endpoint.replace(/\/$/, '')}/${bucket}/`
        if (audioUrl.startsWith(prefix)) {
            return audioUrl.slice(prefix.length)
        }
    }

    return null
}

// GET /api/alphabet - список букв
router.get('/', async (req, res) => {
    try {
        const letters = await prisma.alphabetLetter.findMany({
            orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
        })
        res.json(letters)
    } catch (e) {
        console.error(e)
        res.status(500).json({ message: 'Failed to fetch alphabet letters' })
    }
})

// GET /api/alphabet/:id - одна буква
router.get('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id)
        const letter = await prisma.alphabetLetter.findUnique({ where: { id } })
        if (!letter) return res.status(404).json({ message: 'Not found' })
        res.json(letter)
    } catch (e) {
        console.error(e)
        res.status(500).json({ message: 'Failed to fetch alphabet letter' })
    }
})

// GET /api/alphabet/:id/audio
// Проксирует аудио по ссылке из audioUrl
router.get('/:id/audio', async (req, res) => {
    try {
        const id = Number(req.params.id)
        if (Number.isNaN(id)) {
            return res.status(400).json({ message: 'Invalid id' })
        }

        const letter = await prisma.alphabetLetter.findUnique({
            where: { id },
            select: {
                id: true,
                uppercase: true,
                lowercase: true,
                audioUrl: true,
            },
        })

        if (!letter) {
            return res.status(404).json({ message: 'Letter not found' })
        }

        if (!letter.audioUrl) {
            return res.status(404).json({ message: 'Audio not found for this letter' })
        }

        const key = extractKeyFromAudioUrl(letter.audioUrl)
        if (!key) {
            return res.status(500).json({ message: 'Bad audioUrl format' })
        }

        const obj = await r2.send(
            new GetObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: key,
            }),
        )

        res.setHeader('Content-Type', obj.ContentType || 'audio/mpeg')
        if (obj.ContentLength) {
            res.setHeader('Content-Length', String(obj.ContentLength))
        }
        res.setHeader('Cache-Control', 'public, max-age=86400')

        obj.Body.pipe(res)
    } catch (e) {
        console.error(e)
        res.status(500).json({ message: 'Failed to stream audio' })
    }
})

module.exports = router
