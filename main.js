const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const Store = require('electron-store'); // Import Store
require('dotenv').config();

// Initialize Store for Persistent Data
const store = new Store({
    defaults: {
        stats: {
            totalRequests: 0,
            totalImages: 0,
            totalErrors: 0,
            lastRequestDate: new Date().toDateString(),
            todayRequests: 0,
            currentMonthRequests: 0, // Total semua request bulan ini
            currentMonthImages: 0,   // Total KHUSUS gambar bulan ini (untuk billing akurat)
            lastMonthString: new Date().getMonth() // Track month changes
        }
    }
});

let mainWindow;
let apiServer;

let initialPage = 'src/renderer/index.html';

// Validate environment variables
if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in .env file, loading settings page.');
    initialPage = 'src/renderer/setting.html';
}

// Helper to track usage
function trackUsage(isImage = false, isError = false) {
    const stats = store.get('stats');
    const now = new Date();
    const todayString = now.toDateString();
    const currentMonth = now.getMonth();

    // Reset daily counter if date changed
    if (stats.lastRequestDate !== todayString) {
        stats.todayRequests = 0;
        stats.lastRequestDate = todayString;
    }

    // Reset monthly counter if month changed
    if (stats.lastMonthString !== currentMonth) {
        stats.currentMonthRequests = 0;
        stats.currentMonthImages = 0; // Reset image counter
        stats.lastMonthString = currentMonth;
    }

    if (!isError) {
        stats.totalRequests += 1;
        stats.todayRequests += 1;
        stats.currentMonthRequests += 1; 
        
        if (isImage) {
            stats.totalImages += 1;
            // Pastikan properti ini ada (untuk migrasi data lama)
            stats.currentMonthImages = (stats.currentMonthImages || 0) + 1;
        }
    } else {
        stats.totalErrors += 1;
    }

    store.set('stats', stats);
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
    const fs = require('fs');
    const envPath = path.join(__dirname, '.env');

    // Handler untuk membaca dan menulis file .env
    ipcMain.handle('read-env', async () => {
        try {
            return fs.readFileSync(envPath, 'utf-8');
        } catch (err) {
            return '';
        }
    });

    ipcMain.handle('write-env', async (event, content) => {
        try {
            fs.writeFileSync(envPath, content, 'utf-8');
            // Reload dotenv untuk menerapkan perubahan tanpa restart full process
            require('dotenv').config({ override: true }); 
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('show-restart-dialog', async () => {
        const dialogOpts = {
            type: 'info',
            buttons: ['Restart Sekarang', 'Nanti'],
            title: 'Restart Aplikasi',
            message: 'Konfigurasi telah disimpan.',
            detail: 'Aplikasi perlu di-restart untuk menerapkan perubahan. Apakah Anda ingin me-restart sekarang?'
        };
        const { response } = await dialog.showMessageBox(mainWindow, dialogOpts);

        if (response === 0) { // Corresponds to 'Restart Sekarang'
            app.relaunch();
            app.quit();
        }

        return { response };
    });

    // Health check
    apiApp.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ==========================================
    // DASHBOARD STATS ENDPOINT (UPDATED LOGIC)
    // ==========================================
    apiApp.get('/api/dashboard-stats', (req, res) => {
        const stats = store.get('stats');
        
        // Ambil Config dari .env
        const planLabel = process.env.GEMINI_PLAN_LABEL || 'AI Studio Free';
        const budgetUsd = parseFloat(process.env.GEMINI_BUDGET_USD || 0);
        
        // Harga Spesifik
        const costPerImage = parseFloat(process.env.GEMINI_COST_PER_IMAGE || 0.040);
        const costPerTextReq = parseFloat(process.env.GEMINI_COST_PER_TEXT_REQ || 0.0004);
        
        // Hitung Estimasi Biaya (Split Calculation)
        const monthlyImages = stats.currentMonthImages || 0;
        // Text Request = Total Request Bulan Ini - Request Gambar
        const monthlyTextRequests = Math.max(0, (stats.currentMonthRequests || 0) - monthlyImages);
        
        const imageCost = monthlyImages * costPerImage;
        const textCost = monthlyTextRequests * costPerTextReq;
        const currentSpend = imageCost + textCost;
        
        // Konfigurasi Rate Limit
        const isPro = planLabel.toLowerCase().includes('pro') || planLabel.toLowerCase().includes('paid');
        const rateLimitInfo = {
            rpm: isPro ? 1000 : 15, 
            dailyLimit: isPro ? 10000 : 1500, 
            usedToday: stats.todayRequests,
            planName: planLabel
        };

        // Billing Info Object
        const billingInfo = {
            budget: budgetUsd,
            currentSpend: currentSpend.toFixed(3),
            costDetails: {
                images: monthlyImages,
                imageCost: imageCost.toFixed(3),
                texts: monthlyTextRequests,
                textCost: textCost.toFixed(3)
            },
            currency: 'USD'
        };

        res.json({
            success: true,
            stats: stats,
            rateLimit: rateLimitInfo,
            billing: billingInfo,
            apiKeyConfigured: !!process.env.GEMINI_API_KEY
        });
    });

    // ==========================================
    // FITUR 1: IMAGE GENERATION (Text & Ref)
    // ==========================================

    // Generate by command
    apiApp.post('/api/generate-by-command', async (req, res) => {
        try {
            const { prompt, sampleCount, isProductOnly, isConsistent } = req.body;
            if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });
            
            const result = await aiService.generateImage(prompt, sampleCount, isProductOnly, isConsistent);
            
            if (result.success) {
                trackUsage(true, false); // Track Success as Image
                res.json({ success: true, data: { imagesBase64: result.imagesBase64 } });
            } else {
                trackUsage(false, true); // Track Error
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Generate by Reference
    apiApp.post('/api/generate-by-reference', async (req, res) => {
        try {
            const { referenceBase64, prompt, sampleCount } = req.body;
            if (!referenceBase64 || !prompt) return res.status(400).json({ success: false, error: 'Required fields missing.' });
            
            const result = await aiService.generateByReference(referenceBase64, prompt, sampleCount);
            
            if (result.success) {
                trackUsage(true, false); // Track Success as Image
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

    // ==========================================
    // FITUR 2: PRODUCT SWAP & MODEL
    // ==========================================

    // Langkah 1: Segment Product
    apiApp.post('/api/segment-product', async (req, res) => {
        try {
            const { productBase64, segmentPrompt } = req.body;
            if (!productBase64 || !segmentPrompt) return res.status(400).json({ success: false, error: 'Required fields missing.' });
            
            const result = await aiService.segmentProduct(productBase64, segmentPrompt);
            
            if (result.success) {
                trackUsage(true, false); // Segmentasi = Image Editing (Image)
                res.json({ success: true, data: { imageBase64: result.imageBase64 } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Langkah 2: Generate Model from Product
    apiApp.post('/api/generate-model-from-product', async (req, res) => {
        try {
            const { prompt, cleanProductBase64, sampleCount, mode, modelReferenceBase64 } = req.body;
            if (!cleanProductBase64 || !mode) return res.status(400).json({ success: false, error: 'Required fields missing.' });
            
            const result = await aiService.generateModelFromProduct(
                cleanProductBase64, sampleCount, mode, prompt, modelReferenceBase64
            );
            
            if (result.success) {
                trackUsage(true, false); // Image Generation
                res.json({ success: true, data: { imagesBase64: result.imagesBase64, angleTitles: result.angleTitles } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==========================================
    // FITUR 3: IMAGE TO VIDEO (VEO)
    // ==========================================

    // Langkah A: Generate Video Prompt
    apiApp.post('/api/generate-video-prompt', async (req, res) => {
        try {
            const { productBase64, modelBase64, platform, duration, aiModel } = req.body;
            if (!productBase64 || !modelBase64 || !platform || !duration) return res.status(400).json({ success: false, error: 'Required fields missing.' });
            
            const result = await aiService.generateVeoPrompt(productBase64, modelBase64, platform, duration, aiModel);
            
            if (result.success) {
                trackUsage(false, false); // Text/Multimodal Request
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

    // Langkah B: Generate Video (Placeholder)
    apiApp.post('/api/generate-video-from-image', async (req, res) => {
        try {
            const { prompt } = req.body;
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
            if (!productBase64 || !modelBase64 || !platform || !duration) return res.status(400).json({ success: false, error: 'Required fields missing.' });

            const result = await aiService.generateAudioScript(productBase64, modelBase64, platform, duration, aiModel);

            if (result.success) {
                trackUsage(false, false); // Text/Multimodal
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

    // Langkah B: Generate Voiceover
    apiApp.post('/api/generate-voiceover', async (req, res) => {
        try {
            const { script, voiceName } = req.body;
            if (!script || !voiceName) return res.status(400).json({ success: false, error: 'Required fields missing.' });
            
            const result = await aiService.generateVoiceover(script, voiceName);
            
            if (result.success) {
                trackUsage(false, false); // TTS (dihitung setara text req murah di estimasi ini, atau bisa dibuat kategori sendiri jika ingin sangat detail)
                res.json({ success: true, data: { audioBase64: result.audioBase64, sampleRate: result.sampleRate } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Langkah C: Rekomendasi Musik
    apiApp.post('/api/recommend-music', async (req, res) => {
        try {
            const { mood, script } = req.body;
            const result = await aiService.recommendMusic(mood, script);
            if (result.success) {
                trackUsage(false, false);
                res.json({ success: true, data: { recommendation: result.recommendation } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Langkah D: Rekomendasi SFX
    apiApp.post('/api/recommend-sfx', async (req, res) => {
        try {
            const { script } = req.body;
            const result = await aiService.recommendSfx(script);
            if (result.success) {
                trackUsage(false, false);
                res.json({ success: true, data: { recommendation: result.recommendation } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==========================================
    // FITUR 5: CAPTION & HASHTAG
    // ==========================================

    apiApp.post('/api/generate-caption-hashtags', async (req, res) => {
        try {
            const { platform, productBase64, modelBase64, keywords } = req.body;
            const result = await aiService.generateCaptionAndHashtags(platform, productBase64, modelBase64, keywords);

            if (result.success) {
                trackUsage(false, false); // Multimodal/Text
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

    // Remove Background
    apiApp.post('/api/remove-background', async (req, res) => {
        try {
            const { imageBase64, prompt } = req.body;
            const cleanPrompt = prompt || "logo";
            const result = await aiService.removeBackground(imageBase64, cleanPrompt);

            if (result.success) {
                trackUsage(true, false); // Image Editing -> Image Cost
                res.json({ success: true, data: { imageBase64: result.imageBase64 } });
            } else {
                trackUsage(false, true);
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            trackUsage(false, true);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Join Video (Local FFmpeg)
    apiApp.post('/api/join-video', async (req, res) => {
        try {
            const { videos, voice, backsound, useBacksound, watermark } = req.body;
            const videoBase64 = await videoService.processJoinVideo(videos, voice, backsound, useBacksound, watermark);
            res.json({ success: true, message: "Video berhasil digabungkan.", data: { videoBase64: videoBase64 } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Tshirt Creator
    apiApp.post('/api/generate-tshirt-photos', async (req, res) => {
        try {
            const { base64Image, theme } = req.body;
            const result = await aiService.generateTshirtPhotos(base64Image, theme);

            if (result.success) {
                const count = result.images.length;
                
                const stats = store.get('stats');
                stats.totalRequests += count;
                stats.todayRequests += count;
                stats.currentMonthRequests += count;
                
                // Track as images
                stats.totalImages += count;
                stats.currentMonthImages = (stats.currentMonthImages || 0) + count;
                
                store.set('stats', stats);

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