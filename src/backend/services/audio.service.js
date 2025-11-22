// src/backend/services/audio.service.js
const { API_KEY, GEMINI_TEXT_API_URL, GEMINI_TTS_API_URL, fetchWithRetry } = require('./common.service');

/**
 * Generates an audio script for a video.
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
  "fullScript": "0:00-0:${step < 10 ? '0'+step : step} | VISUAL: ...\\nAUDIO: ...\\nVOICEOVER: ...\\n\\n0:${step < 10 ? '0'+step : step}-0:${step*2} | VISUAL: ...",
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
 * Generates a voiceover from a script.
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
            const rateMatch = mimeType.match(/rate=(\\d+)/);
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
 * Recommends background music for a video.
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
 * Recommends sound effects for a video script.
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
    generateAudioScript,
    generateVoiceover,
    recommendMusic,
    recommendSfx
};
