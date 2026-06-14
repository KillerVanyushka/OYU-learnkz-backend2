// service.js (для speaking)
const fs = require("fs");
const axios = require("axios");
const OpenAI = require("openai");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // ваш ключ
const TRANSCRIPTION_MODELS = (
    process.env.OPENROUTER_TRANSCRIPTION_MODELS ||
    "openai/gpt-4o-transcribe,openai/whisper-large-v3-turbo"
)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const EVALUATION_MODEL = "openai/gpt-4o-mini"; // для оценки текста

const openai = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
});

// ─── helpers ────────────────────────────────────────────────────────────────

function safeParseJson(text) {
    if (!text) return null;
    if (typeof text !== "string") {
        try { return JSON.parse(JSON.stringify(text)); } catch { return null; }
    }
    try { return JSON.parse(text); } catch (e) {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { return null; }
        }
        return null;
    }
}

function clampScore(value, min = 0, max = 10) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.min(max, Math.max(min, Math.round(num * 10) / 10));
}

function calculateOverall(scores) {
    if (!scores) return 0;
    return clampScore(
        scores.fluency * 0.25 +
        scores.pronunciation * 0.20 +
        scores.grammar * 0.20 +
        scores.vocabulary * 0.20 +
        scores.coherence * 0.15
    );
}

function describeAxiosError(error) {
    const status = error?.response?.status;
    const data = error?.response?.data;

    if (data) {
        const details =
            typeof data === "string"
                ? data
                : JSON.stringify(data);
        return status ? `${status}: ${details}` : details;
    }

    return error?.message || "Unknown request error";
}

async function transcribeAudio(wavPath) {
    let lastError = null;

    for (const model of TRANSCRIPTION_MODELS) {
        try {
            const response = await openai.audio.transcriptions.create({
                file: fs.createReadStream(wavPath),
                model,
                language: "kk",
            });

            if (response?.text) {
                return response.text;
            }

            throw new Error(`Transcription response did not contain text for model ${model}`);
        } catch (error) {
            lastError = new Error(
                `Transcription failed for model ${model}: ${describeAxiosError(error)}`
            );
        }
    }

    throw lastError || new Error("Transcription failed");
}

async function evaluateText(transcript, topic, language) {
    const languageInstructions = {
        en: "The user is speaking in Kazakh. Evaluate their Kazakh speaking skills based on the transcript.",
        ru: "Пользователь говорит на казахском языке. Оцени его разговорные навыки казахского на основе транскрипта.",
        kk: "Пайдаланушы қазақ тілінде сөйлеген. Транскрипт бойынша оның қазақша сөйлеу дағдыларын бағала.",
    };
    const outputLangInstruction = {
        en: "Write all feedback in English.",
        ru: "Write all feedback in Russian.",
        kk: "Барлық жауапты тек қазақ тілінде жаз.",
    };
    const langInstruction = languageInstructions[language] || languageInstructions["en"];
    const outputInstruction = outputLangInstruction[language] || outputLangInstruction["en"];
    const topicLine = topic ? `Topic/question: "${topic}"` : "";

    const systemPrompt = `
You are an expert language speaking coach.

${langInstruction}
${outputInstruction}
${topicLine}

Based on the transcript of the user's spoken response (in Kazakh), evaluate their speaking skills.

Return ONLY valid JSON:
{
    "transcript": "copy the transcript here",
    "overall_score": 7.5,
    "scores": {
        "fluency": 8.0,
        "pronunciation": 7.0,
        "grammar": 7.5,
        "vocabulary": 8.0,
        "coherence": 7.0
    },
    "corrections": [
        {
            "original": "Мен кеше мектепке барамын",
            "corrected": "Мен кеше мектепке бардым",
            "explanation": "Өткен шақ қолданылуы керек"
        }
    ],
    "tips": ["Use past tense correctly", "Work on vowel harmony"],
    "strengths": ["Good vocabulary range", "Clear pronunciation"],
    "summary": "You did well on... but need to improve..."
}

Scoring rules (0-10):
- fluency: smoothness, natural flow, lack of hesitations
- pronunciation: clarity, accent, correct sounds
- grammar: correctness of sentence structures
- vocabulary: richness and appropriateness
- coherence: logical organisation

Corrections: only real mistakes, max 5.
Tips: 2-4 actionable.
Strengths: 1-3 positives.
Summary: 2-3 sentences, encouraging.

Return JSON only. No extra text.
    `.trim();

    const completion = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            model: EVALUATION_MODEL,
            temperature: 0,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Transcript: "${transcript}"` }
            ]
        },
        {
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            }
        }
    );

    const rawContent = completion.data.choices[0]?.message?.content || "";
    const parsed = safeParseJson(rawContent);
    if (!parsed) throw new Error("Failed to parse evaluation JSON");

    const scores = {
        fluency: clampScore(parsed.scores?.fluency),
        pronunciation: clampScore(parsed.scores?.pronunciation),
        grammar: clampScore(parsed.scores?.grammar),
        vocabulary: clampScore(parsed.scores?.vocabulary),
        coherence: clampScore(parsed.scores?.coherence),
    };

    return {
        transcript: String(parsed.transcript || transcript),
        overall_score: calculateOverall(scores),
        scores,
        corrections: Array.isArray(parsed.corrections) ? parsed.corrections.slice(0,5).map(c => ({
            original: String(c.original || ""),
            corrected: String(c.corrected || ""),
            explanation: String(c.explanation || "")
        })) : [],
        tips: Array.isArray(parsed.tips) ? parsed.tips.map(String) : [],
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
        summary: String(parsed.summary || "")
    };
}

async function evaluateSpeaking(wavPath, topic = "", language = "en") {
    if (!wavPath || !fs.existsSync(wavPath)) {
        throw new Error(`Audio file not found: ${wavPath}`);
    }

    // 1. Распознаём речь
    const transcript = await transcribeAudio(wavPath);
    // 2. Оцениваем текст
    const evaluation = await evaluateText(transcript, topic, language);
    return evaluation;
}

module.exports = { evaluateSpeaking };
