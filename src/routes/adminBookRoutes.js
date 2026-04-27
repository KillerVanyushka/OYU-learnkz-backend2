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
  limits: { fileSize: 50 * 1024 * 1024 },
})

const BOOK_SELECT = {
  id: true,
  title: true,
  format: true,
  pageCount: true,
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
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'application/epub+zip') return 'epub'
  if (mime === 'text/plain') return 'txt'
  if (mime === 'application/msword') return 'doc'
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'

  return 'bin'
}

async function findBookByTitle(title) {
  return prisma.book.findUnique({
    where: { title },
    select: BOOK_SELECT,
  })
}

router.get('/books', requireAuth, async (req, res) => {
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
    console.error('GET /api/admin/books error:', err)
    res.status(500).json({ message: 'Failed to fetch books' })
  }
})

router.post('/books', ...staff, upload.single('file'), async (req, res) => {
  try {
    const { title, format, pageCount, author } = req.body || {}

    if (!req.file) {
      return res.status(400).json({ message: 'file is required (field name: file)' })
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'title is required' })
    }

    if (!author || !String(author).trim()) {
      return res.status(400).json({ message: 'author is required' })
    }

    const parsedPageCount = Number(pageCount)
    if (!Number.isInteger(parsedPageCount) || parsedPageCount <= 0) {
      return res.status(400).json({ message: 'pageCount must be a positive integer' })
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

    const safeTitle = safeKeyName(normalizedTitle || 'book')
    const key = `books/${safeTitle}-${Date.now()}.${inferredFormat}`

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

    const book = await prisma.book.create({
      data: {
        title: normalizedTitle,
        format: normalizedFormat,
        pageCount: parsedPageCount,
        author: normalizedAuthor,
        fileUrl,
        fileKey: key,
        mimeType: req.file.mimetype || null,
      },
      select: BOOK_SELECT,
    })

    res.status(201).json({
      message: 'Book created successfully',
      book,
    })
  } catch (err) {
    console.error('POST /api/admin/books error:', err)

    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Book with this title already exists' })
    }

    res.status(500).json({ message: 'Failed to create book' })
  }
})

router.patch('/books/:id', ...staff, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid book id' })
    }

    const { title, format, pageCount, author } = req.body || {}
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

    if (pageCount !== undefined) {
      const parsedPageCount = Number(pageCount)
      if (!Number.isInteger(parsedPageCount) || parsedPageCount <= 0) {
        return res.status(400).json({ message: 'pageCount must be a positive integer' })
      }
      data.pageCount = parsedPageCount
    }

    const book = await prisma.book.update({
      where: { id },
      data,
      select: BOOK_SELECT,
    })

    res.json({
      message: 'Book updated successfully',
      book,
    })
  } catch (err) {
    console.error('PATCH /api/admin/books/:id error:', err)

    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Book not found' })
    }

    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Book with this title already exists' })
    }

    res.status(500).json({ message: 'Failed to update book' })
  }
})

router.patch('/books/by-title/:title', ...staff, async (req, res) => {
  try {
    const currentTitle = String(req.params.title || '').trim()
    if (!currentTitle) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const { title, format, pageCount, author } = req.body || {}
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

    if (pageCount !== undefined) {
      const parsedPageCount = Number(pageCount)
      if (!Number.isInteger(parsedPageCount) || parsedPageCount <= 0) {
        return res.status(400).json({ message: 'pageCount must be a positive integer' })
      }
      data.pageCount = parsedPageCount
    }

    const book = await prisma.book.update({
      where: { title: currentTitle },
      data,
      select: BOOK_SELECT,
    })

    res.json({
      message: 'Book updated successfully',
      book,
    })
  } catch (err) {
    console.error('PATCH /api/admin/books/by-title/:title error:', err)

    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Book not found' })
    }

    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Book with this title already exists' })
    }

    res.status(500).json({ message: 'Failed to update book' })
  }
})

