require('dotenv').config();
const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const axios = require('axios');

const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'qwen/qwen3-plus';

router.post('/chat', async (req, res) => {
    try {
        const { userId, message } = req.body;
        if (!userId || !message) {
            return res.status(400).json({ message: 'userId and message are required' });
        }

        await prisma.chatMessage.create({
            data: { userId, message, role: 'user' },
        });

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: CHAT_MODEL,
                messages: [
                    { role: 'user', content: message }
                ],
                temperature: 0.7,
            },
            {
                headers: {
                    Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY,
                    'Content-Type': 'application/json',
                },
                timeout: 90000,
            }
        );

        const aiMessage = response.data?.choices?.[0]?.message?.content || 'Failed to generate a response';

        await prisma.chatMessage.create({
            data: { userId, message: aiMessage, role: 'ai' },
        });

        return res.json({ aiMessage });
    } catch (err) {
        const details = err.response?.data || err.message || 'Unknown error';
        console.error('Chat route error:', details);
        return res.status(500).json({
            message: 'Server error',
            details,
        });
    }
});

module.exports = router;
