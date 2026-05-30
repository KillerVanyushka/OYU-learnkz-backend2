const express = require('express')
const prisma = require('../utils/prisma')

const router = express.Router()

const recentLetterIds = []
const MAX_RECENT = 5

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle(arr) {
    return [...arr].sort(() => Math.random() - 0.5)
}

function parseExamples(examples) {
    if (!examples) return []

    if (Array.isArray(examples)) {
        return examples
    }

    try {
        return JSON.parse(examples)
    } catch (e) {
        return []
    }
}

function getRandomLetter(letters) {
    let availableLetters = letters.filter(
        letter => !recentLetterIds.includes(letter.id)
    )

    if (!availableLetters.length) {
        recentLetterIds.length = 0
        availableLetters = letters
    }

    const selectedLetter = randomItem(availableLetters)

    recentLetterIds.push(selectedLetter.id)

    if (recentLetterIds.length > MAX_RECENT) {
        recentLetterIds.shift()
    }

    return selectedLetter
}

function buildLetterOptions(letters, correctLetter) {
    const wrongLetters = shuffle(
        letters
            .filter(letter => letter.id !== correctLetter.id)
            .map(letter => letter.uppercase)
    ).slice(0, 3)

    return shuffle([
        correctLetter.uppercase,
        ...wrongLetters,
    ])
}

router.get('/random', async (req, res) => {
    try {
        const letters = await prisma.alphabetLetter.findMany({
            orderBy: {
                orderIndex: 'asc',
            },
        })

        if (!letters.length) {
            return res.status(404).json({
                message: 'No letters found',
            })
        }

        const selectedLetter = getRandomLetter(letters)

        const availableGameTypes = [
            'audio',
            'word_to_letter',
            'letter_to_word',
            'case_match',
        ]

        const gameType = randomItem(availableGameTypes)

        if (
            gameType === 'audio' &&
            selectedLetter.audioUrl
        ) {
            return res.json({
                type: 'audio',
                title: 'Listen and choose the letter',
                audioUrl: `/api/alphabet/${selectedLetter.id}/audio`,
                question: null,
                correctAnswer: selectedLetter.uppercase,
                options: buildLetterOptions(
                    letters,
                    selectedLetter
                ),
            })
        }

        if (gameType === 'word_to_letter') {
            const examples =
                parseExamples(selectedLetter.examples)

            if (examples.length) {
                const example =
                    randomItem(examples)

                return res.json({
                    type: 'word_to_letter',
                    title:
                        'Which letter does this word start with?',
                    question: example.kz,
                    correctAnswer:
                    selectedLetter.uppercase,
                    options: buildLetterOptions(
                        letters,
                        selectedLetter
                    ),
                })
            }
        }

        if (gameType === 'letter_to_word') {
            const validLetters =
                letters.filter(letter => {
                    const examples =
                        parseExamples(letter.examples)

                    return examples.length > 0
                })

            if (validLetters.length >= 4) {
                const gameLetter =
                    randomItem(validLetters)

                const correctExamples =
                    parseExamples(
                        gameLetter.examples
                    )

                const correctWord =
                    randomItem(correctExamples).kz

                const wrongWords = []

                for (const letter of shuffle(validLetters)) {
                    if (
                        letter.id === gameLetter.id
                    ) {
                        continue
                    }

                    const examples =
                        parseExamples(letter.examples)

                    if (!examples.length) {
                        continue
                    }

                    wrongWords.push(
                        randomItem(examples).kz
                    )

                    if (wrongWords.length >= 3) {
                        break
                    }
                }

                if (wrongWords.length === 3) {
                    return res.json({
                        type: 'letter_to_word',
                        title:
                            'Choose the correct word',
                        question:
                        gameLetter.uppercase,
                        correctAnswer:
                        correctWord,
                        options: shuffle([
                            correctWord,
                            ...wrongWords,
                        ]),
                    })
                }
            }
        }

        return res.json({
            type: 'case_match',
            title:
                'Choose the uppercase letter',
            question:
            selectedLetter.lowercase,
            correctAnswer:
            selectedLetter.uppercase,
            options: buildLetterOptions(
                letters,
                selectedLetter
            ),
        })
    } catch (error) {
        console.error(
            'Alphabet game error:',
            error
        )

        return res.status(500).json({
            message:
                'Failed to generate game',
        })
    }
})

module.exports = router