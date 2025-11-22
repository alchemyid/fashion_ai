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
const GEMINI_TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
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
--- RULES ---
1. The output should be a new image that combines the reference image's subject with the text prompt's instructions.
2. Do not just describe the image; you must output the final modified image.
3. The output image must be photorealistic and high quality.
4. Maintain the core elements of the reference image unless the prompt specifies otherwise.
5. **OUTPUT**: The output MUST be a PNG with a transparent background.
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
 * TSHIRT CREATOR: Generate Photoshoot
 * This is the new, powerful function that handles front and back designs in a single, efficient call.
 */
async function generateTshirtPhotos(frontImage, backImage, theme) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan." };
    }

    const hasBackDesign = !!backImage;
    const poses = [
        "Male model standing, full body shot, facing forward.",
        "Male model walking towards camera, confident stride.",
        "Close-up shot of the t-shirt fabric and design, worn by a model.",
        "Male model sitting on a stool, relaxed pose.",
        "Male model leaning against a wall, side profile.",
        "Over-the-shoulder shot of a male model looking away."
    ];

    const apiCalls = [];

    const systemPrompt = `
You are a professional photoshoot director for a fashion brand. Your task is to generate a commercial photo of a model wearing the provided t-shirt mockup.
You must strictly follow the theme and pose instructions. The design on the t-shirt MUST remain exactly the same. Do not alter or distort it.
The final image must be photorealistic, 8k, with professional lighting and composition that matches the theme.
Theme: "${theme}".
`.trim();

    // Create calls for the Front Design
    poses.forEach(pose => {
        const prompt = `Generate a photorealistic image of a model wearing this t-shirt. View: FRONT. Pose: ${pose}`;
        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/png", data: frontImage } }
                ]
            }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseModalities: ["IMAGE"] }
        };
        apiCalls.push(fetchWithRetry(GEMINI_IMAGE_EDIT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }));
    });

    // Create calls for the Back Design if it exists
    if (hasBackDesign) {
        poses.forEach(pose => {
            const prompt = `Generate a photorealistic image of a model wearing this t-shirt. View: BACK. Pose: ${pose.replace("facing forward", "facing away")}`;
            const payload = {
                contents: [{
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: "image/png", data: backImage } }
                    ]
                }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { responseModalities: ["IMAGE"] }
            };
            apiCalls.push(fetchWithRetry(GEMINI_IMAGE_EDIT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }));
        });
    }

    try {
        console.log(`[Tshirt Creator] Starting ${apiCalls.length} parallel API calls for theme: ${theme}`);
        
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
                console.error(`Image generation ${index + 1} failed:`, err);
                errors.push(err);
            }
        });

        if (generatedImages.length === 0) {
            throw new Error(`All generation attempts failed. Last error: ${errors.pop()}`);
        }
        
        console.log(`[Tshirt Creator] Successfully generated ${generatedImages.length} images.`);
        return { success: true, images: generatedImages };

    } catch (error) {
        console.error('AI Tshirt Generator Error:', error);
        return { success: false, error: error.message };
    }
}


// --- HELPER FUNCTIONS ---
function cleanJsonResponse(text) {
    if (!text) return "{}";
    // Hapus markdown formatting ```json ... ``` dan whitespace
    return text.replace(/```json\n?|```/g, '').trim();
}


/**
 * FITUR BARU: AI FASHION STYLIST
 * 1. Analisis produk (Gemini Vision) -> Dapatkan warna, jenis, bahan.
 * 2. Generate gambar outfit (Imagen) -> Berdasarkan analisis + Style pilihan.
 */

async function generateStylistOutfit(productBase64, styleName, gender) {
    if (!API_KEY) return { success: false, error: "API Key missing." };

    // LANGKAH 1: Analisis Produk (Vision)
    const visionPrompt = `
    Act as a professional Fashion Stylist.
    1. Analyze this product image (color, material, style).
    2. Create a complete outfit mix & match for a ${gender} with "${styleName}" style.
    3. Generate an Image Prompt to visualize this outfit.
    4. Provide styling advice in Indonesian on how to wear this outfit confidently.
    5. Ensure the main product in the input image is worn by the model and looks exactly the same.
    6. Advice menggunakan bahasa indonesia.
    
    IMPORTANT: Return ONLY a JSON object. No markdown, no extra text.
    Format:
    {
        "imagePrompt": "A photorealistic full body shot...",
        "advice": "Saran styling..."
    }
    `;

    try {
        const visionPayload = {
            contents: [{
                role: "user",
                parts: [
                    { text: visionPrompt },
                    { inlineData: { mimeType: "image/png", data: productBase64 } }
                ]
            }],
            generationConfig: { responseMimeType: "application/json" }
        };

        const visionRes = await fetchWithRetry(GEMINI_TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(visionPayload)
        });

        let rawText = visionRes.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error("Gagal menganalisis produk (No Text).");

        // FIX: Bersihkan JSON sebelum parse
        rawText = cleanJsonResponse(rawText);
        
        let analysis;
        try {
            analysis = JSON.parse(rawText);
        } catch (e) {
            console.error("JSON Parse Error:", rawText);
            throw new Error("Gagal membaca respon AI (Invalid JSON).");
        }

        const finalPrompt = analysis.imagePrompt;
        const advice = analysis.advice;

        // LANGKAH 2: Generate Image (Menggunakan Prompt dari Langkah 1)
        // Kita gunakan GEMINI_IMAGE_EDIT_API_URL agar bisa mengirim gambar produk asli sebagai referensi kuat
        const imagePayload = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: `Create this outfit: ${finalPrompt}. Ensure the main product in the input image is worn by the model and looks exactly the same.` },
                        { inlineData: { mimeType: "image/png", data: productBase64 } }
                    ]
                }
            ],
            generationConfig: { responseModalities: ["IMAGE"] }
        };

        const imageRes = await fetchWithRetry(GEMINI_IMAGE_EDIT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(imagePayload)
        });

        const imagePart = imageRes.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        
        if (imagePart?.inlineData?.data) {
            return {
                success: true,
                imageBase64: imagePart.inlineData.data,
                stylingAdvice: advice
            };
        } else {
            throw new Error("Gagal men-generate gambar outfit.");
        }

    } catch (error) {
        console.error("AI Stylist Error:", error);
        return { success: false, error: error.message };
    }
}

// Placeholder functions to maintain compatibility with main.js calls
async function generateVeoPrompt(p, m, pl, d, a) { return { success: true, scriptData: { fullScript: "Script...", voiceoverScript: "VO..." } }; }
async function generateVideoFromImage(p) { return { success: false, error: "Placeholder" }; }
async function generateAudioScript(p, m, pl, d, a) { return { success: true, scriptData: { fullScript: "Script...", voiceoverScript: "VO..." } }; }
async function generateVoiceover(s, v) { return { success: false, error: "Placeholder" }; }
async function recommendMusic(m, s) { return { success: true, recommendation: "Music..." }; }
async function recommendSfx(s) { return { success: true, recommendation: "SFX..." }; }
async function generateCaptionAndHashtags(p, pb, mb, k) { return { success: true, data: { caption: "Caption", hashtags: "#hash" } }; }
async function removeBackground(i, p) { return segmentProduct(i, p); }


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
    generateTshirtPhotos,
    generateStylistOutfit// Export fungsi baru
};
