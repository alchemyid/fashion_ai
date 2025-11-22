// src/backend/services/video.service.js
const { API_KEY, GEMINI_TEXT_API_URL, fetchWithRetry } = require('./common.service');

/**
 * Generates a video script prompt for VEO based on product and model images.
 */
async function generateVeoPrompt(productBase64, modelBase64, platform, duration, aiModel) {
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
  "fullScript": "0:00-0:${step < 10 ? '0'+step : step} | VISUAL: Cinematic extreme close-up pada tekstur produk. Kamera tilt up.\\nAUDIO: Musik Lo-fi dimulai.\\nVOICEOVER: Ini bukan sekadar produk.\\n\\n0:${step < 10 ? '0'+step : step}-0:${step*2} | VISUAL: Medium shot model memakai produk, berjalan di taman kota.\\nAUDIO: Suara langkah kaki.\\nVOICEOVER: Ini adalah gaya hidup.",
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
 * Placeholder function to generate a video from a text prompt.
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

module.exports = {
    generateVeoPrompt,
    generateVideoFromImage
};
