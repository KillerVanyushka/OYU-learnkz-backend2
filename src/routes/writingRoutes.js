require('dotenv').config()
const express = require('express')
const router = express.Router()
const axios = require('axios')

const WRITING_MODEL =
  process.env.OPENROUTER_WRITING_MODEL || 'qwen/qwen3.5-plus-02-15'

function buildPrompt(topic, text) {
  return [
    'You are a Kazakh writing teacher.',
    '',
    'The student wrote a text in Kazakh.',
    'Topic: "' + topic + '"',
    '',
    'Student text:',
    text,
    '',
    'Please evaluate:',
    '1. Grammar',
    '2. Spelling',
    '3. Punctuation',
    '4. Clarity of ideas',
    '5. Topic relevance',
    '6. Vocabulary usage',
    '',
    'Write the explanation in Russian.',
    'Show all corrected examples in Kazakh.',
    '',
    'Use this exact structure:',
    '1. Overall assessment',
    '2. Score from 1 to 10',
    '3. What is good',
    '4. Mistakes and what to fix',
    '5. Corrected version in Kazakh',
    '6. Advice for improving Kazakh writing',
    '',
    'If the text is short, still give useful feedback.',
  ].join('\n')
}

function extractTextContent(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || '')
      .join('\n')
      .trim()
  }
  return ''
}

router.post('/evaluate', async (req, res) => {
  try {
    const { topic, text } = req.body

    if (!topic || !text) {
      return res.status(400).json({ message: 'topic and text are required' })
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: WRITING_MODEL,
        messages: [
          {
            role: 'user',
            content: buildPrompt(String(topic).trim(), String(text).trim()),
          },
        ],
        temperature: 0.4,
      },
      {
        headers: {
          Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
      },
    )

    const feedback = extractTextContent(
      response.data?.choices?.[0]?.message?.content,
    )

    return res.json({
      feedback: feedback || 'No feedback generated',
    })
  } catch (err) {
    const details = err.response?.data || err.message || 'Unknown error'
    console.error('Writing route error:', details)
    return res.status(500).json({
      message: 'Server error',
      details,
    })
  }
})

module.exports = router
