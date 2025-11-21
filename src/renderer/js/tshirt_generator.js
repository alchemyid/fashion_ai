document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTS & DOM ELEMENTS ---
    const PRESET_COLORS = ['#ffffff', '#1a1a1a', '#991b1b', '#1e40af', '#166534', '#d97706', '#5b21b6', '#3f3f46'];
    const DEFAULT_PATH_BASE = "M378.5,64.5c-16.5,19-33.9,26-56.3,26c-14.9,0-33.6-6.8-55.6-21.1C259.7,65.1,250,64,250,64s-16.5,1.1-22.6,5.4 C205.4,83.7,186.7,90.5,171.8,90.5c-22.4,0-39.8-7-56.3-26c-3.5-4-16.8-14.6-28.7-4.1L34.6,110c-14.7,12.9-14.5,36.6-0.5,50.1 l40.5,38.9c6,5.8,15.9,5.2,20.8-1.6l16.5-22.5V418c0,16.6,13.4,30,30,30h228c16.6,0,30-13.4,30-30V174.9l16.5,22.5 c4.9,6.7,14.8,7.4,20.8,1.6l40.5-38.9c14-13.5,14.2-37.2-0.5-50.1l-52.2-49.6C412.3,50.9,383.2,59.1,378.5,64.5z";

    // Canvas & Context
    const canvas = document.getElementById('tshirtCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Controls
    const baseUpload = document.getElementById('baseUpload');
    const colorPalette = document.getElementById('colorPalette');
    const customColorPicker = document.getElementById('customColorPicker');
    const bgColorPicker = document.getElementById('bgColorPicker');

    // Design Controls
    const designUpload = document.getElementById('designUpload');
    const designControls = document.getElementById('designControls');
    const removeDesignBtn = document.getElementById('removeDesignBtn');

    // Label Controls
    const labelUpload = document.getElementById('labelUpload');
    const labelControls = document.getElementById('labelControls');
    const removeLabelBtn = document.getElementById('removeLabelBtn');

    // AI Controls
    const generateAiBtn = document.getElementById('generateAiBtn');
    const aiTheme = document.getElementById('aiTheme');
    const resultGrid = document.getElementById('resultGrid');
    const aiLoading = document.getElementById('aiLoading');
    const resultsArea = document.getElementById('resultsArea');
    const downloadMockupBtn = document.getElementById('downloadMockupBtn');
    const errorMessage = document.getElementById('errorMessage');

    // --- STATE ---
    let state = {
        width: 1024,
        height: 1024,
        baseImage: null,  // Image Object
        shirtColor: '#ffffff',
        bgColor: '#f3f4f6',

        design: {
            image: null, // Image Object
            x: 50, y: 40, // Percent
            scale: 100, // Percent (relative to shirt width)
            rotate: 0 // Degrees
        },

        label: {
            image: null,
            x: 50, y: 15,
            scale: 15,
            rotate: 0
        }
    };

    // --- INITIALIZATION ---
    function init() {
        // Set canvas resolution high, display size via CSS
        canvas.width = state.width;
        canvas.height = state.height;

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

        // Set Default active color
        colorPalette.children[0].classList.add('active');

        // Initial Draw (SVG Fallback)
        draw();
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

    // --- DRAWING LOGIC (CORE) ---
    function draw() {
        // 1. Fill Background
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, state.width, state.height);

        // 2. Draw T-Shirt Base
        if (state.baseImage) {
            drawCustomBase();
        } else {
            drawSvgBase();
        }
    }

    function drawCustomBase() {
        const img = state.baseImage;

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

        // --- COMPOSITING MAGIC FOR REALISTIC COLOR ---
        // Create an offscreen canvas to handle the multiply effect without affecting background
        const offCanvas = document.createElement('canvas');
        offCanvas.width = state.width;
        offCanvas.height = state.height;
        const offCtx = offCanvas.getContext('2d');

        // A. Draw Base Texture
        offCtx.drawImage(img, drawX, drawY, drawW, drawH);

        // B. Colorize: Source-In (Keep alpha of shirt, fill with color)
        offCtx.globalCompositeOperation = 'source-in';
        offCtx.fillStyle = state.shirtColor;
        offCtx.fillRect(0, 0, state.width, state.height);

        // C. Restore Texture: Multiply (Original image over color)
        offCtx.globalCompositeOperation = 'multiply';
        offCtx.drawImage(img, drawX, drawY, drawW, drawH);

        // D. Clean Edges: Destination-In (Cut everything outside original alpha)
        offCtx.globalCompositeOperation = 'destination-in';
        offCtx.drawImage(img, drawX, drawY, drawW, drawH);

        // Draw generated shirt to main canvas
        ctx.drawImage(offCanvas, 0, 0);

        // --- DRAW USER CONTENT (Design & Label) ---
        // Define draw area (usually full canvas for custom base)
        drawUserContent(0, 0, state.width, state.height);

        // --- FINAL SHADOW OVERLAY ---
        // Add a light multiply of the original image on top to simulate folds over the design
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.3; // Adjust for realism intensity
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
    }

    function drawSvgBase() {
        // Fallback for when no image is uploaded
        const scale = state.width / 512;
        const p = new Path2D(DEFAULT_PATH_BASE);

        ctx.save();
        ctx.translate((state.width - 512*scale)/2, (state.height - 512*scale)/2);
        ctx.scale(scale, scale);

        // Color
        ctx.fillStyle = state.shirtColor;
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 20;
        ctx.fill(p);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Draw Content (Clipped to shirt path)
        ctx.save();
        ctx.translate((state.width - 512*scale)/2, (state.height - 512*scale)/2);
        ctx.scale(scale, scale);
        ctx.clip(p);
        // Reset transform for drawing content inside clip
        ctx.setTransform(1,0,0,1,0,0);

        // Calculate SVG bounds in canvas coords for placement
        const svgW = 512 * scale;
        const svgH = 512 * scale;
        const svgX = (state.width - svgW)/2;
        const svgY = (state.height - svgH)/2;

        drawUserContent(svgX, svgY, svgW, svgH);
        ctx.restore();
    }

    function drawUserContent(areaX, areaY, areaW, areaH) {
        // 1. LABEL (Behind design usually, or neck)
        if (state.label.image) {
            drawImageProps(state.label.image, state.label, areaX, areaY, areaW, areaH);
        }

        // 2. DESIGN
        if (state.design.image) {
            drawImageProps(state.design.image, state.design, areaX, areaY, areaW, areaH);
        }
    }

    function drawImageProps(img, props, areaX, areaY, areaW, areaH) {
        ctx.save();
        const centerX = areaX + (props.x / 100) * areaW;
        const centerY = areaY + (props.y / 100) * areaH;

        ctx.translate(centerX, centerY);
        ctx.rotate((props.rotate * Math.PI) / 180);

        // Scale logic: 100% scale = 40% of shirt width
        const baseSize = areaW * 0.4;
        const renderWidth = baseSize * (props.scale / 100);
        const renderHeight = renderWidth * (img.height / img.width);

        ctx.drawImage(img, -renderWidth/2, -renderHeight/2, renderWidth, renderHeight);
        ctx.restore();
    }


    // --- EVENT LISTENERS ---

    // 1. Upload Base
    baseUpload.addEventListener('change', async (e) => {
        if(e.target.files[0]) {
            state.baseImage = await fileToImage(e.target.files[0]);
            document.getElementById('resetBaseBtn').style.display = 'block';
            draw();
        }
    });

    document.getElementById('resetBaseBtn').addEventListener('click', () => {
        state.baseImage = null;
        baseUpload.value = '';
        document.getElementById('resetBaseBtn').style.display = 'none';
        draw();
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

    // 3. Design
    designUpload.addEventListener('change', async (e) => {
        if(e.target.files[0]) {
            state.design.image = await fileToImage(e.target.files[0]);
            designControls.style.display = 'block';
            removeDesignBtn.style.display = 'block';
            draw();
        }
    });

    removeDesignBtn.addEventListener('click', () => {
        state.design.image = null;
        designUpload.value = '';
        designControls.style.display = 'none';
        removeDesignBtn.style.display = 'none';
        draw();
    });

    // Design Sliders
    ['X', 'Y', 'Scale', 'Rotate'].forEach(prop => {
        const input = document.getElementById(`design${prop}`);
        const valDisplay = document.getElementById(`design${prop}Val`);

        input.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.design[prop.toLowerCase()] = val;
            valDisplay.textContent = prop === 'Rotate' ? val + '°' : val + '%';
            draw();
        });
    });

    // 4. Label
    labelUpload.addEventListener('change', async (e) => {
        if(e.target.files[0]) {
            state.label.image = await fileToImage(e.target.files[0]);
            labelControls.style.display = 'block';
            removeLabelBtn.style.display = 'block';
            draw();
        }
    });

    removeLabelBtn.addEventListener('click', () => {
        state.label.image = null;
        labelUpload.value = '';
        labelControls.style.display = 'none';
        removeLabelBtn.style.display = 'none';
        draw();
    });

    // Label Sliders
    ['X', 'Y', 'Scale'].forEach(prop => {
        const input = document.getElementById(`label${prop}`);
        const valDisplay = document.getElementById(`label${prop}Val`);

        input.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.label[prop.toLowerCase()] = val;
            valDisplay.textContent = val + '%';
            draw();
        });
    });

    // Download Mockup
    downloadMockupBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'tshirt-mockup.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    // --- AI GENERATION ---
    generateAiBtn.addEventListener('click', async () => {
        const theme = aiTheme.value;

        // UI Updates
        resultsArea.style.display = 'none';
        resultGrid.innerHTML = '';
        aiLoading.style.display = 'block';
        errorMessage.style.display = 'none';
        generateAiBtn.disabled = true;

        try {
            // Get Canvas as JPEG (smaller payload)
            const base64Image = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];

            // Call Backend
            const response = await window.electron.invoke('/api/generate-tshirt-photos', {
                base64Image,
                theme
            });

            if (response.success && response.data.images) {
                resultsArea.style.display = 'block';

                response.data.images.forEach((b64, idx) => {
                    const div = document.createElement('div');
                    div.className = 'result-item';

                    const img = document.createElement('img');
                    img.src = `data:image/jpeg;base64,${b64}`;

                    const btn = document.createElement('a');
                    btn.className = 'download-btn';
                    btn.href = img.src;
                    btn.download = `tshirt_ai_${idx}.jpg`;
                    btn.innerHTML = '<i class="fas fa-download"></i> Save';

                    div.appendChild(img);
                    div.appendChild(btn);
                    resultGrid.appendChild(div);
                });
            } else {
                throw new Error(response.error || "Unknown AI error");
            }

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