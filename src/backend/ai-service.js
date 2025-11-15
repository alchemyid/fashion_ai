const fetch = require('node-fetch');
require('dotenv').config();

// Pastikan environment variable GEMINI_API_KEY sudah diatur dengan benar
const API_KEY = process.env.GEMINI_API_KEY;
const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;

/**
 * Fungsi untuk menghasilkan gambar fashion menggunakan model Imagen.
 * @param {string} prompt - Deskripsi gambar yang diinginkan.
 * @returns {Promise<{success: boolean, imageBase64: string, error: string}>}
 */
async function generateImage(prompt) {
    if (!API_KEY) {
        return { success: false, error: "API Key tidak ditemukan. Pastikan GEMINI_API_KEY diatur di .env" };
    }

    // Menambahkan instruksi profesional untuk hasil fashion yang maksimal
    const enhancedPrompt = `Fashion photography, high-end model, ultra detailed, cinematic light: ${prompt}`;

    const payload = {
        instances: {
            prompt: enhancedPrompt,
            negative_prompt: "low resolution, blurry, distorted, text, logo, watermark, bad hands, cartoon, sketch"
        },
        parameters: {
            sampleCount: 1,
            aspectRatio: "1:1", // Rasio umum untuk media sosial
            outputMimeType: "image/png"
        }
    };

    try {
        const response = await fetch(IMAGEN_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            // Tangani error API (misal: 400, 403, 500)
            const errorText = await response.text();
            throw new Error(`API Error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;

        if (base64Data) {
            return {
                success: true,
                imageBase64: base64Data,
            };
        } else {
            throw new Error("Respon API sukses, tetapi tidak ada data gambar Base64 yang ditemukan.");
        }

    } catch (error) {
        console.error('AI Image Generation Error:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

module.exports = {
    generateImage
};