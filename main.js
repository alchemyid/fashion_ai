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
    apiApp.use(express.json());
    apiApp.use(cors());

    const aiService = require('./src/backend/ai-service');

    // Health check
    apiApp.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Generate by command
    apiApp.post('/api/generate-by-command', async (req, res) => {
        try {
            const { prompt } = req.body;
            const result = await aiService.generateImage(prompt);
            res.json({ success: true, data: result });
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

    if (process.env.NODE_ENV === 'development') {
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
