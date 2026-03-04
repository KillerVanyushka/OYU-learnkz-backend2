const express = require('express')
const prisma = require('../utils/prisma')

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

module.exports = router