const router = require('express').Router()
const prisma = require('../utils/prisma')
const requireAuth = require('../middlewares/requireAuth')

const r2 = require('../utils/r2')
const { GetObjectCommand } = require('@aws-sdk/client-s3')

const LEVEL_ORDER = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 }

function extractKeyFromAudioUrl(audioUrl) {
  // ожидаем: `${R2_ENDPOINT}/${BUCKET}/${key}`
  const prefix = `${process.env.R2_ENDPOINT.replace(/\/$/, '')}/${process.env.R2_BUCKET}/`
  if (!audioUrl.startsWith(prefix)) return null
  return audioUrl.slice(prefix.length)
}

router.get('/:id/audio', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id))
      return res.status(400).json({ message: 'Invalid task id' })

    const task = await prisma.task.findFirst({
      where: { id, isArchived: false, lesson: { isArchived: false } },
      select: {
        id: true,
        type: true,
        audioUrl: true,
        lesson: { select: { level: true } },
      },
    })

    if (!task) return res.status(404).json({ message: 'Task not found' })
    if (!task.audioUrl)
      return res.status(400).json({ message: 'Task has no audio' })

    // проверим уровень доступа
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { level: true },
    })
    if (!user) return res.status(404).json({ message: 'User not found' })

    const userRank = LEVEL_ORDER[user.level ?? 'A0']
    const lessonRank = LEVEL_ORDER[task.lesson.level ?? 'A0']
    if (lessonRank > userRank) {
      return res
        .status(403)
        .json({ message: 'Lesson is locked for your level' })
    }

    const key = extractKeyFromAudioUrl(task.audioUrl)
    if (!key) return res.status(500).json({ message: 'Bad audioUrl format' })

    const obj = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }),
    )

    // контент-тайп (если есть) — иначе audio/mpeg
    res.setHeader('Content-Type', obj.ContentType || 'audio/mpeg')
    if (obj.ContentLength)
      res.setHeader('Content-Length', String(obj.ContentLength))
    res.setHeader('Cache-Control', 'public, max-age=3600')

    // стрим в ответ
    obj.Body.pipe(res)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
