// src/backend/services/tshirt.service.js
const { API_KEY, GEMINI_IMAGE_EDIT_API_URL, fetchWithRetry } = require('./common.service');

/**
 * TSHIRT CREATOR: Generate Photoshoot
 * Generates 6 or 12 photorealistic images of a model wearing the provided t-shirt designs.
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
        console.log(`[Tshirt Service] Starting ${apiCalls.length} parallel API calls for theme: ${theme}`);
        
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
        
        console.log(`[Tshirt Service] Successfully generated ${generatedImages.length} images.`);
        return { success: true, images: generatedImages };

    } catch (error) {
        console.error('AI Tshirt Generator Error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    generateTshirtPhotos
};
