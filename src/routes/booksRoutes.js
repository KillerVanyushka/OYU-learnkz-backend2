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
  fileUrl: true,
  mimeType: true,
  createdAt: true,
  updatedAt: true,
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

async function streamBookFile(book, res) {
  const key = book.fileKey || extractKeyFromUrl(book.fileUrl)
  if (!key) {
    return res.status(500).json({ message: 'Bad fileUrl format' })
  }

  const obj = await r2.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    }),
  )

  res.setHeader('Content-Type', book.mimeType || obj.ContentType || 'application/octet-stream')
  if (obj.ContentLength) {
    res.setHeader('Content-Length', String(obj.ContentLength))
  }
  res.setHeader('Cache-Control', 'public, max-age=86400')
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

    return streamBookFile(book, res)
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

    return streamBookFile(book, res)
  } catch (err) {
    console.error('GET /api/books/:id/file error:', err)
    res.status(500).json({ message: 'Failed to stream book file' })
  }
})

module.exports = router
