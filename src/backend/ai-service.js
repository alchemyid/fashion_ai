// Gunakan require untuk node-fetch v2 (CommonJS)
const fetch = require('node-fetch');
require('dotenv').config();

// Pastikan environment variable GEMINI_API_KEY sudah diatur dengan benar
const API_KEY = process.env.GEMINI_API_KEY;

// URL untuk FITUR 1 (Generate Image)
const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;
// URL untuk FITUR 2 & 3 (Image Editing / Vision)
const GEMINI_IMAGE_EDIT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${API_KEY}`;
// URL untuk FITUR 3 & 4 (Analisis Teks/Vision)
const GEMINI_TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;
// URL untuk FITUR 4 (Text-to-Speech)
const GEMINI_TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`;


// Daftar Angle (Shot Types)
const SHOT_TYPES = [
    { name: "Full Body Shot", desc: "Foto seluruh badan, menampilkan produk dari kepala hingga kaki." },
    { name: "Close-Up Shot", desc: "Fokus ekstrem ke detail produk (jahitan, tekstur, dll)." },
    { name: "Walking / Motion Shot", desc: "Model dalam pose berjalan, memberi kesan dinamis." },
    { name: "High Angle Shot", desc: "Foto dari sudut tinggi, melihat ke bawah ke model." },
    { name: "Side Profile Shot", desc: "Foto dari samping, menonjolkan siluet produk." },
    { name: "Seated Shot", desc: "Model dalam pose duduk, menampilkan produk saat dipakai santai." }
];


/**
 * Fungsi helper untuk retry dengan exponential backoff
 * UPDATE PRODUCTION: Menambahkan handling khusus untuk 429 (Rate Limit) dan 503 (Service Unavailable)
 */
