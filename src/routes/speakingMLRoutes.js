const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { evaluateSpeaking } = require("../utils/speaking"); // ← сервисная логика (адаптирована под OpenRouter)

const router = express.Router();

const ffmpegStatic = require('ffmpeg-static');
const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic;
const uploadsDir = path.join(__dirname, "uploads");
const tempDir = path.join(__dirname, "temp");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(tempDir))    fs.mkdirSync(tempDir,    { recursive: true });

const upload = multer({
    dest: uploadsDir,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ─── helpers ────────────────────────────────────────────────────────────────

function convertToWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            "-y",
            "-i", inputPath,
            "-ac", "1",
            "-ar", "16000",
            outputPath,
        ]);

        let stderr = "";
        ffmpeg.stderr.on("data", (d) => (stderr += d.toString()));
        ffmpeg.on("error", (err) => reject(new Error(`ffmpeg spawn error: ${err.message}`)));
        ffmpeg.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr || `ffmpeg failed with code ${code}`));
        });
    });
}

function cleanup(...paths) {
    for (const p of paths) {
        try {
            if (p && fs.existsSync(p)) fs.unlinkSync(p);
        } catch (e) {
            console.error("cleanup error:", e.message);
        }
    }
}

// ─── POST /evaluate ──────────────────────────────────────────────────────────
/**
 * Body (multipart/form-data):
 *   audio    {File}   required  — любой аудиоформат
 *   topic    {string} optional  — тема или вопрос
 *   language {string} optional  — "en" | "ru" | "kk"  (default: "en")
 *
 * Response 200:
 * {
 *   transcript:    string,
 *   overall_score: number,        // 0–10
 *   scores: {
 *     fluency, pronunciation, grammar, vocabulary, coherence  // 0–10
 *   },
 *   corrections: [{ original, corrected, explanation }],
 *   tips:      string[],
 *   strengths: string[],
 *   summary:   string
 * }
 */
router.post("/evaluate", upload.single("audio"), async (req, res) => {
    let inputPath  = null;
    let outputPath = null;

    try {
        console.log("POST /evaluate called");

        if (!req.file) {
            return res.status(400).json({ error: "audio file is required" });
        }

        const topic    = String(req.body?.topic    || "").trim();
        const language = String(req.body?.language || "en").trim().toLowerCase();

        const allowedLanguages = ["en", "ru", "kk"];
        if (!allowedLanguages.includes(language)) {
            return res.status(400).json({
                error: `language must be one of: ${allowedLanguages.join(", ")}`,
            });
        }

        console.log("file info:", {
            originalname: req.file.originalname,
            mimetype:     req.file.mimetype,
            size:         req.file.size,
        });

        inputPath  = req.file.path;
        outputPath = path.join(tempDir, `${Date.now()}-${req.file.filename}.wav`);

        console.log("converting to wav...");
        await convertToWav(inputPath, outputPath);

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) throw new Error("converted wav file is empty");

        console.log("evaluating speaking...");
        const result = await evaluateSpeaking(outputPath, topic, language);
        console.log("evaluation done. overall_score:", result.overall_score);

        return res.status(200).json(result);
    } catch (error) {
        console.error("evaluate error:", error.message);
        console.error(error.stack);

        return res.status(500).json({
            error:   "failed to evaluate speaking",
            details: error.message,
        });
    } finally {
        cleanup(inputPath, outputPath);
    }
});

module.exports = router;