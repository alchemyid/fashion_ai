// src/backend/services/image.service.js
const { API_KEY, IMAGEN_API_URL, GEMINI_IMAGE_EDIT_API_URL, fetchWithRetry } = require('./common.service');

async function generateBaseProduct(prompt, aspectRatio = '1:1') {
    if (!API_KEY) throw new Error("API Key not found.");

    const enhancedPrompt = `(professional product photography:1.5), (e-commerce catalog shot:1.4), (8k, photorealistic, ultra-detailed), a single, clear shot of: ${prompt}. (plain white background:1.5)`;
    const negative_prompt = "text, words, watermark, logo, people, person, model, human, hands, feet, blurry, distorted, cartoon, sketch, multiple items, two products, collage, grid, noisy background, shadows, reflections";

    const payload = {
        instances: [{ prompt: enhancedPrompt, negative_prompt }],
        parameters: { sampleCount: 1, aspectRatio, outputMimeType: "image/png" }
    };

    const result = await fetchWithRetry(IMAGEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (result.predictions && result.predictions[0]) {
        return result.predictions[0].bytesBase64Encoded;
    }
    throw new Error("API response did not contain image predictions for base product.");
}

/**
 * REWRITTEN: Professional Photoshoot Generator
 * Takes a master image and re-shoots it from different angles, ensuring product consistency.
 */
async function generateProductByCommand({ masterImage, productDescription, shotType, lightingStyle, sampleCount }) {
    if (!API_KEY) return { success: false, error: "API Key tidak ditemukan." };
    if (!masterImage) return { success: false, error: "Master image is required." };

    const totalImages = Math.max(1, Math.min(parseInt(sampleCount, 10) || 1, 8));
    const apiCalls = [];

    const systemPrompt = `
You are a professional product photographer conducting a photoshoot.
Your task is to take the provided MASTER IMAGE of a product and re-shoot it precisely according to the following brief.
**DO NOT CHANGE, ALTER, OR REPLACE THE PRODUCT.** The product in your final image must be identical to the one in the master image.
The result must be photorealistic, 8k, with professional lighting and composition.
`.trim();

    for (let i = 0; i < totalImages; i++) {
        const userPrompt = `
**Photoshoot Brief:**
- **Product:** ${productDescription}
- **Required Angle:** ${shotType}
- **Required Lighting:** ${lightingStyle}

Generate a single, photorealistic image based on this brief. This is variation ${i + 1} of ${totalImages}, so introduce a very subtle change in camera position or product orientation to make it unique, while strictly adhering to the angle and lighting brief.
`.trim();

        const payload = {
            contents: [{
                role: "user",
                parts: [
                    { text: userPrompt },
                    { inlineData: { mimeType: "image/png", data: masterImage } }
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
    }

    try {
        console.log(`[Photoshoot] Starting ${apiCalls.length} parallel image generations.`);
        const results = await Promise.allSettled(apiCalls);
        const allImages = [];
        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value.candidates?.[0]) {
                const imagePart = res.value.candidates[0].content?.parts?.find(p => p.inlineData);
                if (imagePart?.inlineData?.data) {
                    allImages.push(imagePart.inlineData.data);
                }
            }
        });

        if (allImages.length === 0) throw new Error("All generation attempts failed.");
        return { success: true, imagesBase64: allImages };
    } catch (error) {
        console.error('AI Photoshoot Error:', error);
        return { success: false, error: error.message };
    }
}


module.exports = {
    generateBaseProduct,
    generateProductByCommand,
};
