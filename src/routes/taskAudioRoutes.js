const router = require('express').Router()
const prisma = require('../utils/prisma')

const r2 = require('../utils/r2')
const { GetObjectCommand } = require('@aws-sdk/client-s3')

function extractKeyFromAudioUrl(audioUrl) {
  const prefix = `${process.env.R2_ENDPOINT.replace(/\/$/, '')}/${process.env.R2_BUCKET}/`
  if (!audioUrl.startsWith(prefix)) return null
  return audioUrl.slice(prefix.length)
}

router.get('/:id/audio', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (Number.isNaN(id))
      return res.status(400).json({ message: 'Invalid task id' })

    const task = await prisma.task.findFirst({
      where: { id, isArchived: false, lesson: { isArchived: false } },
      select: {
        id: true,
        audioUrl: true,
      },
    })

    if (!task) return res.status(404).json({ message: 'Task not found' })
    if (!task.audioUrl)
      return res.status(400).json({ message: 'Task has no audio' })

    const key = extractKeyFromAudioUrl(task.audioUrl)
    if (!key) return res.status(500).json({ message: 'Bad audioUrl format' })

    const obj = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }),
    )

    res.setHeader('Content-Type', obj.ContentType || 'audio/mpeg')
    if (obj.ContentLength)
      res.setHeader('Content-Length', String(obj.ContentLength))
    res.setHeader('Cache-Control', 'public, max-age=3600')

    obj.Body.pipe(res)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
