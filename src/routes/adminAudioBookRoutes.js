const express = require('express')
const multer = require('multer')
const {
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3')
const prisma = require('../utils/prisma')
const r2 = require('../utils/r2')
const requireAuth = require('../middlewares/requireAuth')
const requireRole = require('../middlewares/requireRole')

const router = express.Router()
const staff = [requireAuth, requireRole('MODERATOR')]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
})

const AUDIO_BOOK_SELECT = {
  id: true,
  title: true,
  format: true,
  author: true,
  fileUrl: true,
  fileKey: true,
  mimeType: true,
  createdAt: true,
  updatedAt: true,
}

function safeKeyName(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
}

function publicUrlForKey(key) {
  const publicBase = process.env.R2_PUBLIC_BASE_URL
  const endpoint = process.env.R2_ENDPOINT
  const bucket = process.env.R2_BUCKET

  if (publicBase) {
    return `${publicBase.replace(/\/$/, '')}/${key}`
  }

  if (endpoint && bucket) {
    return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`
  }

  throw new Error('R2 public URL is not configured')
}

function extractKeyFromUrl(fileUrl) {
  if (!fileUrl) return null

  const publicBase = process.env.R2_PUBLIC_BASE_URL
  const endpoint = process.env.R2_ENDPOINT
  const bucket = process.env.R2_BUCKET

  if (publicBase) {
    const normalizedBase = publicBase.replace(/\/$/, '')
    if (fileUrl.startsWith(normalizedBase + '/')) {
      return fileUrl.slice((normalizedBase + '/').length)
    }
  }

  if (endpoint && bucket) {
    const prefix = `${endpoint.replace(/\/$/, '')}/${bucket}/`
    if (fileUrl.startsWith(prefix)) {
      return fileUrl.slice(prefix.length)
    }
  }

  return null
}

async function deleteFileByKey(key) {
  if (!key) return false

  await r2.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    }),
  )

  return true
}

function resolveFileExtension(file) {
  const original = String(file?.originalname || '').toLowerCase()
  const ext = original.includes('.') ? original.split('.').pop() : ''
  if (ext) return ext

  const mime = String(file?.mimetype || '').toLowerCase()
  if (mime === 'audio/mpeg') return 'mp3'
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a') return 'm4a'
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return 'wav'
  if (mime === 'audio/ogg') return 'ogg'
  if (mime === 'audio/flac') return 'flac'
  if (mime === 'audio/aac') return 'aac'

  return 'bin'
}

async function findAudioBookByTitle(title) {
  return prisma.audioBook.findUnique({
    where: { title },
    select: AUDIO_BOOK_SELECT,
  })
}

router.get('/audio-books', requireAuth, async (req, res) => {
  try {
    const titleQuery = String(req.query.title || '').trim()
    const audioBooks = await prisma.audioBook.findMany({
      where: titleQuery
        ? {
            title: {
              contains: titleQuery,
              mode: 'insensitive',
            },
          }
        : undefined,
      select: AUDIO_BOOK_SELECT,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    })

    res.json(audioBooks)
  } catch (err) {
    console.error('GET /api/admin/audio-books error:', err)
    res.status(500).json({ message: 'Failed to fetch audio books' })
  }
})

router.post('/audio-books', ...staff, upload.single('file'), async (req, res) => {
  try {
    const { title, format, author } = req.body || {}

    if (!req.file) {
      return res.status(400).json({ message: 'file is required (field name: file)' })
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'title is required' })
    }

    if (!author || !String(author).trim()) {
      return res.status(400).json({ message: 'author is required' })
    }

    if (!process.env.R2_BUCKET) {
      return res.status(500).json({ message: 'R2_BUCKET is not set' })
    }

    const normalizedTitle = String(title).trim()
    const normalizedAuthor = String(author).trim()
    const inferredFormat = resolveFileExtension(req.file)
    const normalizedFormat = String(format || inferredFormat).trim().toLowerCase()

    if (!normalizedFormat) {
      return res.status(400).json({ message: 'format is required' })
    }

    const safeTitle = safeKeyName(normalizedTitle || 'audio-book')
    const key = `audioBooks/${safeTitle}-${Date.now()}.${inferredFormat}`

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || 'application/octet-stream',
      }),
    )

    await r2.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }),
    )

    const fileUrl = publicUrlForKey(key)

    const audioBook = await prisma.audioBook.create({
      data: {
        title: normalizedTitle,
        format: normalizedFormat,
        author: normalizedAuthor,
        fileUrl,
        fileKey: key,
        mimeType: req.file.mimetype || null,
      },
      select: AUDIO_BOOK_SELECT,
    })

    res.status(201).json({
      message: 'Audio book created successfully',
      audioBook,
    })
  } catch (err) {
    console.error('POST /api/admin/audio-books error:', err)

    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Audio book with this title already exists' })
    }

    res.status(500).json({ message: 'Failed to create audio book' })
  }
})

router.patch('/audio-books/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid audio book id' })
    }

    const { title, format, author } = req.body || {}
    const data = {}

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ message: 'title cannot be empty' })
      }
      data.title = String(title).trim()
    }

    if (format !== undefined) {
      if (!String(format).trim()) {
        return res.status(400).json({ message: 'format cannot be empty' })
      }
      data.format = String(format).trim().toLowerCase()
    }

    if (author !== undefined) {
      if (!String(author).trim()) {
        return res.status(400).json({ message: 'author cannot be empty' })
      }
      data.author = String(author).trim()
    }

    const audioBook = await prisma.audioBook.update({
      where: { id },
      data,
      select: AUDIO_BOOK_SELECT,
    })

    res.json({
      message: 'Audio book updated successfully',
      audioBook,
    })
  } catch (err) {
    console.error('PATCH /api/admin/audio-books/:id error:', err)

    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Audio book not found' })
    }

    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Audio book with this title already exists' })
    }

    res.status(500).json({ message: 'Failed to update audio book' })
  }
})

router.patch('/audio-books/by-title/:title', ...staff, async (req, res) => {
  try {
    const currentTitle = String(req.params.title || '').trim()
    if (!currentTitle) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const { title, format, author } = req.body || {}
    const data = {}

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ message: 'title cannot be empty' })
      }
      data.title = String(title).trim()
    }

    if (format !== undefined) {
      if (!String(format).trim()) {
        return res.status(400).json({ message: 'format cannot be empty' })
      }
      data.format = String(format).trim().toLowerCase()
    }

    if (author !== undefined) {
      if (!String(author).trim()) {
        return res.status(400).json({ message: 'author cannot be empty' })
      }
      data.author = String(author).trim()
    }

    const audioBook = await prisma.audioBook.update({
      where: { title: currentTitle },
      data,
      select: AUDIO_BOOK_SELECT,
    })

    res.json({
      message: 'Audio book updated successfully',
      audioBook,
    })
  } catch (err) {
    console.error('PATCH /api/admin/audio-books/by-title/:title error:', err)

    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Audio book not found' })
    }

    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Audio book with this title already exists' })
    }

    res.status(500).json({ message: 'Failed to update audio book' })
  }
})

router.post('/audio-books/:id/file', ...staff, upload.single('file'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid audio book id' })
    }

    if (!req.file) {
      return res.status(400).json({ message: 'file is required (field name: file)' })
    }

    const audioBook = await prisma.audioBook.findUnique({
      where: { id },
      select: AUDIO_BOOK_SELECT,
    })
    if (!audioBook) {
      return res.status(404).json({ message: 'Audio book not found' })
    }

    const inferredFormat = resolveFileExtension(req.file)
    const key = `audioBooks/${safeKeyName(audioBook.title || 'audio-book')}-${Date.now()}.${inferredFormat}`

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || 'application/octet-stream',
      }),
    )

    await r2.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }),
    )

    const updated = await prisma.audioBook.update({
      where: { id },
      data: {
        format: inferredFormat,
        fileUrl: publicUrlForKey(key),
        fileKey: key,
        mimeType: req.file.mimetype || null,
      },
      select: AUDIO_BOOK_SELECT,
    })

    try {
      await deleteFileByKey(audioBook.fileKey || extractKeyFromUrl(audioBook.fileUrl))
    } catch (deleteErr) {
      console.warn('Failed to delete previous audio book file from R2:', deleteErr)
    }

    res.json({
      message: 'Audio book file updated successfully',
      audioBook: updated,
    })
  } catch (err) {
    console.error('POST /api/admin/audio-books/:id/file error:', err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Audio book not found' })
    }
    res.status(500).json({ message: 'Failed to update audio book file' })
  }
})

router.post('/audio-books/by-title/:title/file', ...staff, upload.single('file'), async (req, res) => {
  try {
    const currentTitle = String(req.params.title || '').trim()
    if (!currentTitle) {
      return res.status(400).json({ message: 'Title is required' })
    }

    if (!req.file) {
      return res.status(400).json({ message: 'file is required (field name: file)' })
    }

    const audioBook = await findAudioBookByTitle(currentTitle)
    if (!audioBook) {
      return res.status(404).json({ message: 'Audio book not found' })
    }

    const inferredFormat = resolveFileExtension(req.file)
    const key = `audioBooks/${safeKeyName(audioBook.title || 'audio-book')}-${Date.now()}.${inferredFormat}`

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || 'application/octet-stream',
      }),
    )

    await r2.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }),
    )

    const updated = await prisma.audioBook.update({
      where: { title: currentTitle },
      data: {
        format: inferredFormat,
        fileUrl: publicUrlForKey(key),
        fileKey: key,
        mimeType: req.file.mimetype || null,
      },
      select: AUDIO_BOOK_SELECT,
    })

    try {
      await deleteFileByKey(audioBook.fileKey || extractKeyFromUrl(audioBook.fileUrl))
    } catch (deleteErr) {
      console.warn('Failed to delete previous audio book file from R2:', deleteErr)
    }

    res.json({
      message: 'Audio book file updated successfully',
      audioBook: updated,
    })
  } catch (err) {
    console.error('POST /api/admin/audio-books/by-title/:title/file error:', err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Audio book not found' })
    }
    res.status(500).json({ message: 'Failed to update audio book file' })
  }
})

router.delete('/audio-books/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid audio book id' })
    }

    const audioBook = await prisma.audioBook.findUnique({
      where: { id },
      select: AUDIO_BOOK_SELECT,
    })
    if (!audioBook) {
      return res.status(404).json({ message: 'Audio book not found' })
    }

    await prisma.audioBook.delete({ where: { id } })

    try {
      await deleteFileByKey(audioBook.fileKey || extractKeyFromUrl(audioBook.fileUrl))
    } catch (deleteErr) {
      console.warn('Failed to delete audio book file from R2:', deleteErr)
    }

    res.json({ message: 'Audio book deleted successfully' })
  } catch (err) {
    console.error('DELETE /api/admin/audio-books/:id error:', err)
    res.status(500).json({ message: 'Failed to delete audio book' })
  }
})

router.delete('/audio-books/by-title/:title', ...staff, async (req, res) => {
  try {
    const title = String(req.params.title || '').trim()
    if (!title) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const audioBook = await findAudioBookByTitle(title)
    if (!audioBook) {
      return res.status(404).json({ message: 'Audio book not found' })
    }

    await prisma.audioBook.delete({ where: { title } })

    try {
      await deleteFileByKey(audioBook.fileKey || extractKeyFromUrl(audioBook.fileUrl))
    } catch (deleteErr) {
      console.warn('Failed to delete audio book file from R2:', deleteErr)
    }

    res.json({ message: 'Audio book deleted successfully' })
  } catch (err) {
    console.error('DELETE /api/admin/audio-books/by-title/:title error:', err)
    res.status(500).json({ message: 'Failed to delete audio book' })
  }
})

module.exports = router
