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
// **BARU**: URL untuk FITUR 4 (Text-to-Speech)
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
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error (${response.status}): ${errorText}`);
            }
            return await response.json();
        } catch (error) {
            if (attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.log(`Attempt ${attempt + 1} failed. Retrying in ${delay.toFixed(0)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('AI Generation Error (Final Attempt):', error);
                throw error; // Lemparkan error setelah percobaan terakhir
            }
        }
    }
}


/**
 * FITUR 1 (Teks): Generate by command
 */
async function generateImage(prompt, sampleCount = 1) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan. Pastikan GEMINI_API_KEY diatur di .env" };
    }
    const safeSampleCount = Math.max(1, Math.min(parseInt(sampleCount, 10) || 1, 8));
    const enhancedPrompt = `Fashion photography, ultra detailed, cinematic light, high-end model: ${prompt}`;
    const payload = {
        instances: {
            prompt: enhancedPrompt,
            negative_prompt: "low resolution, blurry, distorted, text, logo, watermark, bad hands, cartoon, sketch, bad anatomy"
        },
        parameters: {
            sampleCount: safeSampleCount,
            aspectRatio: "1:1",
            outputMimeType: "image/png"
        }
    };
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
 * FITUR 3 (Langkah A): Generate Video Prompt (Image-to-Text)
 */
async function generateVideoPrompt(imageBase64) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }
    const systemPrompt = `
You are an expert E-commerce Video Director for platforms like TikTok and Instagram.
Your task is to analyze the user's product image and generate a compelling, short video prompt.
This prompt will be used by another AI to animate the image.
--- RULES ---
1.  **Output Format**: MUST be a single, concise paragraph (2-4 sentences).
2.  **Focus**: Describe dynamic motion cues. DO NOT just describe the static image.
3.  **E-commerce Goal**: The prompt must be designed to showcase the product attractively.
4.  **Example**:
    * **BAD**: "A woman sitting on a stool."
    * **GOOD**: "Slow zoom begins on the sandal's stitching. The model gently taps her foot, making the leather strap catch the light. A soft camera pan moves up her leg. End with a quick shot of the full outfit."
`.trim();
    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { "text": "Analyze this image and generate a short, dynamic video prompt for an e-commerce showcase." },
                    { "inlineData": { "mimeType": "image/png", "data": imageBase64 } }
                ]
            }
        ],
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
            return { success: true, prompt: text };
        } else {
            throw new Error("API (Video Prompt) tidak mengembalikan 'candidates'.");
        }
    } catch (error) {
        console.error('AI Generate Video Prompt Error:', error);
        return { success: false, error: error.message };
    }
}


/**
 * FITUR 3 (Langkah B): Generate Video from Image (PLACEHOLDER)
 */
async function generateVideoFromImage(imageBase64, prompt) {
    console.log("Mencoba memanggil API Image-to-Video (Placeholder)");
    console.log("Prompt:", prompt);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return {
        success: false,
        error: "API Generasi Video (seperti Google Veo) adalah teknologi masa depan dan belum terintegrasi di aplikasi ini. Silakan nantikan update!"
    };
}


/**
 * **BARU**: FITUR 4 (Langkah A): Generate Audio Script (Vision-to-Text)
 * @param {string} productBase64 - Gambar produk bersih.
 * @param {string} modelBase64 - Gambar model final.
 * @param {string} platform - Target platform (tiktok, instagram, shopee).
 * @returns {Promise<{success: boolean, script: string, error: string}>}
 */
async function generateAudioScript(productBase64, modelBase64, platform) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    let platformInstruction = "";
    switch(platform) {
        case "tiktok":
            platformInstruction = "Buat script yang sangat cepat (15 detik), trendy, dan dimulai dengan hook yang kuat. Gunakan bahasa gaul.";
            break;
        case "instagram":
            platformInstruction = "Buat script yang estetik (30 detik), cinematic, dan bercerita. Fokus pada 'vibe' dan 'feel' dari produk dan model.";
            break;
        case "youtube":
            platformInstruction = "Buat script yang informatif (30 detik), jelas, dan profesional. Fokus pada fitur dan keunggulan produk.";
            break;
        case "shopee":
            platformInstruction = "Buat script yang direct-to-sales (20 detik), fokus pada CTA (Call to Action), harga, dan promo. Sangat persuasif.";
            break;
        default:
            platformInstruction = "Buat script iklan 20 detik yang general.";
    }

    const systemPrompt = `
You are an expert E-commerce Scriptwriter. Your ONLY task is to analyze the user's images (a product image and a model image) and their target platform, then write a compelling, short video script.

--- ANALYSIS ---
1.  **Analyze Product Image**: Identify the key features, material, and style of the product.
2.  **Analyze Model Image**: Identify the 'vibe', style, and context (e.g., casual, elegant, indoor, outdoor).
3.  **Analyze Platform**: Adapt your writing style based on the platform's requirements.

--- OUTPUT ---
You MUST return ONLY the final script text. Do not include "Berikut scriptnya:" or any other pre-amble. Just the script.
`.trim();

    // Bangun payload multimodal
    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { "text": `Platform Target: ${platformInstruction}` },
                    { "text": "--- GAMBAR PRODUK (Fokus di sini) ---" },
                    {
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": productBase64
                        }
                    },
                    { "text": "--- GAMBAR MODEL (Gunakan ini untuk 'vibe' dan 'gaya') ---" },
                    {
                        "inlineData": {
                            "mimeType": "image/png",
                            "data": modelBase64
                        }
                    },
                    { "text": "--- TUGAS ANDA ---" },
                    { "text": "Tulis naskah iklan 15-30 detik yang mempromosikan GAMBAR PRODUK dengan gaya dari GAMBAR MODEL, sesuai target platform. Hanya kembalikan naskahnya." }
                ]
            }
        ],
        systemInstruction: {
            parts: [{ "text": systemPrompt }]
        }
    };

    try {
        // Panggil model Vision (sama dengan yang dipakai di Fitur 3)
        const result = await fetchWithRetry(GEMINI_TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (result.candidates && result.candidates[0]) {
            const text = result.candidates[0].content.parts[0].text;
            return { success: true, script: text.trim() };
        } else {
            throw new Error("API (Script Gen) tidak mengembalikan 'candidates'.");
        }
    } catch (error) {
        console.error('AI Generate Audio Script Error:', error);
        return { success: false, error: error.message };
    }
}


/**
 * FITUR 4 (Langkah B): Generate Voiceover (Text-to-Speech)
 * @param {string} script - Naskah final.
 * @param {string} voiceName - Nama suara (misal: "Kore", "Puck").
 * @returns {Promise<{success: boolean, audioBase64: string, sampleRate: number, error: string}>}
 */
async function generateVoiceover(script, voiceName) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    // Perintah untuk nada (bisa kita kembangkan nanti)
    const ttsPrompt = `Say in an engaging, commercial tone: ${script}`;

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
        // Panggil API TTS
        const result = await fetchWithRetry(GEMINI_TTS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType; // Ini akan berisi 'audio/L16;rate=24000'

        if (audioData && mimeType && mimeType.startsWith("audio/")) {
            // Ekstrak sample rate dari mimeType
            const sampleRate = parseInt(mimeType.match(/rate=(\d+)/)[1], 10);

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


module.exports = {
    generateImage,
    generateByReference,
    segmentProduct,
    generateModelFromProduct,
    generateVideoPrompt,
    generateVideoFromImage,
    generateAudioScript,    // Ekspor fungsi
    generateVoiceover       // Ekspor fungsi
};