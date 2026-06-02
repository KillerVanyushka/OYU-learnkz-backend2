const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { predictLetterFromAudio } = require("../utils/alphabet"); // путь к service.js

const router = express.Router();

const ffmpegPath = require('ffmpeg-static');

const uploadsDir = path.join(__dirname, "../uploads");
const tempDir = path.join(__dirname, "../temp");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({
    dest: uploadsDir,
    limits: { fileSize: 20 * 1024 * 1024 }
});

function convertToWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            "-y", "-i", inputPath,
            "-ac", "1", "-ar", "16000", outputPath
        ]);
        let stderr = "", stdout = "";
        ffmpeg.stdout.on("data", (data) => stdout += data.toString());
        ffmpeg.stderr.on("data", (data) => stderr += data.toString());
        ffmpeg.on("error", (error) => reject(new Error(`ffmpeg spawn error: ${error.message}`)));
        ffmpeg.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr || stdout || `ffmpeg conversion failed with code ${code}`));
        });
    });
}

router.post("/predict-letter", upload.single("audio"), async (req, res) => {
    let inputPath = null, outputPath = null;
    try {
        if (!req.file) {
            return res.status(400).json({ error: "audio file is required" });
        }
        inputPath = req.file.path;
        outputPath = path.join(tempDir, `${Date.now()}-${req.file.filename}.wav`);

        await convertToWav(inputPath, outputPath);

        const result = await predictLetterFromAudio(outputPath);
        return res.status(200).json(result);
    } catch (error) {
        console.error("predict-letter error:", error.message);
        return res.status(500).json({ error: "failed to predict letter", details: error.message });
    } finally {
        try {
            if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupError) {
            console.error("cleanup error:", cleanupError.message);
        }
    }
});

module.exports = router;