require('dotenv').config();
const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const axios = require('axios');

router.post('/chat', async (req, res) => {
    try {
        const { userId, message } = req.body;
        if (!userId || !message) return res.status(400).json({ message: 'userId и message обязательны' });

        // Сохраняем сообщение пользователя
        await prisma.chatMessage.create({
            data: { userId, message, role: 'user' },
        });

        // Qwen API запрос
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'qwen/qwen3.5-plus-02-15',
                messages: [
                    { role: 'user', content: message }
                ],
                reasoning: { enabled: true } // включаем reasoning, если нужно
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const aiMessage = response.data.choices?.[0]?.message?.content || 'Ошибка генерации ответа';

        // Сохраняем ответ AI
        await prisma.chatMessage.create({
            data: { userId, message: aiMessage, role: 'ai' },
        });

        res.json({ aiMessage });

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;