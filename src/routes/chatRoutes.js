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
            data: {
                userId,
                message,
                role: 'user',
            },
        });

        // Отправляем запрос в Gemini API
        const response = await axios.post(
            'https://gemini.googleapis.com/v1beta2/models/text-bison-001:generateText',
            {
                prompt: message,
                temperature: 0.7,
                maxOutputTokens: 500
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const aiMessage = response.data.candidates?.[0]?.content || 'Ошибка генерации ответа';

        // Сохраняем ответ AI
        await prisma.chatMessage.create({
            data: {
                userId,
                message: aiMessage,
                role: 'ai',
            },
        });

        res.json({ aiMessage });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;