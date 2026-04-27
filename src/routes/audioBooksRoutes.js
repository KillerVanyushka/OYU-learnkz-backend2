const express = require('express')
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const prisma = require('../utils/prisma')
const r2 = require('../utils/r2')

const router = express.Router()

const AUDIO_BOOK_SELECT = {
  id: true,
  title: true,
  format: true,
  author: true,
  fileUrl: true,
  mimeType: true,
  createdAt: true,
  updatedAt: true,
}

const FORMAT_TO_MIME = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
}

function normalizeFileNamePart(value) {
  return String(value || 'audio-book')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
}

function resolveMimeType(audioBook, objectMimeType) {
  const formatMime = FORMAT_TO_MIME[String(audioBook.format || '').trim().toLowerCase()]
  if (formatMime) {
    return formatMime
  }

  const explicitMime = String(audioBook.mimeType || '').trim().toLowerCase()
  if (explicitMime && explicitMime !== 'application/octet-stream') {
    return audioBook.mimeType
  }

  return objectMimeType || 'application/octet-stream'
}

function buildDownloadFileName(audioBook) {
  const baseName = normalizeFileNamePart(audioBook.title)
  const format = String(audioBook.format || '').trim().toLowerCase()

  if (!format) return baseName
  if (baseName.toLowerCase().endsWith(`.${format}`)) return baseName

  return `${baseName}.${format}`
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

async function findAudioBookByTitle(title) {
  return prisma.audioBook.findUnique({
    where: { title },
    select: {
      ...AUDIO_BOOK_SELECT,
      fileKey: true,
    },
  })
}

async function streamAudioBookFile(audioBook, res) {
  const key = audioBook.fileKey || extractKeyFromUrl(audioBook.fileUrl)
  if (!key) {
    return res.status(500).json({ message: 'Bad fileUrl format' })
  }

  const obj = await r2.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    }),
  )

  const downloadName = buildDownloadFileName(audioBook)
  const encodedName = encodeURIComponent(downloadName)
  const contentType = resolveMimeType(audioBook, obj.ContentType)

  res.setHeader('Content-Type', contentType)
  if (obj.ContentLength) {
    res.setHeader('Content-Length', String(obj.ContentLength))
  }
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${downloadName}"; filename*=UTF-8''${encodedName}`,
  )
  obj.Body.pipe(res)
}

router.get('/', async (req, res) => {
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
    console.error('GET /api/audio-books error:', err)
    res.status(500).json({ message: 'Failed to fetch audio books' })
  }
})

router.get('/by-title/:title', async (req, res) => {
  try {
    const title = String(req.params.title || '').trim()
    if (!title) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const audioBook = await findAudioBookByTitle(title)
    if (!audioBook) {
      return res.status(404).json({ message: 'Audio book not found' })
    }

    const { fileKey, ...audioBookData } = audioBook
    res.json(audioBookData)
  } catch (err) {
    console.error('GET /api/audio-books/by-title/:title error:', err)
    res.status(500).json({ message: 'Failed to fetch audio book' })
  }
})

router.get('/by-title/:title/file', async (req, res) => {
  try {
    const title = String(req.params.title || '').trim()
    if (!title) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const audioBook = await findAudioBookByTitle(title)
    if (!audioBook) {
      return res.status(404).json({ message: 'Audio book not found' })
    }

    return streamAudioBookFile(audioBook, res)
  } catch (err) {
    console.error('GET /api/audio-books/by-title/:title/file error:', err)
    res.status(500).json({ message: 'Failed to stream audio book file' })
  }
})

router.get('/:id', async (req, res) => {
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

    res.json(audioBook)
  } catch (err) {
    console.error('GET /api/audio-books/:id error:', err)
    res.status(500).json({ message: 'Failed to fetch audio book' })
  }
})

router.get('/:id/file', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid audio book id' })
    }

    const audioBook = await prisma.audioBook.findUnique({
      where: { id },
      select: {
        ...AUDIO_BOOK_SELECT,
        fileKey: true,
      },
    })
    if (!audioBook) {
      return res.status(404).json({ message: 'Audio book not found' })
    }

    return streamAudioBookFile(audioBook, res)
  } catch (err) {
    console.error('GET /api/audio-books/:id/file error:', err)
    res.status(500).json({ message: 'Failed to stream audio book file' })
  }
})

module.exports = router
