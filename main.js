const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

let mainWindow;
let apiServer;

// Validate environment variables
if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in .env file');
    app.quit();
}

function startAPIServer() {
    const apiApp = express();

    // PENTING: Limit diperbesar menjadi 2GB untuk menangani upload video base64 yang besar
    apiApp.use(express.json({ limit: '2048mb' }));
    apiApp.use(express.urlencoded({ limit: '2048mb', extended: true }));
    apiApp.use(cors());

    // Import Services
    const aiService = require('./src/backend/ai-service');
    const videoService = require('./src/backend/video-service');

    // Health check
    apiApp.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ==========================================
    // FITUR 1: IMAGE GENERATION (Text & Ref)
    // ==========================================

    // Generate by command
    apiApp.post('/api/generate-by-command', async (req, res) => {
        try {
            const { prompt, sampleCount, isProductOnly, isConsistent } = req.body;
            if (!prompt) {
                return res.status(400).json({ success: false, error: 'Prompt is required.' });
            }
            const result = await aiService.generateImage(prompt, sampleCount, isProductOnly, isConsistent);
            if (result.success) {
                res.json({ success: true, data: { imagesBase64: result.imagesBase64 } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Generate by Reference
    apiApp.post('/api/generate-by-reference', async (req, res) => {
        try {
            const { referenceBase64, prompt, sampleCount } = req.body;
            if (!referenceBase64 || !prompt) {
                return res.status(400).json({ success: false, error: 'Required fields missing.' });
            }
            const result = await aiService.generateByReference(referenceBase64, prompt, sampleCount);
            if (result.success) {
                res.json({ success: true, data: { imagesBase64: result.imagesBase64 } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==========================================
    // FITUR 2: PRODUCT SWAP & MODEL
    // ==========================================

    // Langkah 1: Segment Product
    apiApp.post('/api/segment-product', async (req, res) => {
        try {
            const { productBase64, segmentPrompt } = req.body;
            if (!productBase64 || !segmentPrompt) {
                return res.status(400).json({ success: false, error: 'productBase64 and segmentPrompt are required.' });
            }
            const result = await aiService.segmentProduct(productBase64, segmentPrompt);
            if (result.success) {
                res.json({ success: true, data: { imageBase64: result.imageBase64 } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Langkah 2: Generate Model from Product
    apiApp.post('/api/generate-model-from-product', async (req, res) => {
        try {
            const { prompt, cleanProductBase64, sampleCount, mode, modelReferenceBase64 } = req.body;
            if (!cleanProductBase64 || !mode) {
                return res.status(400).json({ success: false, error: 'cleanProductBase64 and mode are required.' });
            }
            const result = await aiService.generateModelFromProduct(
                cleanProductBase64, sampleCount, mode, prompt, modelReferenceBase64
            );
            if (result.success) {
                res.json({ success: true, data: { imagesBase64: result.imagesBase64, angleTitles: result.angleTitles } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==========================================
    // FITUR 3: IMAGE TO VIDEO (VEO)
    // ==========================================

    // Langkah A: Generate Video Prompt
    apiApp.post('/api/generate-video-prompt', async (req, res) => {
        try {
            // UPDATE: Menerima aiModel dari request body
            const { productBase64, modelBase64, platform, duration, aiModel } = req.body;
            if (!productBase64 || !modelBase64 || !platform || !duration) {
                return res.status(400).json({ success: false, error: 'Required fields missing.' });
            }
            // Meneruskan parameter aiModel ke service
            const result = await aiService.generateVeoPrompt(productBase64, modelBase64, platform, duration, aiModel);
            if (result.success) {
                res.json({ success: true, data: { scriptData: result.scriptData } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Langkah B: Generate Video (Placeholder)
    apiApp.post('/api/generate-video-from-image', async (req, res) => {
        try {
            const { prompt } = req.body;
            if (!prompt) {
                return res.status(400).json({ success: false, error: 'Prompt is required.' });
            }
            const result = await aiService.generateVideoFromImage(prompt);
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==========================================
    // FITUR 4: AUDIO GENERATOR & SCRIPT
    // ==========================================

    // Langkah A: Generate Audio Script
    apiApp.post('/api/generate-audio-script', async (req, res) => {
        try {
            const { productBase64, modelBase64, platform, duration, aiModel } = req.body;

            if (!productBase64 || !modelBase64 || !platform || !duration) {
                return res.status(400).json({ success: false, error: 'Required fields missing.' });
            }

            const result = await aiService.generateAudioScript(productBase64, modelBase64, platform, duration, aiModel);

            if (result.success) {
                res.json({ success: true, data: { scriptData: result.scriptData } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Langkah B: Generate Voiceover
    apiApp.post('/api/generate-voiceover', async (req, res) => {
        try {
            const { script, voiceName } = req.body;
            if (!script || !voiceName) {
                return res.status(400).json({ success: false, error: 'script and voiceName are required.' });
            }
            const result = await aiService.generateVoiceover(script, voiceName);
            if (result.success) {
                res.json({ success: true, data: { audioBase64: result.audioBase64, sampleRate: result.sampleRate } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Langkah C: Rekomendasi Musik
    apiApp.post('/api/recommend-music', async (req, res) => {
        try {
            const { mood, script } = req.body;
            if (!mood) {
                return res.status(400).json({ success: false, error: 'Mood harus diisi.' });
            }
            const result = await aiService.recommendMusic(mood, script);
            if (result.success) {
                res.json({ success: true, data: { recommendation: result.recommendation } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Langkah D: Rekomendasi SFX
    apiApp.post('/api/recommend-sfx', async (req, res) => {
        try {
            const { script } = req.body;
            if (!script) {
                return res.status(400).json({ success: false, error: 'Naskah (script) harus ada untuk dianalisis.' });
            }
            const result = await aiService.recommendSfx(script);
            if (result.success) {
                res.json({ success: true, data: { recommendation: result.recommendation } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==========================================
    // FITUR 5: CAPTION & HASHTAG
    // ==========================================

    apiApp.post('/api/generate-caption-hashtags', async (req, res) => {
        try {
            const { platform, productBase64, modelBase64, keywords } = req.body;

            // Validasi minimal satu gambar ada
            if (!productBase64 && !modelBase64) {
                return res.status(400).json({ success: false, error: 'At least one image (product or model) is required.' });
            }

            const result = await aiService.generateCaptionAndHashtags(platform, productBase64, modelBase64, keywords);

            if (result.success) {
                res.json({ success: true, data: result.data });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Endpoint Khusus Remove Background (Logo/Watermark)
    apiApp.post('/api/remove-background', async (req, res) => {
        try {
            const { imageBase64, prompt } = req.body;
            if (!imageBase64) {
                return res.status(400).json({ success: false, error: 'Image is required.' });
            }
            // Default prompt jika user tidak mengisi
            const cleanPrompt = prompt || "logo";

            const result = await aiService.removeBackground(imageBase64, cleanPrompt);

            if (result.success) {
                res.json({ success: true, data: { imageBase64: result.imageBase64 } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==========================================
    // FITUR BARU: PRODUCTION - JOIN VIDEO
    // ==========================================

    apiApp.post('/api/join-video', async (req, res) => {
        try {
            // UPDATE: Menambahkan parameter 'watermark' dari request body
            const { videos, voice, backsound, useBacksound, watermark } = req.body;

            console.log("--- Menerima Request Join Video ---");
            console.log(`Jumlah Video: ${videos ? videos.length : 0}`);
            if (watermark) {
                console.log(`Watermark: Yes (${watermark.position}, ${watermark.opacity}%)`);
            }

            if (!videos || videos.length === 0) {
                return res.status(400).json({ success: false, error: "Tidak ada video yang dikirim." });
            }

            console.log(`Memproses ${videos.length} video dengan FFmpeg...`);

            // Panggil Video Service untuk memproses (update argumen)
            const videoBase64 = await videoService.processJoinVideo(videos, voice, backsound, useBacksound, watermark);

            res.json({
                success: true,
                message: "Video berhasil digabungkan.",
                data: {
                    videoBase64: videoBase64
                }
            });

        } catch (error) {
            console.error('Join Video Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Start Server
    apiServer = apiApp.listen(5000, () => {
        console.log('API Server running on http://localhost:5000');
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets/icons/icon.png'),
        backgroundColor: '#ffffff'
    });

    mainWindow.loadFile('src/renderer/index.html');

    if (process.env.NODE_ENV !== 'production') {
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    startAPIServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (apiServer) {
        apiServer.close();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (apiServer) {
        apiServer.close();
    }
});