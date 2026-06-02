const fs = require("fs");
const OpenAI = require("openai");

// ⚠️ ВНИМАНИЕ: хранить ключ в коде небезопасно. Для реального проекта используйте переменные окружения.
const CROSTHE = process.env.OPENROUTER_API_KEY;

if (!CROSTHE) {
    throw new Error("API key is not set");
}

// Правильная инициализация для OpenRouter
const openai = new OpenAI({
    apiKey: CROSTHE,
    baseURL: "https://openrouter.ai/api/v1",
});

const MODEL = "openai/gpt-audio-mini";

const KAZAKH_LETTERS = [
    "а","ә","б","в","г","ғ","д","е","ё","ж","з","и","й","к","қ","л",
    "м","н","ң","о","ө","п","р","с","т","у","ұ","ү","ф","х","һ","ц",
    "ч","ш","щ","ъ","ы","і","ь","э","ю","я"
];

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

function clampConfidence(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.min(1, Math.max(0, num));
}

async function predictLetterFromAudio(wavPath) {
    if (!wavPath || !fs.existsSync(wavPath)) {
        throw new Error(`Audio file not found: ${wavPath}`);
    }

    const audioBuffer = fs.readFileSync(wavPath);
    const base64Audio = audioBuffer.toString("base64");

    const completion = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages: [
            {
                role: "developer",
                content: `
You are a Kazakh alphabet audio classifier.
The user says exactly one single Kazakh letter.
Return JSON only:
{
  "predicted_letter": "ә",
  "confidence": 0.91
}
Allowed letters:
${KAZAKH_LETTERS.join(", ")}
Rules:
- return exactly one letter from the allowed list
- no explanation
- JSON only
- confidence from 0 to 1
                `.trim()
            },
            {
                role: "user",
                content: [
                    { type: "text", text: "Predict the Kazakh letter from this audio." },
                    {
                        type: "input_audio",
                        input_audio: { data: base64Audio, format: "wav" }
                    }
                ]
            }
        ]
    });

    const rawContent = completion?.choices?.[0]?.message?.content;
    let rawText = "";
    if (typeof rawContent === "string") rawText = rawContent;
    else if (Array.isArray(rawContent)) {
        rawText = rawContent.map(item => item?.text || "").join("\n").trim();
    }

    const parsed = safeParseJson(rawText);
    if (!parsed || !parsed.predicted_letter) {
        return { predicted_letter: null, confidence: 0 };
    }

    const predictedLetter = String(parsed.predicted_letter).trim().toLowerCase();
    const confidence = clampConfidence(parsed.confidence);

    return {
        predicted_letter: KAZAKH_LETTERS.includes(predictedLetter) ? predictedLetter : null,
        confidence: KAZAKH_LETTERS.includes(predictedLetter) ? confidence : 0
    };
}

module.exports = { predictLetterFromAudio };