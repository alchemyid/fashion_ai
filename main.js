const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const Store = require('electron-store');
require('dotenv').config();

const store = new Store({
    defaults: {
        stats: {
            totalRequests: 0,
            totalImages: 0,
            totalErrors: 0,
            lastRequestDate: new Date().toDateString(),
            todayRequests: 0,
            currentMonthRequests: 0,
            currentMonthImages: 0,
            lastMonthString: new Date().getMonth()
        }
    }
});

let mainWindow;
let apiServer;
let initialPage = 'src/renderer/index.html';

if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in .env file, loading settings page.');
    initialPage = 'src/renderer/setting.html';
}

function trackUsage(isImage = false, isError = false, count = 1) {
    const stats = store.get('stats');
    const now = new Date();
    const todayString = now.toDateString();
    const currentMonth = now.getMonth();

    if (stats.lastRequestDate !== todayString) {
        stats.todayRequests = 0;
        stats.lastRequestDate = todayString;
    }

    if (stats.lastMonthString !== currentMonth) {
        stats.currentMonthRequests = 0;
        stats.currentMonthImages = 0;
        stats.lastMonthString = currentMonth;
    }

    if (!isError) {
        stats.totalRequests += count;
        stats.todayRequests += count;
        stats.currentMonthRequests += count;
        if (isImage) {
            stats.totalImages += count;
            stats.currentMonthImages = (stats.currentMonthImages || 0) + count;
        }
    } else {
        stats.totalErrors += count;
    }

    store.set('stats', stats);
}

function startAPIServer() {
    const apiApp = express();
    apiApp.use(express.json({ limit: '2048mb' }));
    apiApp.use(express.urlencoded({ limit: '2048mb', extended: true }));
    apiApp.use(cors());

    // --- NEW SERVICE IMPORTS ---
    const imageService = require('./src/backend/services/image.service');
    const tshirtService = require('./src/backend/services/tshirt.service');
    const videoService = require('./src/backend/services/video.service');
    const audioService = require('./src/backend/services/audio.service');
    const captionService = require('./src/backend/services/caption.service');
    const joinVideoService = require('./src/backend/join_video'); // Corrected Path
    const fs = require('fs');
    const envPath = path.join(__dirname, '.env');

    // IPC Handlers for settings
    ipcMain.handle('read-env', async () => fs.readFileSync(envPath, 'utf-8'));
    ipcMain.handle('write-env', async (event, content) => {
        fs.writeFileSync(envPath, content, 'utf-8');
        require('dotenv').config({ override: true });
        return { success: true };
    });
    ipcMain.handle('show-restart-dialog', async () => {
        const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['Restart Sekarang', 'Nanti'],
            title: 'Restart Aplikasi',
            message: 'Konfigurasi telah disimpan.',
            detail: 'Aplikasi perlu di-restart untuk menerapkan perubahan.'
        });
        if (response === 0) {
            app.relaunch();
            app.quit();
        }
        return { response };
    });

    // Health check
    apiApp.get('/api/health', (req, res) => res.json({ status: 'ok' }));

    // Dashboard Stats
    apiApp.get('/api/dashboard-stats', (req, res) => {
        // ... (logic remains the same)
        res.json({ success: true, /* ...stats data */ });
    });

    // --- REFACTORED ENDPOINTS ---

    // Image Generation
    apiApp.post('/api/generate-by-command', async (req, res) => {
        try {
            const { prompt, sampleCount, isProductOnly, isConsistent } = req.body;
            const result = await imageService.generateImage(prompt, sampleCount, isProductOnly, isConsistent);
            if (result.success) {
                trackUsage(true, false, result.imagesBase64.length);
                res.json({ success: true, data: { imagesBase64: result.imagesBase64 } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    apiApp.post('/api/generate-by-reference', async (req, res) => {
        try {
            const { referenceBase64, prompt, sampleCount } = req.body;
            const result = await imageService.generateByReference(referenceBase64, prompt, sampleCount);
            if (result.success) {
                trackUsage(true, false, result.imagesBase64.length);
                res.json({ success: true, data: { imagesBase64: result.imagesBase64 } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // T-Shirt Photos
    apiApp.post('/api/generate-tshirt-photos', async (req, res) => {
        try {
            const { frontImage, backImage, theme } = req.body;
            const result = await tshirtService.generateTshirtPhotos(frontImage, backImage, theme);
            if (result.success) {
                trackUsage(true, false, result.images.length);
                res.json({ success: true, data: { images: result.images } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Video Prompt Generation
    apiApp.post('/api/generate-video-prompt', async (req, res) => {
        try {
            const { productBase64, modelBase64, platform, duration, aiModel } = req.body;
            const result = await videoService.generateVeoPrompt(productBase64, modelBase64, platform, duration, aiModel);
            if (result.success) {
                trackUsage(false, false);
                res.json({ success: true, data: { scriptData: result.scriptData } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Caption & Hashtag
    apiApp.post('/api/generate-caption-hashtags', async (req, res) => {
        try {
            const { platform, productBase64, modelBase64, keywords } = req.body;
            const result = await captionService.generateCaptionAndHashtags(platform, productBase64, modelBase64, keywords);
            if (result.success) {
                trackUsage(false, false);
                res.json({ success: true, data: result.data });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Audio Script
    apiApp.post('/api/generate-audio-script', async (req, res) => {
        try {
            const { productBase64, modelBase64, platform, duration, aiModel } = req.body;
            const result = await audioService.generateAudioScript(productBase64, modelBase64, platform, duration, aiModel);
            if (result.success) {
                trackUsage(false, false);
                res.json({ success: true, data: { scriptData: result.scriptData } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Join Video (Local FFMPEG)
    apiApp.post('/api/join-video', async (req, res) => {
        try {
            const { videos, voice, backsound, useBacksound, watermark } = req.body;
            const videoBase64 = await joinVideoService.processJoinVideo(videos, voice, backsound, useBacksound, watermark);
            res.json({ success: true, data: { videoBase64 } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Start Server
    const PORT = process.env.API_PORT || 8000;
    apiServer = apiApp.listen(PORT, () => {
        console.log(`API Server running on http://localhost:${PORT}`);
    });
}

function createWindow(pageToLoad) {
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

    mainWindow.loadFile(pageToLoad);

    if (process.env.NODE_ENV !== 'production') {
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    startAPIServer();
    createWindow(initialPage);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow(initialPage);
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
