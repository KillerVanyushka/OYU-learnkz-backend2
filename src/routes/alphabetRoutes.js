const express = require('express')
const prisma = require('../utils/prisma')

const fetchImpl = global.fetch || require('node-fetch').default

const router = express.Router()

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

        const response = await fetchImpl(letter.audioUrl)

        if (!response.ok) {
            return res.status(502).json({
                message: 'Failed to fetch remote audio',
                status: response.status,
            })
        }

        const contentType = response.headers.get('content-type') || 'audio/mpeg'
        res.setHeader('Content-Type', contentType)
        res.setHeader('Cache-Control', 'public, max-age=86400')

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        res.send(buffer)
    } catch (e) {
        console.error(e)
        res.status(500).json({ message: 'Failed to stream audio' })
    }
})

module.exports = router
