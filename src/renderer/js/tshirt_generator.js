document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTS & DOM ELEMENTS ---
    const PRESET_COLORS = ['#ffffff', '#1a1a1a', '#991b1b', '#1e40af', '#166534', '#d97706', '#5b21b6', '#3f3f46'];
    const DEFAULT_PATH_BASE = "M378.5,64.5c-16.5,19-33.9,26-56.3,26c-14.9,0-33.6-6.8-55.6-21.1C259.7,65.1,250,64,250,64s-16.5,1.1-22.6,5.4 C205.4,83.7,186.7,90.5,171.8,90.5c-22.4,0-39.8-7-56.3-26c-3.5-4-16.8-14.6-28.7-4.1L34.6,110c-14.7,12.9-14.5,36.6-0.5,50.1 l40.5,38.9c6,5.8,15.9,5.2,20.8-1.6l16.5-22.5V418c0,16.6,13.4,30,30,30h228c16.6,0,30-13.4,30-30V174.9l16.5,22.5 c4.9,6.7,14.8,7.4,20.8,1.6l40.5-38.9c14-13.5,14.2-37.2-0.5-50.1l-52.2-49.6C412.3,50.9,383.2,59.1,378.5,64.5z";

    // Canvas & Context
    const canvas = document.getElementById('tshirtCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // View Switcher
    const viewFrontBtn = document.getElementById('viewFrontBtn');
    const viewBackBtn = document.getElementById('viewBackBtn');

    // Controls
    const baseUpload = document.getElementById('baseUpload');
    const baseBackUpload = document.getElementById('baseBackUpload'); // NEW
    const colorPalette = document.getElementById('colorPalette');
    const customColorPicker = document.getElementById('customColorPicker');
    const bgColorPicker = document.getElementById('bgColorPicker');

    // Design Controls (Front)
    const designUpload = document.getElementById('designUpload');
    const designControls = document.getElementById('designControls');
    const removeDesignBtn = document.getElementById('removeDesignBtn');

    // Design Controls (Back) - NEW
    const designBackUpload = document.getElementById('designBackUpload');
    const designBackControls = document.getElementById('designBackControls');
    const removeBackDesignBtn = document.getElementById('removeBackDesignBtn');

    // Label Controls
    const labelUpload = document.getElementById('labelUpload');
    const labelControls = document.getElementById('labelControls');
    const removeLabelBtn = document.getElementById('removeLabelBtn');

    // AI Controls
    const generateAiBtn = document.getElementById('generateAiBtn');
    const aiTheme = document.getElementById('aiTheme');
    const resultGrid = document.getElementById('resultGrid');
    const aiLoading = document.getElementById('aiLoading');
    const loadingText = document.getElementById('loadingText');
    const resultsArea = document.getElementById('resultsArea');
    const downloadMockupBtn = document.getElementById('downloadMockupBtn');
    const errorMessage = document.getElementById('errorMessage');

    // --- STATE ---
    let state = {
        currentView: 'front', // 'front' or 'back'
        width: 1024,
        height: 1024,
        shirtColor: '#ffffff',
        bgColor: '#f3f4f6',

        // Front Assets
        baseImage: null,
        design: { image: null, x: 50, y: 40, scale: 100, rotate: 0 },
        label: { image: null, x: 50, y: 15, scale: 15, rotate: 0 },

        // Back Assets
        baseBackImage: null,
        backDesign: { image: null, x: 50, y: 40, scale: 100, rotate: 0 }
    };

    // --- INITIALIZATION ---
    function init() {
        canvas.width = state.width;
        canvas.height = state.height;

        // Inject Sliders dynamically to avoid HTML duplication
        injectSliders(designControls, 'design');
        injectSliders(labelControls, 'label');
        injectSliders(designBackControls, 'backDesign');

        // Render Color Palette
        PRESET_COLORS.forEach(color => {
            const btn = document.createElement('div');
            btn.className = 'color-btn';
            btn.style.backgroundColor = color;
            btn.onclick = () => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.shirtColor = color;
                customColorPicker.value = color;
                draw();
            };
            colorPalette.appendChild(btn);
        });
        colorPalette.children[0].classList.add('active');

        draw();
    }

    function injectSliders(container, prefix) {
        container.innerHTML = `
            <div class="slider-group">
                <label><span>Position X</span> <span id="${prefix}XVal">50%</span></label>
                <input type="range" class="slider-input" id="${prefix}X" min="0" max="100" value="50">
            </div>
            <div class="slider-group">
                <label><span>Position Y</span> <span id="${prefix}YVal">40%</span></label>
                <input type="range" class="slider-input" id="${prefix}Y" min="0" max="100" value="40">
            </div>
            <div class="slider-group">
                <label><span>Scale</span> <span id="${prefix}ScaleVal">100%</span></label>
                <input type="range" class="slider-input" id="${prefix}Scale" min="10" max="200" value="100">
            </div>
            <div class="slider-group" style="margin-bottom: 0;">
                <label><span>Rotate</span> <span id="${prefix}RotateVal">0°</span></label>
                <input type="range" class="slider-input" id="${prefix}Rotate" min="0" max="360" value="0">
            </div>
        `;

        // Attach listeners immediately
        ['X', 'Y', 'Scale', 'Rotate'].forEach(prop => {
            const input = container.querySelector(`#${prefix}${prop}`);
            const display = container.querySelector(`#${prefix}${prop}Val`);

            input.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                state[prefix][prop.toLowerCase()] = val;
                display.textContent = prop === 'Rotate' ? val + '°' : val + '%';
                draw();
            });
        });
    }

    // --- HELPERS ---
    const fileToImage = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    };

    function switchView(view) {
        state.currentView = view;
        viewFrontBtn.classList.toggle('active', view === 'front');
        viewBackBtn.classList.toggle('active', view === 'back');
        draw();
    }

    // --- DRAWING LOGIC ---
    function draw() {
        // 1. Fill Background
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, state.width, state.height);

        // 2. Determine Assets based on View
        let currentBase = state.currentView === 'front' ? state.baseImage : state.baseBackImage;

        // If no specific back base, try to use front base as fallback (or SVG)
        // But user requirement implies distinct upload. If missing, we fallback to SVG or Front Base?
        // Let's fallback to SVG default if null
        if (currentBase) {
            drawCustomBase(currentBase);
        } else {
            drawSvgBase();
        }
    }

    function drawCustomBase(img) {
        // Calculate Aspect Fit
        const imgAspect = img.width / img.height;
        const canvasAspect = state.width / state.height;
        let drawW, drawH, drawX, drawY;

        if (imgAspect > canvasAspect) {
            drawW = state.width;
            drawH = state.width / imgAspect;
            drawX = 0;
            drawY = (state.height - drawH) / 2;
        } else {
            drawH = state.height;
            drawW = state.height * imgAspect;
            drawX = (state.width - drawW) / 2;
            drawY = 0;
        }

        const offCanvas = document.createElement('canvas');
        offCanvas.width = state.width;
        offCanvas.height = state.height;
        const offCtx = offCanvas.getContext('2d');

        // A. Draw Base
        offCtx.drawImage(img, drawX, drawY, drawW, drawH);

        // B. Colorize (Source-In)
        offCtx.globalCompositeOperation = 'source-in';
        offCtx.fillStyle = state.shirtColor;
        offCtx.fillRect(0, 0, state.width, state.height);

        // C. Multiply Texture
        offCtx.globalCompositeOperation = 'multiply';
        offCtx.drawImage(img, drawX, drawY, drawW, drawH);

        // D. Destination-In (Cut to shape)
        offCtx.globalCompositeOperation = 'destination-in';
        offCtx.drawImage(img, drawX, drawY, drawW, drawH);

        // Draw to Main Canvas
        ctx.drawImage(offCanvas, 0, 0);

        // Draw Content Area (Approx full canvas for custom image)
        drawUserContent(0, 0, state.width, state.height);

        // Shadow Overlay
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.3;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
    }

    function drawSvgBase() {
        const scale = state.width / 512;
        const path = new Path2D("M378.5,64.5c-16.5,19-33.9,26-56.3,26c-14.9,0-33.6-6.8-55.6-21.1C259.7,65.1,250,64,250,64s-16.5,1.1-22.6,5.4 C205.4,83.7,186.7,90.5,171.8,90.5c-22.4,0-39.8-7-56.3-26c-3.5-4-16.8-14.6-28.7-4.1L34.6,110c-14.7,12.9-14.5,36.6-0.5,50.1 l40.5,38.9c6,5.8,15.9,5.2,20.8-1.6l16.5-22.5V418c0,16.6,13.4,30,30,30h228c16.6,0,30-13.4,30-30V174.9l16.5,22.5 c4.9,6.7,14.8,7.4,20.8,1.6l40.5-38.9c14-13.5,14.2-37.2-0.5-50.1l-52.2-49.6C412.3,50.9,383.2,59.1,378.5,64.5z");

        ctx.save();
        ctx.translate((state.width - 512*scale)/2, (state.height - 512*scale)/2);
        ctx.scale(scale, scale);

        ctx.fillStyle = state.shirtColor;
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 20;
        ctx.fill(path);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Clip & Draw Content
        ctx.save();
        ctx.translate((state.width - 512*scale)/2, (state.height - 512*scale)/2);
        ctx.scale(scale, scale);
        ctx.clip(path);
        ctx.setTransform(1,0,0,1,0,0);

        const svgW = 512 * scale;
        const svgH = 512 * scale;
        const svgX = (state.width - svgW)/2;
        const svgY = (state.height - svgH)/2;

        drawUserContent(svgX, svgY, svgW, svgH);
        ctx.restore();
    }

    function drawUserContent(areaX, areaY, areaW, areaH) {
        if (state.currentView === 'front') {
            // FRONT: Label & Design
            if (state.label.image) {
                drawImageProps(state.label.image, state.label, areaX, areaY, areaW, areaH);
            }
            if (state.design.image) {
                drawImageProps(state.design.image, state.design, areaX, areaY, areaW, areaH);
            }
        } else {
            // BACK: Design Only (No Label)
            if (state.backDesign.image) {
                drawImageProps(state.backDesign.image, state.backDesign, areaX, areaY, areaW, areaH);
            }
        }
    }

    function drawImageProps(img, props, areaX, areaY, areaW, areaH) {
        ctx.save();
        const centerX = areaX + (props.x / 100) * areaW;
        const centerY = areaY + (props.y / 100) * areaH;

        ctx.translate(centerX, centerY);
        ctx.rotate((props.rotate * Math.PI) / 180);

        const baseSize = areaW * 0.4;
        const renderWidth = baseSize * (props.scale / 100);
        const renderHeight = renderWidth * (img.height / img.width);

        ctx.drawImage(img, -renderWidth/2, -renderHeight/2, renderWidth, renderHeight);
        ctx.restore();
    }


    // --- EVENT LISTENERS ---

    // View Switchers
    viewFrontBtn.addEventListener('click', () => switchView('front'));
    viewBackBtn.addEventListener('click', () => switchView('back'));

    // 1. Base Uploads
    baseUpload.addEventListener('change', async (e) => {
        if(e.target.files[0]) {
            state.baseImage = await fileToImage(e.target.files[0]);
            if(state.currentView === 'front') draw();
        }
    });
    baseBackUpload.addEventListener('change', async (e) => {
        if(e.target.files[0]) {
            state.baseBackImage = await fileToImage(e.target.files[0]);
            // Auto switch to back view to show user
            switchView('back');
        }
    });

    // 2. Colors
    customColorPicker.addEventListener('input', (e) => {
        state.shirtColor = e.target.value;
        draw();
    });
    bgColorPicker.addEventListener('input', (e) => {
        state.bgColor = e.target.value;
        draw();
    });

    // 3. Front Design
    designUpload.addEventListener('change', async (e) => {
        if(e.target.files[0]) {
            state.design.image = await fileToImage(e.target.files[0]);
            designControls.style.display = 'block';
            removeDesignBtn.style.display = 'block';
            switchView('front');
        }
    });
    removeDesignBtn.addEventListener('click', () => {
        state.design.image = null;
        designUpload.value = '';
        designControls.style.display = 'none';
        removeDesignBtn.style.display = 'none';
        draw();
    });

    // 4. Back Design
    designBackUpload.addEventListener('change', async (e) => {
        if(e.target.files[0]) {
            state.backDesign.image = await fileToImage(e.target.files[0]);
            designBackControls.style.display = 'block';
            removeBackDesignBtn.style.display = 'block';
            switchView('back');
        }
    });
    removeBackDesignBtn.addEventListener('click', () => {
        state.backDesign.image = null;
        designBackUpload.value = '';
        designBackControls.style.display = 'none';
        removeBackDesignBtn.style.display = 'none';
        draw();
    });

    // 5. Label (Front Only)
    labelUpload.addEventListener('change', async (e) => {
        if(e.target.files[0]) {
            state.label.image = await fileToImage(e.target.files[0]);
            labelControls.style.display = 'block';
            removeLabelBtn.style.display = 'block';
            switchView('front');
        }
    });
    removeLabelBtn.addEventListener('click', () => {
        state.label.image = null;
        labelUpload.value = '';
        labelControls.style.display = 'none';
        removeLabelBtn.style.display = 'none';
        draw();
    });

    // Download Mockup (Current View)
    downloadMockupBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `tshirt-mockup-${state.currentView}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    // --- AI GENERATION (12 PHOTOS LOGIC) ---
    generateAiBtn.addEventListener('click', async () => {
        const theme = aiTheme.value;

        // UI Updates
        resultsArea.style.display = 'none';
        resultGrid.innerHTML = '';
        aiLoading.style.display = 'block';
        errorMessage.style.display = 'none';
        generateAiBtn.disabled = true;

        // Helper to capture view
        const captureView = async (viewName) => {
            switchView(viewName);
            // Allow a micro-tick for canvas to repaint
            await new Promise(r => setTimeout(r, 50));
            return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
        };

        try {
            // 1. Capture Front
            loadingText.textContent = "Capturing Front Design...";
            const frontB64 = await captureView('front');

            // 2. Capture Back (if exists)
            let backB64 = null;
            // We consider back design exists if there is a back design image UPLOADED or a Specific Back Base
            // User said: "jika user tidak mengupload untuk bagian belakang, kaos hasil generate photo hasil nya sudah benar seperti sekarang"
            // So trigger only if back design is present.
            if (state.backDesign.image || (state.baseBackImage && state.baseBackImage !== state.baseImage)) {
                loadingText.textContent = "Capturing Back Design...";
                backB64 = await captureView('back');
            }

            // Restore view to front for user experience
            switchView('front');

            let finalImages = [];

            // 3. Request AI - Front
            loadingText.textContent = "Generating Front Photos (1/2)...";
            const frontRes = await window.electron.invoke('/api/generate-tshirt-photos', {
                base64Image: frontB64,
                theme
            });
            if (frontRes.success) {
                // Tag them as front
                finalImages = finalImages.concat(frontRes.data.images.map(img => ({ data: img, type: 'Front View' })));
            } else {
                throw new Error("Front generation failed: " + frontRes.error);
            }

            // 4. Request AI - Back (if applicable)
            if (backB64) {
                loadingText.textContent = "Generating Back Photos (2/2)...";
                const backRes = await window.electron.invoke('/api/generate-tshirt-photos', {
                    base64Image: backB64,
                    theme
                });
                if (backRes.success) {
                    finalImages = finalImages.concat(backRes.data.images.map(img => ({ data: img, type: 'Back View' })));
                }
            }

            // 5. Render Results
            resultsArea.style.display = 'block';

            finalImages.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'result-item';

                // Badge for View Type
                const badge = document.createElement('div');
                badge.className = 'result-badge';
                badge.textContent = item.type;

                const img = document.createElement('img');
                img.src = `data:image/jpeg;base64,${item.data}`;

                const btn = document.createElement('a');
                btn.className = 'download-btn';
                btn.href = img.src;
                btn.download = `tshirt_ai_${idx}.jpg`;
                btn.innerHTML = '<i class="fas fa-download"></i> Save';

                div.appendChild(badge);
                div.appendChild(img);
                div.appendChild(btn);
                resultGrid.appendChild(div);
            });

        } catch (error) {
            errorMessage.textContent = "Generation Failed: " + error.message;
            errorMessage.style.display = 'block';
        } finally {
            aiLoading.style.display = 'none';
            generateAiBtn.disabled = false;
        }
    });

    // Start
    init();
});