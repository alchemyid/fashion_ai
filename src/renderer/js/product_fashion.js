document.addEventListener('DOMContentLoaded', () => {
    loadNavbar('product_fashion');

    const STYLE_PRESETS = [
        // --- Basic & Standard ---
        "Photorealistic, 8k, studio lighting",
        "Cinematic, dramatic shadows, moody",
        "Minimalist, clean white background, soft shadows",

        // --- Commercial & Product ---
        "Luxury Product, macro photography, intricate details, golden lighting",
        "Commercial Advertisement, vibrant colors, sharp focus, high key",
        "Tech Noir, sleek, futuristic, blue and orange grading",
        "Food Photography, appetizing, soft bokeh, natural lighting",

        // --- Portrait & Fashion ---
        "Editorial Fashion, magazine style, softbox lighting, trendy",
        "Professional Headshot, neutral background, 85mm lens, bokeh",
        "Street Photography, candid, urban texture, natural light",
        "Double Exposure, silhouette, nature overlay, artistic",

        // --- Artistic & Atmospheric ---
        "Cyberpunk, neon lighting, high contrast, wet streets",
        "Vintage, film grain, warm tones, Kodak Portra 400 style",
        "Ethereal, dreamy, soft focus, pastel colors, fantasy",
        "Noir, black and white, high contrast, harsh shadows, mystery",
        "Surrealism, dreamlike, distorted reality, vivid imagination",

        // --- Digital & Render Styles ---
        "3D Render, Octane render, isometric, smooth textures",
        "Low Poly, geometric shapes, abstract, minimalist",
        "Oil Painting, textured brushstrokes, classic art style",

        // --- MARKETPLACE UTAMA (Wajib untuk Katalog) ---
        "E-Commerce Clean: Pure white background, studio lighting, hyper-realistic, 4k",
        "Minimalist Catalog: Light grey background, soft shadow, high fidelity",

        // --- SOCIAL MEDIA & LIFESTYLE (Untuk Iklan/Instagram) ---
        "Lifestyle Context: Product in use, cozy home environment, shallow depth of field",
        "Luxury Editorial: Marble texture background, elegant props, golden accent lighting",
        "Nature/Organic: Wooden table surface, natural sunlight, leaves shadow, fresh vibe",
        "Urban/Streetwear: Concrete texture, outdoor city daylight, trendy look",
        "Tech/Modern: Sleek dark background, blue rim light, futuristic surface",

        // --- KHUSUS MAKANAN (Jika ada) ---
        "Gourmet Food: Fresh ingredients background, appetizing, warm lighting, steam effect"
    ];
    const DEFAULT_ANGLES = [
        "Front View - Eye Level, perfectly centered, symmetrical balance",
        "Side Profile, sharp silhouette, neutral background",
        "3/4 Angle, depth perception, standard portrait composition",
        "Over-the-Shoulder, narrative perspective, depth of field",
        // --- Product & Layout ---
        "Top-Down Flat Lay, knolling style, organized composition",
        "Isometric View, 3D architectural style, orthographic projection",
        "Product Reveal Angle, slightly elevated, showcasing depth",
        // --- Dramatic & Cinematic ---
        "Low Angle Hero Shot, looking up, imposing, dominant presence",
        "High Angle, looking down, vulnerability, wide overview",
        "Dutch Angle, tilted camera, dynamic motion, tension",
        "Worm's Eye View, ground level, extreme perspective, blurred foreground",
        // --- Scale & Immersion ---
        "Close-up Macro, extreme detail, iris focus, bokeh",
        "Wide Angle, panoramic, environmental context, 16mm lens",
        "First-Person POV, immersive, handheld camera feel, seeing through eyes",
        "Aerial Drone View, bird's eye, high altitude, epic scale",

        "Front View (Hero Shot): Eye-level, showing the main face of the product clearly",
        "Isometric (3D View): Showing top, front, and side simultaneously for dimension",
        "45-Degree Down: The standard 'on the table' looking down perspective",
        "Top-Down Flat Lay: Organized arrangement (knolling), great for Instagram",
        "Close-up Macro: Focusing on fabric texture/material quality/logo details",
        "Low Angle: Making the product look premium and towering (good for bottles/sneakers)"
    ];
    const artisticStyleSelect = document.getElementById('artisticStyle');
    const angleSelect = document.getElementById('angleSelect');
    const lightingStyleSelect = document.getElementById('lightingStyle');
    const generateMasterBtn = document.getElementById('generateMasterBtn');
    const uploadMasterInput = document.getElementById('uploadMasterInput');
    const masterAssetPreview = document.getElementById('masterAssetPreview');
    const masterAssetLoader = document.getElementById('masterAssetLoader');
    const masterAssetPlaceholder = document.getElementById('masterAssetPlaceholder');
    const addToQueueBtn = document.getElementById('addToQueueBtn');
    const runPhotoshootBtn = document.getElementById('runPhotoshootBtn');
    const resultsGrid = document.getElementById('resultsGrid');
    const galleryPlaceholder = document.getElementById('galleryPlaceholder');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const errorMessage = document.getElementById('errorMessage');

    let product = { name: '', description: '', style: STYLE_PRESETS[0], baseImage: null };
    let scenarios = [];

    function init() {
        STYLE_PRESETS.forEach(style => artisticStyleSelect.add(new Option(style, style)));
        // DEFAULT_ANGLES.forEach(angle => angleSelect.add(new Option(angle.split('-')[0].trim(), angle)));
        DEFAULT_ANGLES.forEach(angle => angleSelect.add(new Option(angle, angle)));
        document.getElementById('productName').addEventListener('input', e => product.name = e.target.value);
        document.getElementById('productDesc').addEventListener('input', e => product.description = e.target.value);
        artisticStyleSelect.addEventListener('change', e => product.style = e.target.value);

        generateMasterBtn.addEventListener('click', handleGenerateBase);
        uploadMasterInput.addEventListener('change', handleImageUpload);
        addToQueueBtn.addEventListener('click', addScenario);
        runPhotoshootBtn.addEventListener('click', handleGenerateVariations);
    }

    const handleGenerateBase = async () => {
        product.description = document.getElementById('productDesc').value;
        if (!product.description) {
            showError("Please provide a visual description first.");
            return;
        }

        masterAssetLoader.classList.remove('d-none');
        masterAssetPlaceholder.classList.add('d-none');
        generateMasterBtn.disabled = true;

        try {
            const fullPrompt = `${product.name ? `Product: ${product.name}. ` : ''}${product.description}. Style: ${product.style}`;
            const result = await window.electron.invoke('/api/generate-base-product', { prompt: fullPrompt });

            if (result.success) {
                product.baseImage = result.data.imageBase64;
                updateMasterAsset();
            } else {
                throw new Error(result.error || "Failed to generate base image.");
            }
        } catch (error) {
            showError(error.message);
        } finally {
            masterAssetLoader.classList.add('d-none');
            generateMasterBtn.disabled = false;
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                product.baseImage = (reader.result).replace(/^data:image\/[a-z]+;base64,/, "");
                updateMasterAsset();
            };
            reader.readAsDataURL(file);
        }
    };

    const addScenario = () => {
        if (!product.baseImage) {
            showError("Please generate or upload a Master Asset first.");
            return;
        }
        const count = parseInt(document.getElementById('sampleCount').value, 10);
        const newScenario = {
            id: `scenario-${Date.now()}`,
            shotType: angleSelect.value,
            lightingStyle: lightingStyleSelect.value,
            count: count,
            status: 'idle',
            results: []
        };
        scenarios.push(newScenario);
        renderQueue();
    };

    const handleGenerateVariations = async () => {
        const scenariosToRun = scenarios.filter(s => s.status === 'idle');
        if (!product.baseImage || scenariosToRun.length === 0) {
            showError("Please add at least one new angle to the queue.");
            return;
        }

        runPhotoshootBtn.disabled = true;

        for (const scenario of scenariosToRun) {
            updateScenarioStatus(scenario.id, 'loading');
            try {
                const result = await window.electron.invoke('/api/generate-product-fashion', {
                    masterImage: product.baseImage,
                    productDescription: product.description,
                    shotType: scenario.shotType,
                    lightingStyle: scenario.lightingStyle,
                    sampleCount: scenario.count
                });

                if (result.success) {
                    scenario.results = result.data.imagesBase64;
                    updateScenarioStatus(scenario.id, 'success', scenario.results);
                } else {
                    throw new Error(result.error || 'Image generation failed.');
                }
            } catch (error) {
                console.error(`Failed scenario: ${scenario.shotType}`, error);
                updateScenarioStatus(scenario.id, 'error');
            }
        }
        runPhotoshootBtn.disabled = false;
    };

    function updateMasterAsset() {
        if (product.baseImage) {
            masterAssetPreview.src = `data:image/png;base64,${product.baseImage}`;
            masterAssetPreview.classList.remove('d-none');
            masterAssetPlaceholder.classList.add('d-none');
        } else {
            masterAssetPreview.classList.add('d-none');
            masterAssetPlaceholder.classList.remove('d-none');
        }
    }

    // function renderQueue() {
    //     if (scenarios.length > 0) galleryPlaceholder.style.display = 'none';
    //     resultsGrid.innerHTML = '';
    //     scenarios.forEach(s => {
    //         const cardWrapper = document.createElement('div');
    //         cardWrapper.className = 'col-xl-3 col-lg-4 col-md-6 col-sm-12 mb-4';
    //         cardWrapper.id = s.id;
    //
    //         cardWrapper.innerHTML = `
    //             <div class="card h-100">
    //                 <div class="card-header d-flex justify-content-between align-items-center">
    //                     <span>${s.shotType.split('-')[0].trim()} x${s.count}</span>
    //                     <span id="badge-${s.id}" class="badge"></span>
    //                 </div>
    //                 <div class="card-body">
    //                     <div id="grid-${s.id}" class="row g-2"></div>
    //                 </div>
    //             </div>
    //         `;
    //         resultsGrid.appendChild(cardWrapper);
    //         updateScenarioStatus(s.id, s.status, s.results);
    //     });
    // }
    function renderQueue() {
        if (scenarios.length > 0) galleryPlaceholder.style.display = 'none';
        resultsGrid.innerHTML = '';
        scenarios.forEach(s => {
            const cardWrapper = document.createElement('div');
            cardWrapper.className = 'col-xl-3 col-lg-4 col-md-6 col-sm-12 mb-4';
            cardWrapper.id = s.id;

            cardWrapper.innerHTML = `
            <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span class="text-truncate me-2" style="flex: 1;" title="${s.shotType}">${s.shotType} x${s.count}</span>
                    <span id="badge-${s.id}" class="badge flex-shrink-0"></span>
                </div>
                <div class="card-body">
                    <div id="grid-${s.id}" class="row g-2"></div>
                </div>
            </div>
        `;
            resultsGrid.appendChild(cardWrapper);
            updateScenarioStatus(s.id, s.status, s.results);
        });
    }
    function updateScenarioStatus(id, status, images = []) {
        const card = document.getElementById(id);
        if (!card) return;
        const badge = card.querySelector(`#badge-${id}`);
        const grid = card.querySelector(`#grid-${id}`);

        badge.textContent = status.toUpperCase();
        badge.className = `badge bg-${status === 'success' ? 'success' : status === 'loading' ? 'warning' : 'danger'}`;
        
        grid.innerHTML = ''; // Clear previous content

        if (status === 'loading') {
            grid.innerHTML = `<div class="col-12 d-flex justify-content-center align-items-center" style="min-height: 150px;"><div class="spinner-border text-primary" role="status"></div></div>`;
        } else if (status === 'success') {
            images.forEach((imgData, i) => {
                const imgCol = document.createElement('div');
                imgCol.className = 'col-6'; 
                imgCol.innerHTML = `
                    <div class="ratio ratio-1x1 image-container">
                        <img src="data:image/png;base64,${imgData}" alt="Generated variation ${i+1}">
                        <div class="download-overlay">
                            <a href="data:image/png;base64,${imgData}" download="product_${id}_${i}.png" title="Download Image">
                                <i class="fas fa-download"></i>
                            </a>
                        </div>
                    </div>
                `;
                grid.appendChild(imgCol);
            });
        } else if (status === 'error') {
            grid.innerHTML = `<div class="col-12 text-center text-danger p-4">Generation Failed</div>`;
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        setTimeout(() => errorMessage.style.display = 'none', 5000);
    }

    init();
});
