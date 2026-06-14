const express = require('express')
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')

const router = express.Router()

const REVIEW_INCLUDE = {
  user: {
    select: {
      id: true,
      username: true,
      nickname: true,
    },
  },
}

function parsePositiveId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function parseReviewBody(body) {
  const rating = Number(body.rating)
  const comment = String(body.comment || '').trim()

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: 'Rating must be an integer from 1 to 5' }
  }

  if (!comment) {
    return { error: 'Comment is required' }
  }

  if (comment.length > 1000) {
    return { error: 'Comment must be 1000 characters or fewer' }
  }

  return { rating, comment }
}

function serializeReview(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    user: {
      id: review.user.id,
      username: review.user.username,
      nickname: review.user.nickname,
    },
  }
}

function buildResponse(reviews, aggregate) {
  return {
    averageRating: aggregate._avg.rating || 0,
    reviewCount: aggregate._count.rating || 0,
    reviews: reviews.map(serializeReview),
  }
}

router.get('/books/:bookId', async (req, res) => {
  try {
    const bookId = parsePositiveId(req.params.bookId)
    if (!bookId) return res.status(400).json({ message: 'Invalid book id' })

    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true } })
    if (!book) return res.status(404).json({ message: 'Book not found' })

    const [reviews, aggregate] = await prisma.$transaction([
      prisma.bookReview.findMany({
        where: { bookId },
        include: REVIEW_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.bookReview.aggregate({
        where: { bookId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ])

    return res.json(buildResponse(reviews, aggregate))
  } catch (error) {
    console.error('GET /api/reviews/books/:bookId error:', error)
    return res.status(500).json({ message: 'Failed to load book reviews' })
  }
})

router.put('/books/:bookId', requireAuth, async (req, res) => {
  try {
    const bookId = parsePositiveId(req.params.bookId)
    if (!bookId) return res.status(400).json({ message: 'Invalid book id' })

    const parsed = parseReviewBody(req.body)
    if (parsed.error) return res.status(400).json({ message: parsed.error })

    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true } })
    if (!book) return res.status(404).json({ message: 'Book not found' })

    const review = await prisma.bookReview.upsert({
      where: { userId_bookId: { userId: req.userId, bookId } },
      create: { userId: req.userId, bookId, rating: parsed.rating, comment: parsed.comment },
      update: { rating: parsed.rating, comment: parsed.comment },
      include: REVIEW_INCLUDE,
    })

    return res.json({ message: 'Review saved', review: serializeReview(review) })
  } catch (error) {
    console.error('PUT /api/reviews/books/:bookId error:', error)
    return res.status(500).json({ message: 'Failed to save book review' })
  }
})

router.get('/audio-books/:audioBookId', async (req, res) => {
  try {
    const audioBookId = parsePositiveId(req.params.audioBookId)
    if (!audioBookId) return res.status(400).json({ message: 'Invalid audio book id' })

    const audioBook = await prisma.audioBook.findUnique({ where: { id: audioBookId }, select: { id: true } })
    if (!audioBook) return res.status(404).json({ message: 'Audio book not found' })

    const [reviews, aggregate] = await prisma.$transaction([
      prisma.audioBookReview.findMany({
        where: { audioBookId },
        include: REVIEW_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.audioBookReview.aggregate({
        where: { audioBookId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ])

    return res.json(buildResponse(reviews, aggregate))
  } catch (error) {
    console.error('GET /api/reviews/audio-books/:audioBookId error:', error)
    return res.status(500).json({ message: 'Failed to load audio book reviews' })
  }
})

router.put('/audio-books/:audioBookId', requireAuth, async (req, res) => {
  try {
    const audioBookId = parsePositiveId(req.params.audioBookId)
    if (!audioBookId) return res.status(400).json({ message: 'Invalid audio book id' })

    const parsed = parseReviewBody(req.body)
    if (parsed.error) return res.status(400).json({ message: parsed.error })

    const audioBook = await prisma.audioBook.findUnique({ where: { id: audioBookId }, select: { id: true } })
    if (!audioBook) return res.status(404).json({ message: 'Audio book not found' })

    const review = await prisma.audioBookReview.upsert({
      where: { userId_audioBookId: { userId: req.userId, audioBookId } },
      create: {
        userId: req.userId,
        audioBookId,
        rating: parsed.rating,
        comment: parsed.comment,
      },
      update: { rating: parsed.rating, comment: parsed.comment },
      include: REVIEW_INCLUDE,
    })

    return res.json({ message: 'Review saved', review: serializeReview(review) })
  } catch (error) {
    console.error('PUT /api/reviews/audio-books/:audioBookId error:', error)
    return res.status(500).json({ message: 'Failed to save audio book review' })
  }
})

module.exports = router