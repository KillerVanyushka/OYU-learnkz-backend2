const router = require('express').Router()
const multer = require('multer')
const { PutObjectCommand } = require('@aws-sdk/client-s3')
const r2 = require('../utils/r2')
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')
const requireRole = require('../middlewares/requireRole')

const upload = multer({ storage: multer.memoryStorage() })

router.post(
  '/upload-audio',
  requireAuth,
  requireRole('ADMIN', 'MODERATOR'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'File required' })

      if (!req.file.mimetype.startsWith('audio/')) {
        return res.status(400).json({ message: 'Only audio allowed' })
      }

      const key = `audio/${Date.now()}-${req.file.originalname}`

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        }),
      )

      const audioUrl = `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}/${key}`
      const title = String(req.body?.title || req.file.originalname).trim()

      const audio = await prisma.uploadedAudio.create({
        data: {
          title: title || req.file.originalname,
          audioUrl,
        },
        select: {
          id: true,
          title: true,
          audioUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      res.json({
        message: 'Audio uploaded successfully',
        audioUrl,
        audio,
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Upload error' })
    }
  },
)

module.exports = router
