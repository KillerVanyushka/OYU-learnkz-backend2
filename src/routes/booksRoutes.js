const express = require('express')
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const prisma = require('../utils/prisma')
const r2 = require('../utils/r2')

const router = express.Router()

const BOOK_SELECT = {
  id: true,
  title: true,
  format: true,
  pageCount: true,
  author: true,
  genre: true,
  description: true,
  level: true,
  fileUrl: true,
  externalUrl: true,
  mimeType: true,
  createdAt: true,
  updatedAt: true,
}

const FORMAT_TO_MIME = {
  fb2: 'application/x-fictionbook+xml',
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  txt: 'text/plain; charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).trim()
  return normalized || null
}

function normalizeLevel(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined
  }

  const normalized = String(value).trim().toUpperCase()
  return LEVELS.includes(normalized) ? normalized : null
}

function normalizeFileNamePart(value) {
  return String(value || 'book')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
}

function resolveMimeType(book, objectMimeType) {
  const formatMime = FORMAT_TO_MIME[String(book.format || '').trim().toLowerCase()]
  if (formatMime) {
    return formatMime
  }

  const explicitMime = String(book.mimeType || '').trim().toLowerCase()
  if (explicitMime && explicitMime !== 'application/octet-stream') {
    return book.mimeType
  }

  return objectMimeType || 'application/octet-stream'
}

function buildDownloadFileName(book) {
  const baseName = normalizeFileNamePart(book.title)
  const format = String(book.format || '').trim().toLowerCase()

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

async function findBookByTitle(title) {
  return prisma.book.findUnique({
    where: { title },
    select: {
      ...BOOK_SELECT,
      fileKey: true,
    },
  })
}

async function streamBookFile(book, res, disposition = 'attachment') {
  if (book.externalUrl) {
    return res.redirect(book.externalUrl)
  }

  const key = book.fileKey || extractKeyFromUrl(book.fileUrl)
  if (!key) {
    return res.status(500).json({ message: 'Book source is not configured correctly' })
  }

  const obj = await r2.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    }),
  )

  const downloadName = buildDownloadFileName(book)
  const encodedName = encodeURIComponent(downloadName)
  const contentType = resolveMimeType(book, obj.ContentType)

  res.setHeader('Content-Type', contentType)
  if (obj.ContentLength) {
    res.setHeader('Content-Length', String(obj.ContentLength))
  }
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const mode = String(disposition || '').trim().toLowerCase() === 'inline'
    ? 'inline'
    : 'attachment'
  res.setHeader(
    'Content-Disposition',
    `${mode}; filename="${downloadName}"; filename*=UTF-8''${encodedName}`,
  )
  obj.Body.pipe(res)
}

router.get('/', async (req, res) => {
  try {
    const titleQuery = String(req.query.title || '').trim()
    const books = await prisma.book.findMany({
      where: titleQuery
        ? {
            title: {
              contains: titleQuery,
              mode: 'insensitive',
            },
          }
        : undefined,
      select: BOOK_SELECT,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    })

    res.json(books)
  } catch (err) {
    console.error('GET /api/books error:', err)
    res.status(500).json({ message: 'Failed to fetch books' })
  }
})

router.get('/by-title/:title', async (req, res) => {
  try {
    const title = String(req.params.title || '').trim()
    if (!title) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const book = await findBookByTitle(title)
    if (!book) {
      return res.status(404).json({ message: 'Book not found' })
    }

    const { fileKey, ...bookData } = book
    res.json(bookData)
  } catch (err) {
    console.error('GET /api/books/by-title/:title error:', err)
    res.status(500).json({ message: 'Failed to fetch book' })
  }
})

router.get('/by-title/:title/file', async (req, res) => {
  try {
    const title = String(req.params.title || '').trim()
    if (!title) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const book = await findBookByTitle(title)
    if (!book) {
      return res.status(404).json({ message: 'Book not found' })
    }

    return streamBookFile(book, res, req.query.disposition)
  } catch (err) {
    console.error('GET /api/books/by-title/:title/file error:', err)
    res.status(500).json({ message: 'Failed to stream book file' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid book id' })
    }

    const book = await prisma.book.findUnique({
      where: { id },
      select: BOOK_SELECT,
    })
    if (!book) {
      return res.status(404).json({ message: 'Book not found' })
    }

    res.json(book)
  } catch (err) {
    console.error('GET /api/books/:id error:', err)
    res.status(500).json({ message: 'Failed to fetch book' })
  }
})

router.get('/:id/file', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid book id' })
    }

    const book = await prisma.book.findUnique({
      where: { id },
      select: {
        ...BOOK_SELECT,
        fileKey: true,
      },
    })
    if (!book) {
      return res.status(404).json({ message: 'Book not found' })
    }

    return streamBookFile(book, res, req.query.disposition)
  } catch (err) {
    console.error('GET /api/books/:id/file error:', err)
    res.status(500).json({ message: 'Failed to stream book file' })
  }
})

// CREATE
router.post('/', async (req, res) => {
  try {
    const {
      title,
      author,
      format,
      pageCount,
      genre,
      description,
      level,
      fileUrl,
      externalUrl,
      mimeType,
      fileKey,
    } = req.body

    const normalizedLevel = normalizeLevel(level)
    if (normalizedLevel === null) {
      return res.status(400).json({ message: `level must be one of: ${LEVELS.join(', ')}` })
    }

    const book = await prisma.book.create({
      data: {
        title,
        author,
        format,
        pageCount,
        genre: normalizeOptionalText(genre),
        description: normalizeOptionalText(description),
        level: normalizedLevel || 'A0',
        fileUrl,
        externalUrl: normalizeOptionalText(externalUrl),
        mimeType,
        fileKey,
      },
      select: BOOK_SELECT,
    })

    res.status(201).json(book)
  } catch (err) {
    console.error('POST /api/books error:', err)
    res.status(500).json({ message: 'Failed to create book' })
  }
})

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid book id' })
    }

    const {
      title,
      author,
      format,
      pageCount,
      genre,
      description,
      level,
      fileUrl,
      externalUrl,
      mimeType,
      fileKey,
    } = req.body

    const normalizedLevel = normalizeLevel(level)
    if (normalizedLevel === null) {
      return res.status(400).json({ message: `level must be one of: ${LEVELS.join(', ')}` })
    }

    const book = await prisma.book.update({
      where: { id },
      data: {
        title,
        author,
        format,
        pageCount,
        genre: genre === undefined ? undefined : normalizeOptionalText(genre),
        description:
          description === undefined ? undefined : normalizeOptionalText(description),
        level: normalizedLevel,
        fileUrl,
        externalUrl: externalUrl === undefined ? undefined : normalizeOptionalText(externalUrl),
        mimeType,
        fileKey,
      },
      select: BOOK_SELECT,
    })

    res.json(book)
  } catch (err) {
    console.error('PUT /api/books/:id error:', err)

    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Book not found' })
    }

    res.status(500).json({ message: 'Failed to update book' })
  }
})

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid book id' })
    }

    await prisma.book.delete({
      where: { id },
    })

    res.status(204).send()
  } catch (err) {
    console.error('DELETE /api/books/:id error:', err)

    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Book not found' })
    }

    res.status(500).json({ message: 'Failed to delete book' })
  }
})

module.exports = router
