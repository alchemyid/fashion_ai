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
    apiApp.use(express.json({ limit: '50mb' }));
    apiApp.use(cors());

    const aiService = require('./src/backend/ai-service');

    // Health check
    apiApp.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // **PERUBAHAN**: Endpoint FITUR 1 (TEKS): Generate by command
    apiApp.post('/api/generate-by-command', async (req, res) => {
        try {
            // **PERUBAHAN**: Ambil kedua toggle
            const { prompt, sampleCount, isProductOnly, isConsistent } = req.body;
            if (!prompt) {
                return res.status(400).json({ success: false, error: 'Prompt is required.' });
            }
            // **PERUBAHAN**: Teruskan kedua toggle ke service
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

    // Endpoint FITUR 1 (REFERENSI): Generate by Reference
    apiApp.post('/api/generate-by-reference', async (req, res) => {
        try {
            const { referenceBase64, prompt, sampleCount } = req.body;
            if (!referenceBase64 || !prompt) {
                return res.status(400).json({ success: false, error: 'referenceBase64 and prompt are required.' });
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


    // Endpoint FITUR 2 (Langkah 1): Segment Product
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

    // Endpoint FITUR 2 (Langkah 2): Generate Model from Product
    apiApp.post('/api/generate-model-from-product', async (req, res) => {
        try {
            const { prompt, cleanProductBase64, sampleCount, mode, modelReferenceBase64 } = req.body;
            if (!cleanProductBase64 || !mode) {
                return res.status(400).json({ success: false, error: 'cleanProductBase64 and mode are required.' });
            }
            // ... (validasi lainnya)
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

    // Endpoint FITUR 3 (Langkah A - Image-to-Text)
    apiApp.post('/api/generate-video-prompt', async (req, res) => {
        try {
            const { productBase64, modelBase64 } = req.body;
            if (!productBase64 || !modelBase64) {
                return res.status(400).json({ success: false, error: 'productBase64 and modelBase64 are required.' });
            }
            const result = await aiService.generateVideoPrompt(productBase64, modelBase64);
            if (result.success) {
                res.json({ success: true, data: { prompt: result.prompt } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Endpoint FITUR 3 (Langkah B - Placeholder)
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

    // Endpoint FITUR 4 (Langkah A - Vision-to-Script)
    apiApp.post('/api/generate-audio-script', async (req, res) => {
        try {
            const { productBase64, modelBase64, platform, duration } = req.body;
            if (!productBase64 || !modelBase64 || !platform || !duration) {
                return res.status(400).json({ success: false, error: 'productBase64, modelBase64, platform, and duration are required.' });
            }
            const result = await aiService.generateAudioScript(productBase64, modelBase64, platform, duration);
            if (result.success) {
                res.json({ success: true, data: { scriptData: result.scriptData } });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Endpoint FITUR 4 (Langkah B - Text-to-Speech)
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

    // Endpoint FITUR 4 (Langkah C - Rekomendasi Musik)
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

    // Endpoint FITUR 4 (Langkah D - Rekomendasi SFX)
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
        mainWindow.webContents.openDevTools({ mode: 'detach' });
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