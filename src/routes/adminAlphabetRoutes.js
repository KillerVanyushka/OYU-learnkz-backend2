const express = require('express')
const prisma = require('../utils/prisma')
const multer = require('multer')
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const prisma = require('../utils/r2') // твой S3Client

const router = express.Router()

// памяти достаточно для mp3/wav, но лучше лимит поставить
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
})

// helpers
function extFromMime(mime) {
    if (!mime) return 'bin'
    if (mime === 'audio/mpeg') return 'mp3'
    if (mime === 'audio/wav') return 'wav'
    if (mime === 'audio/ogg') return 'ogg'
    if (mime === 'audio/webm') return 'webm'
    return 'bin'
}

function safeKeyName(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-_.]/g, '')
}

function publicUrlForKey(key) {
    // Варианты:
    // 1) если у тебя есть публичный домен (лучше):
    //    process.env.R2_PUBLIC_BASE_URL = "https://cdn.yoursite.kz"
    // 2) или прямой endpoint (иногда не публичный)
    const base = process.env.R2_PUBLIC_BASE_URL || process.env.R2_ENDPOINT
    return `${base.replace(/\/$/, '')}/${process.env.R2_BUCKET}/${key}`
}

// CREATE: POST /api/admin/alphabet
router.post('/', async (req, res) => {
    try {
        const {
            orderIndex = 0,
            uppercase,
            lowercase,
            pronunciationRu,
            pronunciationEn,
            descriptionRu,
            descriptionEn,
            examples, // может прийти как объект/массив или строка JSON
            audioUrl,
        } = req.body

        if (!uppercase || !lowercase) {
            return res.status(400).json({ message: 'uppercase and lowercase are required' })
        }

        let examplesJson = null
        if (examples !== undefined) {
            examplesJson = typeof examples === 'string' ? JSON.parse(examples) : examples
        }

        const created = await prisma.alphabetLetter.create({
            data: {
                orderIndex: Number(orderIndex) || 0,
                uppercase: String(uppercase),
                lowercase: String(lowercase),
                pronunciationRu: pronunciationRu ?? null,
                pronunciationEn: pronunciationEn ?? null,
                descriptionRu: descriptionRu ?? null,
                descriptionEn: descriptionEn ?? null,
                examples: examplesJson,
                audioUrl: audioUrl ?? null,
            },
        })

        res.status(201).json(created)
    } catch (e) {
        console.error(e)
        // уникальность uppercase+lowercase
        if (e.code === 'P2002') {
            return res.status(409).json({ message: 'This letter already exists' })
        }
        res.status(500).json({ message: 'Failed to create alphabet letter' })
    }
})

// UPDATE: PUT /api/admin/alphabet/:id
router.put('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id)

        const exists = await prisma.alphabetLetter.findUnique({ where: { id } })
        if (!exists) return res.status(404).json({ message: 'Not found' })

        const {
            orderIndex,
            uppercase,
            lowercase,
            pronunciationRu,
            pronunciationEn,
            descriptionRu,
            descriptionEn,
            examples,
            audioUrl,
        } = req.body

        let examplesJson = undefined
        if (examples !== undefined) {
            examplesJson = typeof examples === 'string' ? JSON.parse(examples) : examples
        }

        const updated = await prisma.alphabetLetter.update({
            where: { id },
            data: {
                orderIndex: orderIndex !== undefined ? (Number(orderIndex) || 0) : undefined,
                uppercase: uppercase !== undefined ? String(uppercase) : undefined,
                lowercase: lowercase !== undefined ? String(lowercase) : undefined,
                pronunciationRu: pronunciationRu !== undefined ? pronunciationRu : undefined,
                pronunciationEn: pronunciationEn !== undefined ? pronunciationEn : undefined,
                descriptionRu: descriptionRu !== undefined ? descriptionRu : undefined,
                descriptionEn: descriptionEn !== undefined ? descriptionEn : undefined,
                examples: examplesJson,
                audioUrl: audioUrl !== undefined ? audioUrl : undefined,
            },
        })

        res.json(updated)
    } catch (e) {
        console.error(e)
        if (e.code === 'P2002') {
            return res.status(409).json({ message: 'This letter already exists' })
        }
        res.status(500).json({ message: 'Failed to update alphabet letter' })
    }
})

// DELETE: DELETE /api/admin/alphabet/:id
router.delete('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id)

        const letter = await prisma.alphabetLetter.findUnique({ where: { id } })
        if (!letter) return res.status(404).json({ message: 'Not found' })

        // опционально: удалить файл из R2 тоже
        if (letter.audioUrl && process.env.R2_PUBLIC_BASE_URL) {
            // если строишь url как base/bucket/key, можно вытащить key
            // иначе лучше хранить отдельно audioKey в БД (самый правильный вариант)
        }

        await prisma.alphabetLetter.delete({ where: { id } })
        res.json({ message: 'Deleted' })
    } catch (e) {
        console.error(e)
        res.status(500).json({ message: 'Failed to delete alphabet letter' })
    }
})

// UPLOAD AUDIO: POST /api/admin/alphabet/:id/audio  (multipart/form-data file=...)
router.post('/:id/audio', upload.single('file'), async (req, res) => {
    try {
        const id = Number(req.params.id)

        const letter = await prisma.alphabetLetter.findUnique({ where: { id } })
        if (!letter) return res.status(404).json({ message: 'Not found' })

        if (!req.file) {
            return res.status(400).json({ message: 'file is required (field name: file)' })
        }

        if (!process.env.R2_BUCKET) {
            return res.status(500).json({ message: 'R2_BUCKET is not set' })
        }

        const ext = extFromMime(req.file.mimetype)
        const key = `alphabet/${id}/${safeKeyName(letter.uppercase)}-${Date.now()}.${ext}`

        await r2.send(
            new PutObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: key,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            })
        )

        const audioUrl = publicUrlForKey(key)

        const updated = await prisma.alphabetLetter.update({
            where: { id },
            data: { audioUrl },
        })

        res.json({ audioUrl, letter: updated })
    } catch (e) {
        console.error(e)
        res.status(500).json({ message: 'Failed to upload audio' })
    }
})

module.exports = router