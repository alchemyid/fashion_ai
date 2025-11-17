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
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`API Error on attempt ${attempt + 1}: ${response.status} ${errorText}`);
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
                throw error;
            }
        }
    }
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
 * FITUR 3 (Langkah A): Generate VEO Prompt (8s)
 */
async function generateVeoPrompt(productBase64, modelBase64, platform, duration) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    let platformInstruction = "";
    switch(platform) {
        case "tiktok": platformInstruction = "Gaya: Trendy, hook kuat, bahasa gaul."; break;
        case "instagram": platformInstruction = "Gaya: Estetik, cinematic, storytelling, fokus pada 'vibe'."; break;
        case "youtube": platformInstruction = "Gaya: Informatif, jelas, profesional, fokus fitur."; break;
        case "shopee": platformInstruction = "Gaya: Direct-to-sales, persuasif, fokus CTA dan promo."; break;
        default: platformInstruction = "Gaya: Iklan general.";
    }

    // **PERUBAHAN**: System prompt sekarang mencontohkan blok 8 detik
    const systemPrompt = `
You are an expert E-commerce Scriptwriter for VEO (Video AI). Your task is to analyze user images and generate a video script based on platform and duration, specifically formatted for VEO's 8-second clip limitation.
You MUST return your answer as a single, valid JSON object.

The JSON object must have two keys:
1. "fullScript": A string containing the complete shooting script, broken into **8-SECOND BLOCKS**. Include VISUAL, AUDIO, and VOICEOVER lines.
2. "voiceoverScript": A string containing ONLY the voiceover lines, concatenated together, ready for a Text-to-Speech engine.

--- PENTING: CONTOH BLOK 8 DETIK ---
{
  "fullScript": "0:00-0:08 | VISUAL: Cinematic extreme close-up pada tekstur produk. Kamera tilt up.\nAUDIO: Musik Lo-fi dimulai.\nVOICEOVER: Ini bukan sekadar produk.\n\n0:08-0:16 | VISUAL: Medium shot model memakai produk, berjalan di taman kota.\nAUDIO: Suara langkah kaki.\nVOICEOVER: Ini adalah gaya hidup.",
  "voiceoverScript": "Ini bukan sekadar produk. Ini adalah gaya hidup."
}
`.trim();

    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { "text": `Platform Target: ${platformInstruction}` },
                    { "text": `**DURASI WAJIB**: Naskah HARUS pas untuk **${duration}**. Bagi naskah menjadi blok-blok 8 detik (0:00-0:08, 0:08-0:16, dst).`},
                    { "text": "--- GAMBAR PRODUK (Fokus di sini) ---" },
                    { "inlineData": { "mimeType": "image/png", "data": productBase64 } },
                    { "text": "--- GAMBAR MODEL (Gunakan ini untuk 'vibe' dan 'gaya') ---" },
                    { "inlineData": { "mimeType": "image/png", "data": modelBase64 } },
                    { "text": "--- TUGAS ANDA ---" },
                    { "text": `Tulis naskah VEO yang mempromosikan PRODUK dengan gaya MODEL, sesuai target platform dan durasi. Bagi menjadi blok 8 detik. Kembalikan HANYA objek JSON yang valid.` }
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
 * **PERUBAHAN**: FITUR 4 (Langkah A): Generate Audio Script (8s)
 */
async function generateAudioScript(productBase64, modelBase64, platform, duration) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    let platformInstruction = "";
    switch(platform) {
        case "tiktok": platformInstruction = "Gaya: Trendy, hook kuat, bahasa gaul."; break;
        case "instagram": platformInstruction = "Gaya: Estetik, cinematic, storytelling, fokus pada 'vibe'."; break;
        case "youtube": platformInstruction = "Gaya: Informatif, jelas, profesional, fokus fitur."; break;
        case "shopee": platformInstruction = "Gaya: Direct-to-sales, persuasif, fokus CTA dan promo."; break;
        default: platformInstruction = "Gaya: Iklan general.";
    }

    // **PERUBAHAN**: System prompt sekarang mencontohkan blok 8 detik
    const systemPrompt = `
You are an expert E-commerce Scriptwriter. Your task is to analyze user images and generate a video script based on platform and duration, specifically formatted into 8-second blocks.
You MUST return your answer as a single, valid JSON object.

The JSON object must have two keys:
1. "fullScript": A string containing the complete shooting script, broken into **8-SECOND BLOCKS**. Include VISUAL, AUDIO, and VOICEOVER lines.
2. "voiceoverScript": A string containing ONLY the voiceover lines, concatenated together, ready for a Text-to-Speech engine.

--- PENTING: CONTOH BLOK 8 DETIK ---
{
  "fullScript": "0:00-0:08 | VISUAL: Cinematic extreme close-up pada tekstur produk. Kamera tilt up.\nAUDIO: Musik Lo-fi dimulai.\nVOICEOVER: Ini bukan sekadar produk.\n\n0:08-0:16 | VISUAL: Medium shot model memakai produk, berjalan di taman kota.\nAUDIO: Suara langkah kaki.\nVOICEOVER: Ini adalah gaya hidup.",
  "voiceoverScript": "Ini bukan sekadar produk. Ini adalah gaya hidup."
}
`.trim();

    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { "text": `Platform Target: ${platformInstruction}` },
                    { "text": `**DURASI WAJIB**: Naskah HARUS pas untuk **${duration}**. Bagi naskah menjadi blok-blok 8 detik (0:00-0:08, 0:08-0:16, dst).`},
                    { "text": "--- GAMBAR PRODUK (Fokus di sini) ---" },
                    { "inlineData": { "mimeType": "image/png", "data": productBase64 } },
                    { "text": "--- GAMBAR MODEL (Gunakan ini untuk 'vibe' dan 'gaya') ---" },
                    { "inlineData": { "mimeType": "image/png", "data": modelBase64 } },
                    { "text": "--- TUGAS ANDA ---" },
                    { "text": `Tulis naskah iklan yang mempromosikan GAMBAR PRODUK dengan gaya dari GAMBAR MODEL, sesuai target platform dan durasi. Bagi menjadi blok 8 detik. Kembalikan HANYA objek JSON yang valid.` }
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
            throw new Error("API (Audio Script Gen) tidak mengembalikan 'candidates'.");
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
            // **PERBAIKAN BUG**: Tambahkan fallback jika regex gagal
            const rateMatch = mimeType.match(/rate=(\d+)/);
            const sampleRate = (rateMatch && rateMatch[1]) ? parseInt(rateMatch[1], 10) : 24000; // Default 24kHz

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


module.exports = {
    generateImage,
    generateByReference,
    segmentProduct,
    generateModelFromProduct,
    generateVeoPrompt, // **PERUBAHAN**: Mengganti nama fungsi lama
    generateVideoFromImage,
    generateAudioScript,
    generateVoiceover,
    recommendMusic,
    recommendSfx
};