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

    const imageService = require('./src/backend/services/image.service');
    const tshirtService = require('./src/backend/services/tshirt.service');
    const videoService = require('./src/backend/services/video.service');
    const audioService = require('./src/backend/services/audio.service');
    const captionService = require('./src/backend/services/caption.service');
    const joinVideoService = require('./src/backend/join_video');
    const fs = require('fs');
    const envPath = path.join(__dirname, '.env');

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

    apiApp.get('/api/health', (req, res) => res.json({ status: 'ok' }));
    apiApp.get('/api/dashboard-stats', (req, res) => {
        res.json({ success: true, /* ...stats data */ });
    });

    apiApp.post('/api/generate-base-product', async (req, res) => {
        try {
            const { prompt } = req.body;
            if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });
            
            const imageBase64 = await imageService.generateBaseProduct(prompt);
            trackUsage(true, false);
            res.json({ success: true, data: { imageBase64 } });
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    apiApp.post('/api/generate-scenario-variation', async (req, res) => {
        try {
            const { baseImage, scenarioPrompt } = req.body;
            if (!baseImage || !scenarioPrompt) return res.status(400).json({ success: false, error: 'Base image and scenario prompt are required.' });

            const imageBase64 = await imageService.generateScenarioVariation(baseImage, scenarioPrompt);
            trackUsage(true, false);
            res.json({ success: true, data: { imageBase64 } });
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // UPDATED Endpoint for the Photoshoot feature
    apiApp.post('/api/generate-product-by-command', async (req, res) => {
        try {
            const { masterImage, productDescription, shotType, lightingStyle, sampleCount } = req.body;
            if (!masterImage || !productDescription || !shotType || !lightingStyle) {
                return res.status(400).json({ success: false, error: 'Missing required fields for photoshoot.' });
            }
            
            const result = await imageService.generateProductByCommand({ masterImage, productDescription, shotType, lightingStyle, sampleCount });
            
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
}

app.whenReady().then(() => {
    startAPIServer();
    createWindow(initialPage);
});

app.on('window-all-closed', () => {
    if (apiServer) apiServer.close();
    if (process.platform !== 'darwin') app.quit();
});
