const express = require('express');
const prisma = require('../utils/prisma');
const multer = require('multer');
const {
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const r2 = require('../utils/r2');

const router = express.Router();

/**
 * Поддерживаемые mime-типы аудио
 * Важно для файлов с телефона: часто приходят m4a/mp4/x-m4a
 */
const AUDIO_MIME_TO_EXT = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
};

function extFromMime(mime) {
    return AUDIO_MIME_TO_EXT[mime] || null;
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (req, file, cb) => {
        const ext = extFromMime(file.mimetype);

        // Иногда mobile picker шлёт application/octet-stream.
        // В таком случае пропустим файл, а расширение потом попробуем взять из originalname.
        if (file.mimetype === 'application/octet-stream') {
            return cb(null, true);
        }

        if (!ext) {
            return cb(
                new Error(
                    `Unsupported audio mime type: ${file.mimetype}. Allowed: ${Object.keys(
                        AUDIO_MIME_TO_EXT
                    ).join(', ')}`
                )
            );
        }

        cb(null, true);
    },
});

// helpers
function extFromOriginalName(filename) {
    if (!filename) return null;

    const lower = String(filename).toLowerCase().trim();

    if (lower.endsWith('.mp3')) return 'mp3';
    if (lower.endsWith('.wav')) return 'wav';
    if (lower.endsWith('.ogg')) return 'ogg';
    if (lower.endsWith('.webm')) return 'webm';
    if (lower.endsWith('.m4a')) return 'm4a';
    if (lower.endsWith('.aac')) return 'aac';
    if (lower.endsWith('.mp4')) return 'm4a';

    return null;
}

function safeKeyName(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-_.]/g, '');
}

function publicUrlForKey(key) {
    const publicBase = process.env.R2_PUBLIC_BASE_URL;
    const endpoint = process.env.R2_ENDPOINT;
    const bucket = process.env.R2_BUCKET;

    if (publicBase) {
        // если publicBase уже указывает на bucket/cdn, bucket второй раз НЕ добавляем
        return `${publicBase.replace(/\/$/, '')}/${key}`;
    }

    if (endpoint && bucket) {
        // fallback: endpoint/bucket/key
        return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    }

    throw new Error('R2 public URL is not configured');
}

function tryExtractKeyFromUrl(url) {
    try {
        if (!url) return null;

        const publicBase = process.env.R2_PUBLIC_BASE_URL;
        const endpoint = process.env.R2_ENDPOINT;
        const bucket = process.env.R2_BUCKET;

        if (publicBase) {
            const normalizedBase = publicBase.replace(/\/$/, '');
            if (url.startsWith(normalizedBase + '/')) {
                return url.slice((normalizedBase + '/').length);
            }
        }

        if (endpoint && bucket) {
            const prefix = `${endpoint.replace(/\/$/, '')}/${bucket}/`;
            if (url.startsWith(prefix)) {
                return url.slice(prefix.length);
            }
        }

        return null;
    } catch (e) {
        return null;
    }
}

async function deleteFileByUrl(url) {
    const key = tryExtractKeyFromUrl(url);
    if (!key) return false;

    await r2.send(
        new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
        })
    );

    return true;
}

// CREATE: POST /api/admin/alphabet
router.post('/', async (req, res) => {
    try {
        const {
            orderIndex = 0,
            uppercase,
            lowercase,
            pronunciationRu,
            pronunciationEn,
            descriptionRu,
            descriptionEn,
            examples,
            audioUrl,
        } = req.body;

        if (!uppercase || !lowercase) {
            return res
                .status(400)
                .json({ message: 'uppercase and lowercase are required' });
        }

        let examplesJson = null;
        if (examples !== undefined) {
            examplesJson =
                typeof examples === 'string' ? JSON.parse(examples) : examples;
        }

        const created = await prisma.alphabetLetter.create({
            data: {
                orderIndex: Number(orderIndex) || 0,
                uppercase: String(uppercase),
                lowercase: String(lowercase),
                pronunciationRu: pronunciationRu ?? null,
                pronunciationEn: pronunciationEn ?? null,
                descriptionRu: descriptionRu ?? null,
                descriptionEn: descriptionEn ?? null,
                examples: examplesJson,
                audioUrl: audioUrl ?? null,
            },
        });

        return res.status(201).json(created);
    } catch (e) {
        console.error('CREATE alphabet letter error:', e);

        if (e instanceof SyntaxError) {
            return res.status(400).json({ message: 'Invalid JSON in examples field' });
        }

        if (e.code === 'P2002') {
            return res.status(409).json({ message: 'This letter already exists' });
        }

        return res.status(500).json({ message: 'Failed to create alphabet letter' });
    }
});