router.post('/books/:id/file', ...staff, upload.single('file'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'Invalid book id' })
    }

    if (!req.file) {
      return res.status(400).json({ message: 'file is required (field name: file)' })
    }

    const book = await prisma.book.findUnique({
      where: { id },
      select: BOOK_SELECT,
    })
    if (!book) {
      return res.status(404).json({ message: 'Book not found' })
    }

    const inferredFormat = resolveFileExtension(req.file)
    const key = `books/${safeKeyName(book.title || 'book')}-${Date.now()}.${inferredFormat}`

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

    const updated = await prisma.book.update({
      where: { id },
      data: {
        format: inferredFormat,
        fileUrl: publicUrlForKey(key),
        fileKey: key,
        mimeType: req.file.mimetype || null,
      },
      select: BOOK_SELECT,
    })

    try {
      await deleteFileByKey(book.fileKey || extractKeyFromUrl(book.fileUrl))
    } catch (deleteErr) {
      console.warn('Failed to delete previous book file from R2:', deleteErr)
    }

    res.json({
      message: 'Book file updated successfully',
      book: updated,
    })
  } catch (err) {
    console.error('POST /api/admin/books/:id/file error:', err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Book not found' })
    }
    res.status(500).json({ message: 'Failed to update book file' })
  }
})

router.post('/books/by-title/:title/file', ...staff, upload.single('file'), async (req, res) => {
  try {
    const currentTitle = String(req.params.title || '').trim()
    if (!currentTitle) {
      return res.status(400).json({ message: 'Title is required' })
    }

    if (!req.file) {
      return res.status(400).json({ message: 'file is required (field name: file)' })
    }

    const book = await findBookByTitle(currentTitle)
    if (!book) {
      return res.status(404).json({ message: 'Book not found' })
    }

    const inferredFormat = resolveFileExtension(req.file)
    const key = `books/${safeKeyName(book.title || 'book')}-${Date.now()}.${inferredFormat}`

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

    const updated = await prisma.book.update({
      where: { title: currentTitle },
      data: {
        format: inferredFormat,
        fileUrl: publicUrlForKey(key),
        fileKey: key,
        mimeType: req.file.mimetype || null,
      },
      select: BOOK_SELECT,
    })

    try {
      await deleteFileByKey(book.fileKey || extractKeyFromUrl(book.fileUrl))
    } catch (deleteErr) {
      console.warn('Failed to delete previous book file from R2:', deleteErr)
    }

    res.json({
      message: 'Book file updated successfully',
      book: updated,
    })
  } catch (err) {
    console.error('POST /api/admin/books/by-title/:title/file error:', err)
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Book not found' })
    }
    res.status(500).json({ message: 'Failed to update book file' })
  }
})

router.delete('/books/:id', ...staff, async (req, res) => {
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

    await prisma.book.delete({ where: { id } })

    try {
      await deleteFileByKey(book.fileKey || extractKeyFromUrl(book.fileUrl))
    } catch (deleteErr) {
      console.warn('Failed to delete book file from R2:', deleteErr)
    }

    res.json({ message: 'Book deleted successfully' })
  } catch (err) {
    console.error('DELETE /api/admin/books/:id error:', err)
    res.status(500).json({ message: 'Failed to delete book' })
  }
})

router.delete('/books/by-title/:title', ...staff, async (req, res) => {
  try {
    const title = String(req.params.title || '').trim()
    if (!title) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const book = await findBookByTitle(title)
    if (!book) {
      return res.status(404).json({ message: 'Book not found' })
    }

    await prisma.book.delete({ where: { title } })

    try {
      await deleteFileByKey(book.fileKey || extractKeyFromUrl(book.fileUrl))
    } catch (deleteErr) {
      console.warn('Failed to delete book file from R2:', deleteErr)
    }

    res.json({ message: 'Book deleted successfully' })
  } catch (err) {
    console.error('DELETE /api/admin/books/by-title/:title error:', err)
    res.status(500).json({ message: 'Failed to delete book' })
  }
})

module.exports = router