async function fetchWithRetry(url, options, maxRetries = 5) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            
            // Jika sukses, langsung return JSON
            if (response.ok) {
                return await response.json();
            }

            // Handle Errors
            const errorText = await response.text();
            const status = response.status;
            
            // Khusus untuk Rate Limit (429) atau Server Overload (503), kita harus retry lebih sabar
            if (status === 429 || status === 503) {
                console.warn(`API Busy (Status ${status}). Retrying... Attempt ${attempt + 1}/${maxRetries}`);
                // Throw error to trigger catch block and retry logic
                throw new Error(`Server Busy (${status}): ${errorText}`);
            }

            // Untuk error 4xx lainnya (misal 400 Bad Request), biasanya salah prompt/input, jangan retry percuma
            if (status >= 400 && status < 500) {
                console.error(`Client Error (${status}): ${errorText}`);
                // Langsung stop, jangan retry
                throw new Error(`API Error (${status}): ${errorText}`);
            }

            // Default: throw error
            throw new Error(`API Error (${status}): ${errorText}`);

        } catch (error) {
            lastError = error;
            
            // Cek apakah error ini layak di-retry (Server Busy atau Network Error)
            const isRetryable = error.message.includes('429') || 
                                error.message.includes('503') || 
                                error.message.includes('fetch failed') ||
                                error.code === 'ETIMEDOUT';

            if (attempt < maxRetries - 1 && isRetryable) {
                // Exponential Backoff: 1s, 2s, 4s, 8s, 16s
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.log(`Waiting ${delay.toFixed(0)}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else if (!isRetryable) {
                // Jika errornya fatal (misal API Key salah), langsung throw
                throw error;
            }
        }
    }
    
    // Jika sudah habis retry
    console.error('Max retries reached. Failing.');
    throw lastError;
}


/**
 * FITUR 1 (Teks): Generate by command
 */
async function generateImage(prompt, sampleCount = 1, isProductOnly = true, isConsistent = true) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan. Pastikan GEMINI_API_KEY diatur di .env" };
    }

    const safeSampleCount = Math.max(1, Math.min(parseInt(sampleCount, 10) || 1, 4));

    let enhancedPrompt = "";
    let negative_prompt = "";

    if (isProductOnly) {
        enhancedPrompt = `(product photography:1.4), (e-commerce catalog shot:1.3), (white background:1.2), (no people:1.5), (no model:1.5), (a single item:1.3), ${prompt}`;
        negative_prompt = "text, words, watermark, logo, people, person, model, human, (multiple items:1.3), two items, collage, grid, multiple products";

        if (isConsistent) {
            enhancedPrompt += ", (all images must show the exact same product design, same model of product)";
        } else {
            enhancedPrompt += ", (show different designs and variations of the product, different styles)";
            negative_prompt = "text, words, watermark, logo, people, person, model, human, collage, grid";
        }
    } else {
        enhancedPrompt = `Fashion photography, ultra detailed, cinematic light, high-end model, (a single subject:1.3), ${prompt}`;
        negative_prompt = "text, words, watermark, logo, blurry, distorted, bad anatomy, (multiple subjects:1.3), collage, grid, two people";

        if (isConsistent) {
            enhancedPrompt += ", (the model must wear the exact same product design in all images)";
        } else {
            enhancedPrompt += ", (show the model wearing different designs or variations of the product)";
        }
    }

    const parameters = {
        sampleCount: safeSampleCount,
        aspectRatio: "1:1",
        outputMimeType: "image/png"
    };

    const payload = {
        instances: {
            prompt: enhancedPrompt,
            negative_prompt: negative_prompt
        },
        parameters: parameters
    };

    console.log("Mengirim payload ke Imagen:", JSON.stringify(payload, null, 2));

    try {
        const result = await fetchWithRetry(IMAGEN_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (result.predictions && Array.isArray(result.predictions)) {
            const imagesBase64 = result.predictions.map(pred => pred.bytesBase64Encoded);
            return { success: true, imagesBase64: imagesBase64 };
        } else {
            throw new Error("Respon API sukses, tetapi tidak ada data gambar (predictions) yang ditemukan.");
        }
    } catch (error) {
        console.error('AI Image Generation Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * FITUR 1 (Referensi): Generate by Reference (Image + Text to Image)
 */
async function generateByReference(referenceBase64, prompt, sampleCount = 1) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }
    const safeSampleCount = Math.max(1, Math.min(parseInt(sampleCount, 10) || 1, 6));
    const systemPrompt = `
You are an AI image editor. Your job is to take a user's reference image and modify it based on their text prompt.
You must follow the text prompt exactly.
The output should be a new image that combines the reference image's subject with the text prompt's instructions.
Do not just describe the image; you must output the final modified image.
`.trim();
    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { "text": prompt },
                    { "inlineData": { "mimeType": "image/png", "data": referenceBase64 } }
                ]
            }
        ],
        systemInstruction: { parts: [{ "text": systemPrompt }] },
        generationConfig: { responseModalities: ["IMAGE"] }
    };
    try {
        const apiCalls = [];
        for (let i = 0; i < safeSampleCount; i++) {
            apiCalls.push(
                fetchWithRetry(GEMINI_IMAGE_EDIT_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
            );
        }
        const results = await Promise.allSettled(apiCalls);
        const imagesBase64 = [];
        let lastError = null;
        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value.candidates?.[0]) {
                const candidate = res.value.candidates[0];
                const imagePart = candidate?.content?.parts?.find(p => p.inlineData);
                if (imagePart?.inlineData?.data) {
                    imagesBase64.push(imagePart.inlineData.data);
                }
            } else if (res.status === 'rejected') {
                lastError = res.reason?.message || "Satu panggilan API generate-by-reference gagal.";
                console.error("Satu panggilan generateByReference gagal:", lastError);
            }
        });
        if (imagesBase64.length > 0) {
            return { success: true, imagesBase64: imagesBase64 };
        } else {
            throw new Error(lastError || "Respon API sukses, tetapi tidak ada data gambar yang valid ditemukan.");
        }
    } catch (error) {
        console.error('AI Generate by Reference Error:', error);
        return { success: false, error: error.message };
    }
}


/**
 * FITUR 2 (Langkah 1): Segmentasi Produk.
 */
async function segmentProduct(productBase64, segmentPrompt) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }
    const systemPrompt = `
You are an AI segmentation expert. Your ONLY task is to look at the provided image, identify the **main product** based on the user's text hint (e.g., sandal, bag, shirt), and return a new image of **ONLY** that product on a **transparent background**.
--- RULES ---
1.  **USE THE HINT**: The user will provide a hint (e.g., "sandal"). Use this hint to identify the correct object.
2.  **REMOVE BACKGROUND**: The entire original background MUST be removed and replaced with transparency.
3.  **REMOVE NOISE**: You MUST remove all text, logos, watermarks, icons, or any other non-product elements.
4.  **STRICT FOCUS**: Do not add, change, or "fix" the product. Output only the original product pixels.
5.  **OUTPUT**: The output MUST be a PNG with a transparent background.
`.trim();
    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { "text": `Segment the main product from this image. The product is a "${segmentPrompt}". Remove all background, text, and logos. Return only the product on a transparent background.` },
                    { "inlineData": { "mimeType": "image/png", "data": productBase64 } }
                ]
            }
        ],
        systemInstruction: { parts: [{ "text": systemPrompt }] },
        generationConfig: { responseModalities: ["IMAGE"] }
    };
    try {
        const result = await fetchWithRetry(GEMINI_IMAGE_EDIT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (result.candidates && result.candidates[0]) {
            const candidate = result.candidates[0];
            const imagePart = candidate?.content?.parts?.find(p => p.inlineData);
            if (imagePart?.inlineData?.data) {
                return { success: true, imageBase64: imagePart.inlineData.data };
            } else {
                throw new Error("API (Segment) tidak mengembalikan data gambar.");
            }
        } else {
            throw new Error("API (Segment) tidak mengembalikan 'candidates'.");
        }
    } catch (error) {
        console.error('AI Segment Product Error:', error);
        return { success: false, error: error.message };
    }
}


/**
 * FITUR 2 (Langkah 2): GENERATE MODEL FROM PRODUCT (Strategi "KENAKAN")
 */
async function generateModelFromProduct(cleanProductBase64, sampleCount, mode, prompt, modelReferenceBase64) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }
    const safeSampleCount = Math.max(1, Math.min(parseInt(sampleCount, 10) || 1, 6));
    const systemPrompt = `
You are an AI Fashion Visualizer. Your ONLY job is to generate a new, photorealistic image of a mannequin model **wearing** the user's provided product image, based on user instructions.
--- INPUTS ---
1.  **PRODUCT IMAGE**: A clean PNG image of a product (e.g., sandal, shirt) on a transparent background.
2.  **USER PROMPT**: A text description of the scene, OR a reference image of a model/pose.
--- NON-NEGOTIABLE CORE RULES ---
1.  **GOAL**: You MUST generate a new scene based on the USER PROMPT.
2.  **PRODUCT INTEGRATION**: You MUST feature the PRODUCT IMAGE on the model you generate. The product must be worn realistically (e.g., sandals on feet, shirt on torso).
3.  **PHOTOREALISM**: The final image must be 8K, photorealistic, cinematic lighting, perfect anatomy.
4.  **MODEL CONSISTENCY (Goal 3)**:
    * If a **REFERENCE IMAGE** is provided: You MUST use the **exact pose, body type, and style** of the model in the reference image.
    * If only **TEXT PROMPT** is provided: You MUST use a **consistent, featureless, faceless mannequin** across all images.
5.  **FAILURE MODE**: If you do not use the provided PRODUCT IMAGE, you have failed. Do not invent a new product.
`.trim();

    const apiCalls = [];
    const angleTitles = [];
    for (let i = 0; i < safeSampleCount; i++) {
        const shotType = SHOT_TYPES[i];
        angleTitles.push(shotType.name);
        let fullPrompt;
        if (mode === 'reference') {
            fullPrompt = `Gunakan model dan pose dari gambar referensi. Pakaikan produk ke model tersebut. Terapkan angle shot: "${shotType.desc}"`;
        } else {
            fullPrompt = `
--- USER PROMPT (Scene & Model) ---
${prompt}
--- SHOT TYPE (Wajib Dipenuhi) ---
${shotType.desc}
`.trim();
        }
        const parts = [
            { "text": fullPrompt },
            { "text": "--- PRODUCT IMAGE (Item to wear) ---" },
            { "inlineData": { "mimeType": "image/png", "data": cleanProductBase64 } }
        ];
        if (mode === 'reference' && modelReferenceBase64) {
            parts.push({ "text": "--- MODEL REFERENCE IMAGE (Use this pose/style) ---" });
            parts.push({ "inlineData": { "mimeType": "image/png", "data": modelReferenceBase64 } });
        }
        const payload = {
            contents: [{ role: "user", parts }],
            systemInstruction: { parts: [{ "text": systemPrompt }] },
            generationConfig: { responseModalities: ["IMAGE"] }
        };
        apiCalls.push(
            fetchWithRetry(GEMINI_IMAGE_EDIT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
        );
    }
    try {
        const results = await Promise.allSettled(apiCalls);
        const imagesBase64 = [];
        let lastError = null;
        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value.candidates?.[0]) {
                const candidate = res.value.candidates[0];
                const imagePart = candidate?.content?.parts?.find(p => p.inlineData);
                if (imagePart?.inlineData?.data) {
                    imagesBase64.push(imagePart.inlineData.data);
                }
            } else if (res.status === 'rejected') {
                lastError = res.reason?.message || "Satu panggilan API generate-from-product gagal.";
                console.error("Satu panggilan generateModelFromProduct gagal:", lastError);
            }
        });
        if (imagesBase64.length > 0) {
            return { success: true, imagesBase64: imagesBase64, angleTitles: angleTitles };
        } else {
            throw new Error(lastError || "Respon API sukses, tetapi tidak ada data gambar yang valid ditemukan setelah semua percobaan.");
        }
    } catch (error) {
        console.error('AI Generate Model from Product Error:', error);
        return { success: false, error: error.message };
    }
}


/**
 * FITUR 3 (Langkah A): Generate Video Prompt
 * UPDATE: Menambahkan parameter aiModel untuk durasi langkah (step) dinamis (8s atau 5s)
 */
async function generateVeoPrompt(productBase64, modelBase64, platform, duration, aiModel) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan. Pastikan GEMINI_API_KEY diatur di .env" };
    }

    let platformInstruction = "";
    switch(platform) {
        case "tiktok": platformInstruction = "Gaya: Trendy, hook kuat, bahasa gaul."; break;
        case "instagram": platformInstruction = "Gaya: Estetik, cinematic, storytelling, fokus pada 'vibe'."; break;
        case "youtube": platformInstruction = "Gaya: Informatif, jelas, profesional, fokus fitur."; break;
        case "shopee": platformInstruction = "Gaya: Direct-to-sales, persuasif, fokus CTA dan promo."; break;
        default: platformInstruction = "Gaya: Iklan general.";
    }

    // [LOGIKA BARU] Tentukan durasi step berdasarkan model (default veo3 = 8s)
    const step = (aiModel === 'meta') ? 5 : 8;
    const modelName = (aiModel === 'meta') ? 'Meta AI' : 'Google Veo';

    const systemPrompt = `
You are an expert E-commerce Scriptwriter for Video AI (${modelName}). Your task is to analyze user images and generate a video script based on platform and duration, specifically formatted for the ${step}-second clip limitation of this model.
You MUST return your answer as a single, valid JSON object.

The JSON object must have two keys:
1. "fullScript": A string containing the complete shooting script, broken into **${step}-SECOND BLOCKS**. Include VISUAL, AUDIO, and VOICEOVER lines.
2. "voiceoverScript": A string containing ONLY the voiceover lines, concatenated together, ready for a Text-to-Speech engine.

--- PENTING: CONTOH BLOK ${step} DETIK ---
{
  "fullScript": "0:00-0:${step < 10 ? '0'+step : step} | VISUAL: Cinematic extreme close-up pada tekstur produk. Kamera tilt up.\nAUDIO: Musik Lo-fi dimulai.\nVOICEOVER: Ini bukan sekadar produk.\n\n0:${step < 10 ? '0'+step : step}-0:${step*2} | VISUAL: Medium shot model memakai produk, berjalan di taman kota.\nAUDIO: Suara langkah kaki.\nVOICEOVER: Ini adalah gaya hidup.",
  "voiceoverScript": "Ini bukan sekadar produk. Ini adalah gaya hidup."
}
`.trim();

    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { "text": `Platform Target: ${platformInstruction}` },
                    { "text": `**DURASI WAJIB**: Naskah HARUS pas untuk **${duration}**. Bagi naskah menjadi blok-blok ${step} detik (0:00-0:${step}, 0:${step}-0:${step*2}, dst).`},
                    { "text": "--- GAMBAR PRODUK (Fokus di sini) ---" },
                    { "inlineData": { "mimeType": "image/png", "data": productBase64 } },
                    { "text": "--- GAMBAR MODEL (Gunakan ini untuk 'vibe' dan 'gaya') ---" },
                    { "inlineData": { "mimeType": "image/png", "data": modelBase64 } },
                    { "text": "--- TUGAS ANDA ---" },
                    { "text": `Tulis naskah ${modelName} yang mempromosikan PRODUK dengan gaya MODEL, sesuai target platform dan durasi. Bagi menjadi blok ${step} detik. Kembalikan HANYA objek JSON yang valid.` }
                ]
            }
        ],
        systemInstruction: {
            parts: [{ "text": systemPrompt }]
        },
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    try {
        const result = await fetchWithRetry(GEMINI_TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (result.candidates && result.candidates[0]) {
            const jsonText = result.candidates[0].content.parts[0].text;
            let scriptData;
            try {
                scriptData = JSON.parse(jsonText);
            } catch (parseError) {
                console.error("Gagal mem-parse JSON dari AI:", jsonText);
                throw new Error("Respons AI bukan JSON yang valid.");
            }
            if (!scriptData || !scriptData.fullScript || typeof scriptData.voiceoverScript === 'undefined') {
                throw new Error("JSON respons dari AI tidak memiliki kunci 'fullScript' atau 'voiceoverScript'.");
            }
            return { success: true, scriptData: scriptData };
        } else {
            throw new Error("API (Veo Prompt Gen) tidak mengembalikan 'candidates'.");
        }
    } catch (error) {
        console.error('AI Generate Veo Prompt Error:', error);
        return { success: false, error: error.message };
    }
}


/**
 * FITUR 3 (Langkah B): Generate Video from Image (PLACEHOLDER)
 */
async function generateVideoFromImage(prompt) {
    console.log("Mencoba memanggil API Image-to-Video (Placeholder) dengan Teks:");
    console.log("Prompt:", prompt);

    await new Promise(resolve => setTimeout(resolve, 1500));
    return {
        success: false,
        error: "API Generasi Video (seperti Google Veo) adalah teknologi masa depan dan belum terintegrasi di aplikasi ini. Silakan nantikan update!"
    };
}


/**
 * FITUR 4 (Langkah A): Generate Audio Script (Dinamis VEO/Meta)
 */
async function generateAudioScript(productBase64, modelBase64, platform, duration, aiModel) {
    if (!API_KEY) return { success: false, error: "API Key tidak ditemukan." };

    let platformInstruction = "";
    switch(platform) {
        case "tiktok": platformInstruction = "Gaya: Trendy, hook kuat, bahasa gaul."; break;
        case "instagram": platformInstruction = "Gaya: Estetik, cinematic, storytelling."; break;
        case "youtube": platformInstruction = "Gaya: Informatif, jelas, profesional."; break;
        case "shopee": platformInstruction = "Gaya: Direct-to-sales, persuasif, promo."; break;
        default: platformInstruction = "Gaya: Iklan general.";
    }

    // [LOGIKA BARU] Tentukan durasi step berdasarkan model
    const step = aiModel === 'meta' ? 5 : 8;
    const modelName = aiModel === 'meta' ? 'Meta AI' : 'VEO3';

    const systemPrompt = `
You are an expert E-commerce Scriptwriter. Your task is to generate a video script specifically formatted into ${step}-second blocks for ${modelName}.
You MUST return your answer as a single, valid JSON object.

The JSON object must have two keys:
1. "fullScript": A string containing the complete shooting script, broken into **${step}-SECOND BLOCKS**. Include VISUAL, AUDIO, and VOICEOVER lines.
2. "voiceoverScript": A string containing ONLY the voiceover lines.

--- PENTING: CONTOH BLOK ${step} DETIK ---
{
  "fullScript": "0:00-0:${step < 10 ? '0'+step : step} | VISUAL: ...\nAUDIO: ...\nVOICEOVER: ...\n\n0:${step < 10 ? '0'+step : step}-0:${step*2} | VISUAL: ...",
  "voiceoverScript": "..."
}
`.trim();

    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { "text": `Platform Target: ${platformInstruction}` },
                    { "text": `**DURASI WAJIB**: Naskah HARUS pas untuk **${duration}**. Bagi naskah menjadi blok-blok ${step} detik.`},
                    { "text": "--- GAMBAR PRODUK ---" },
                    { "inlineData": { "mimeType": "image/png", "data": productBase64 } },
                    { "text": "--- GAMBAR MODEL ---" },
                    { "inlineData": { "mimeType": "image/png", "data": modelBase64 } },
                    { "text": `Tulis naskah iklan untuk ${modelName} (per ${step} detik). Kembalikan JSON.` }
                ]
            }
        ],
        systemInstruction: { parts: [{ "text": systemPrompt }] },
        generationConfig: { responseMimeType: "application/json" }
    };

    try {
        const result = await fetchWithRetry(GEMINI_TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (result.candidates && result.candidates[0]) {
            const jsonText = result.candidates[0].content.parts[0].text;
            let scriptData;
            try {
                scriptData = JSON.parse(jsonText);
            } catch (parseError) {
                console.error("Gagal mem-parse JSON dari AI:", jsonText);
                throw new Error("Respons AI bukan JSON yang valid.");
            }
            return { success: true, scriptData: scriptData };
        } else {
            throw new Error("API tidak mengembalikan candidates.");
        }
    } catch (error) {
        console.error('AI Generate Audio Script Error:', error);
        return { success: false, error: error.message };
    }
}


/**
 * FITUR 4 (Langkah B): Generate Voiceover (Text-to-Speech)
 */
async function generateVoiceover(script, voiceName) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    const ttsPrompt = `Ucapkan dengan nada komersial yang engaging: ${script}`;

    const payload = {
        contents: [{
            parts: [{ "text": ttsPrompt }]
        }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName }
                }
            }
        },
        model: "gemini-2.5-flash-preview-tts"
    };

    try {
        const result = await fetchWithRetry(GEMINI_TTS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/")) {
            const rateMatch = mimeType.match(/rate=(\d+)/);
            const sampleRate = (rateMatch && rateMatch[1]) ? parseInt(rateMatch[1], 10) : 24000;

            return {
                success: true,
                audioBase64: audioData,
                sampleRate: sampleRate
            };
        } else {
            throw new Error("API (TTS) tidak mengembalikan data audio.");
        }
    } catch (error) {
        console.error('AI Generate Voiceover Error:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}


/**
 * FITUR 4 (Langkah C): Rekomendasi Musik Latar (Text-to-Text)
 */
async function recommendMusic(mood, script) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    const systemPrompt = "Anda adalah seorang Produser Musik profesional. Tugas Anda adalah merekomendasikan musik latar (backsound) untuk sebuah video.";
    const userPrompt = `
        Klien membutuhkan musik untuk video mereka.
        Mood/Genre yang diinginkan: "${mood}"
        Konteks skrip narasi video (untuk referensi tempo dan suasana): "${script || 'Tidak ada skrip diberikan, fokus pada mood.'}"

        Berikan rekomendasi Anda dalam format yang jelas. Jelaskan dalam Bahasa Indonesia:
        - **Deskripsi Trek:** Jelaskan seperti apa musiknya (instrumen, tempo, nuansa).
        - **Penempatan:** Di mana musik ini harus digunakan (misal: "di seluruh video", "hanya di intro").
        - **Mengapa:** Jelaskan mengapa pilihan ini cocok.
    `;

    const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ "text": systemPrompt }] }
    };

    try {
        const result = await fetchWithRetry(GEMINI_TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (result.candidates && result.candidates[0]) {
            const text = result.candidates[0].content.parts[0].text;
            return { success: true, recommendation: text.trim() };
        } else {
            throw new Error("API (Recommend Music) tidak mengembalikan 'candidates'.");
        }
    } catch (error) {
        console.error('AI Recommend Music Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * FITUR 4 (Langkah D): Rekomendasi Efek Suara (Text-to-Text)
 */
async function recommendSfx(script) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    const systemPrompt = "Anda adalah seorang Sound Designer (Desainer Suara) profesional. Tugas Anda adalah menganalisis skrip video dan merekomendasikan efek suara (SFX) untuk membuatnya lebih hidup.";
    const userPrompt = `
        Analisis skrip berikut:
        ---
        ${script}
        ---

        Buatlah 'cue sheet' (daftar isyarat) berisi rekomendasi SFX. Jelaskan dengan spesifik dalam Bahasa Indonesia:
        - **Efek Suara (SFX):** Suara apa yang dibutuhkan (misal: "Klik Mouse", "Transisi Whoosh").
        - **Pemicu (Cue):** Kapan suara itu harus muncul (kutip bagian skrip atau jelaskan adegannya).
        - **Tujuan:** Mengapa SFX ini penting (misal: "menegaskan aksi", "transisi antar adegan").

        Jika tidak ada SFX yang relevan, katakan demikian.
    `;

    const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ "text": systemPrompt }] }
    };

    try {
        const result = await fetchWithRetry(GEMINI_TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (result.candidates && result.candidates[0]) {
            const text = result.candidates[0].content.parts[0].text;
            return { success: true, recommendation: text.trim() };
        } else {
            throw new Error("API (Recommend SFX) tidak mengembalikan 'candidates'.");
        }
    } catch (error) {
        console.error('AI Recommend SFX Error:', error);
        return { success: false, error: error.message };
    }
}


/**
 * FITUR 5: Generate Caption & Hashtags
 */
async function generateCaptionAndHashtags(platform, productBase64, modelBase64, keywords) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    const systemPrompt = `
You are a professional Social Media Manager and Copywriter.
Your task is to generate an engaging caption and a set of relevant hashtags for a post on ${platform}.
Based on the provided images (Product and/or Model) and keywords.

Output MUST be a valid JSON object with two keys:
1. "caption": The caption text (including emojis if suitable for the platform).
2. "hashtags": A string of hashtags separated by spaces.
`.trim();

    const userParts = [
        { text: `Platform: ${platform}` },
        { text: `Keywords: ${keywords || "None"}` }
    ];

    if (productBase64) {
        userParts.push({ text: "--- PRODUCT IMAGE ---" });
        userParts.push({ inlineData: { mimeType: "image/png", data: productBase64 } });
    }

    if (modelBase64) {
        userParts.push({ text: "--- MODEL/STYLE IMAGE ---" });
        userParts.push({ inlineData: { mimeType: "image/png", data: modelBase64 } });
    }

    userParts.push({ text: "Generate the caption and hashtags now. Return ONLY JSON." });

    const payload = {
        contents: [{ role: "user", parts: userParts }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json" }
    };

    try {
        const result = await fetchWithRetry(GEMINI_TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (result.candidates && result.candidates[0]) {
            const jsonText = result.candidates[0].content.parts[0].text;
            let data;
            try {
                data = JSON.parse(jsonText);
            } catch (e) {
                console.error("Failed to parse JSON from Caption Gen:", jsonText);
                throw new Error("AI response was not valid JSON.");
            }
            return { success: true, data: data };
        } else {
            throw new Error("API did not return candidates.");
        }
    } catch (error) {
        console.error('AI Generate Caption Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * FITUR EXTRA: Remove Background (Khusus Logo/Watermark)
 * Berbeda dengan Segment Product, ini lebih agresif menghapus background putih pada grafis/teks.
 */
async function removeBackground(imageBase64, typePrompt) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    // Prompt khusus untuk logo/text removal - DIUPDATE
    const systemPrompt = `
You are an expert graphic designer specialized in background removal for LOGOS and WATERMARKS.
Your task is to take the provided image (likely a logo with a white or solid background) and remove the background COMPLETELY, creating a TRANSPARENT PNG.

--- STRICT RULES ---
1.  **TARGET**: Isolate the logo text, icon, or symbol "${typePrompt}".
2.  **ALPHA CHANNEL**: You MUST return an image with an ALPHA CHANNEL. All background pixels must have alpha=0 (transparent).
3.  **WHITE REMOVAL**: If the logo is on a white box, the white box must be GONE. Only the logo itself should remain.
4.  **OUTPUT**: Return ONLY the raw PNG image data with transparency.
`.trim();

    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { "text": `Remove the white/solid background from this logo. Make it transparent PNG.` },
                    { "inlineData": { "mimeType": "image/png", "data": imageBase64 } }
                ]
            }
        ],
        systemInstruction: { parts: [{ "text": systemPrompt }] },
        generationConfig: {
            responseModalities: ["IMAGE"],
            // Note: Gemini usually defaults to JPEG/PNG based on content, but we strongly imply PNG in prompt.
        }
    };

    try {
        const result = await fetchWithRetry(GEMINI_IMAGE_EDIT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (result.candidates && result.candidates[0]) {
            const candidate = result.candidates[0];
            const imagePart = candidate?.content?.parts?.find(p => p.inlineData);
            if (imagePart?.inlineData?.data) {
                return { success: true, imageBase64: imagePart.inlineData.data };
            } else {
                throw new Error("API tidak mengembalikan data gambar.");
            }
        } else {
            throw new Error("API tidak mengembalikan 'candidates'.");
        }
    } catch (error) {
        console.error('AI Remove Background Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * TSHIRT CREATOR: Generate 6 Variasi Foto
 */
async function generateTshirtPhotos(base64Image, theme) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    // Kita akan melakukan loop 6 kali untuk menghasilkan 6 variasi
    const variationCount = 6;
    const apiCalls = [];

    // Prompts variasi agar hasil tidak identik (Angle/Zoom)
    const variations = [
        "Eye-level shot, balanced composition",
        "Close-up detail shot, sharp focus on fabric",
        "High angle artistic shot",
        "Slightly low angle, heroic look",
        "Dynamic lighting, dramatic shadows",
        "Soft diffused lighting, clean look"
    ];

    const systemPrompt = `
You are a professional Product Photographer. Your task is to transform the provided T-Shirt Mockup into a high-end, commercial product photograph.
Theme: ${theme}.
The design on the t-shirt MUST REMAIN EXACTLY THE SAME. Do not distort the logo or text.
Focus on realistic lighting, fabric texture, and background atmosphere fitting the theme.
Result must be a photorealistic image.
`.trim();

    for (let i = 0; i < variationCount; i++) {
        const variationPrompt = `Transform this mockup into a professional photograph. Theme: ${theme}. Style: ${variations[i]}. Photorealistic, 8k. Keep design exact.`;

        const payload = {
            contents: [{
                parts: [
                    { text: variationPrompt },
                    { inlineData: { mimeType: "image/png", data: base64Image } } // Input format PNG
                ]
            }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseModalities: ["IMAGE"] }
        };

        apiCalls.push(
            fetchWithRetry(GEMINI_IMAGE_EDIT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
        );
    }

    try {
        console.log(`[Tshirt Creator] Generating ${variationCount} variations for theme: ${theme}`);

        // Jalankan semua request secara paralel
        const results = await Promise.allSettled(apiCalls);

        const generatedImages = [];
        let errors = [];

        results.forEach((res, index) => {
            if (res.status === 'fulfilled' && res.value.candidates?.[0]) {
                const imagePart = res.value.candidates[0].content?.parts?.find(p => p.inlineData);
                if (imagePart?.inlineData?.data) {
                    generatedImages.push(imagePart.inlineData.data);
                }
            } else {
                const err = res.reason?.message || "Unknown error";
                console.error(`Variation ${index + 1} failed:`, err);
                errors.push(err);
            }
        });

        if (generatedImages.length > 0) {
            return { success: true, images: generatedImages, partial: generatedImages.length < variationCount };
        } else {
            throw new Error(`All generation attempts failed. Errors: ${errors.join(', ')}`);
        }

    } catch (error) {
        console.error('AI Tshirt Generator Error:', error);
        return { success: false, error: error.message };
    }
}


module.exports = {
    generateImage,
    generateByReference,
    segmentProduct,
    generateModelFromProduct,
    generateVeoPrompt,
    generateVideoFromImage,
    generateAudioScript,
    generateVoiceover,
    recommendMusic,
    recommendSfx,
    generateCaptionAndHashtags,
    removeBackground,
    generateTshirtPhotos // Export fungsi baru
};