// UPDATE: PUT /api/admin/alphabet/:id
router.put('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: 'Invalid id' });
        }

        const exists = await prisma.alphabetLetter.findUnique({ where: { id } });
        if (!exists) return res.status(404).json({ message: 'Not found' });

        const {
            orderIndex,
            uppercase,
            lowercase,
            pronunciationRu,
            pronunciationEn,
            descriptionRu,
            descriptionEn,
            examples,
            audioUrl,
        } = req.body;

        let examplesJson = undefined;
        if (examples !== undefined) {
            examplesJson =
                typeof examples === 'string' ? JSON.parse(examples) : examples;
        }

        const updated = await prisma.alphabetLetter.update({
            where: { id },
            data: {
                orderIndex:
                    orderIndex !== undefined ? Number(orderIndex) || 0 : undefined,
                uppercase: uppercase !== undefined ? String(uppercase) : undefined,
                lowercase: lowercase !== undefined ? String(lowercase) : undefined,
                pronunciationRu:
                    pronunciationRu !== undefined ? pronunciationRu : undefined,
                pronunciationEn:
                    pronunciationEn !== undefined ? pronunciationEn : undefined,
                descriptionRu:
                    descriptionRu !== undefined ? descriptionRu : undefined,
                descriptionEn:
                    descriptionEn !== undefined ? descriptionEn : undefined,
                examples: examplesJson,
                audioUrl: audioUrl !== undefined ? audioUrl : undefined,
            },
        });

        return res.json(updated);
    } catch (e) {
        console.error('UPDATE alphabet letter error:', e);

        if (e instanceof SyntaxError) {
            return res.status(400).json({ message: 'Invalid JSON in examples field' });
        }

        if (e.code === 'P2002') {
            return res.status(409).json({ message: 'This letter already exists' });
        }

        return res.status(500).json({ message: 'Failed to update alphabet letter' });
    }
});

// DELETE: DELETE /api/admin/alphabet/:id
router.delete('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: 'Invalid id' });
        }

        const letter = await prisma.alphabetLetter.findUnique({ where: { id } });
        if (!letter) return res.status(404).json({ message: 'Not found' });

        if (letter.audioUrl) {
            try {
                await deleteFileByUrl(letter.audioUrl);
            } catch (fileErr) {
                console.warn('Failed to delete audio from R2:', fileErr);
            }
        }

        await prisma.alphabetLetter.delete({ where: { id } });

        return res.json({ message: 'Deleted' });
    } catch (e) {
        console.error('DELETE alphabet letter error:', e);
        return res.status(500).json({ message: 'Failed to delete alphabet letter' });
    }
});

// UPLOAD AUDIO: POST /api/admin/alphabet/:id/audio
// multipart/form-data, field name: file
router.post('/:id/audio', upload.single('file'), async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: 'Invalid id' });
        }

        const letter = await prisma.alphabetLetter.findUnique({ where: { id } });
        if (!letter) return res.status(404).json({ message: 'Not found' });

        if (!req.file) {
            return res
                .status(400)
                .json({ message: 'file is required (field name: file)' });
        }

        if (!process.env.R2_BUCKET) {
            return res.status(500).json({ message: 'R2_BUCKET is not set' });
        }

        // Определяем расширение сначала по MIME, потом по имени файла
        let ext = extFromMime(req.file.mimetype);
        if (!ext) {
            ext = extFromOriginalName(req.file.originalname);
        }

        if (!ext) {
            return res.status(400).json({
                message: `Audio format not recognized. mimetype=${req.file.mimetype}, originalname=${req.file.originalname}`,
            });
        }

        const safeUpper = safeKeyName(letter.uppercase || 'letter');
        const key = `alphabet/${id}/${safeUpper}-${Date.now()}.${ext}`;

        await r2.send(
            new PutObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: key,
                Body: req.file.buffer,
                ContentType:
                    req.file.mimetype === 'application/octet-stream'
                        ? `audio/${ext === 'm4a' ? 'mp4' : ext}`
                        : req.file.mimetype,
            })
        );

        // Проверка, что объект реально загружен
        await r2.send(
            new HeadObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: key,
            })
        );

        const audioUrl = publicUrlForKey(key);

        const updated = await prisma.alphabetLetter.update({
            where: { id },
            data: { audioUrl },
        });

        // Удаляем старый файл только после успешного обновления БД
        if (letter.audioUrl && letter.audioUrl !== audioUrl) {
            try {
                await deleteFileByUrl(letter.audioUrl);
            } catch (fileErr) {
                console.warn('Failed to delete previous audio from R2:', fileErr);
            }
        }

        return res.json({
            message: 'Audio uploaded successfully',
            audioUrl,
            letter: updated,
            file: {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                ext,
            },
        });
    } catch (e) {
        console.error('UPLOAD alphabet audio error:', e);

        if (e.message?.startsWith('Unsupported audio mime type:')) {
            return res.status(400).json({ message: e.message });
        }

        return res.status(500).json({
            message: 'Failed to upload audio',
            error: e.message || 'Unknown error',
        });
    }
});

module.exports = router;