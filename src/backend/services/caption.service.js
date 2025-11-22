// src/backend/services/caption.service.js
const { API_KEY, GEMINI_TEXT_API_URL, fetchWithRetry } = require('./common.service');

/**
 * Generates a caption and hashtags for a given platform and assets.
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

module.exports = {
    generateCaptionAndHashtags
};
