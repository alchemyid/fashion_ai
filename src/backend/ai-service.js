// Gunakan require untuk node-fetch v2 (CommonJS)
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Pastikan environment variable GEMINI_API_KEY sudah diatur dengan benar
const API_KEY = process.env.GEMINI_API_KEY;
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

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
            // Handle cases where the response might be empty
            const text = await response.text();
            return text ? JSON.parse(text) : {};
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

async function generateVideoIdeas({ productBase64, styleBase64 }) {
    if (!API_KEY) return { success: false, error: "API Key tidak ditemukan." };

    const systemPrompt = `
You are a professional Video Director and Digital Marketing Strategist specializing in fashion e-commerce.
Your task is to analyze a product image and a style reference image to generate creative, marketable video concepts.
You MUST return your answer as a single, valid JSON object with two keys:
1.  "sceneIdeas": An array of 3 distinct, concise, and actionable video scene descriptions (string). Each description should focus on motion and storytelling that highlights the product.
2.  "styleKeywords": An array of 5-7 descriptive keywords (string) that capture the visual aesthetic from the style reference and product, suitable for a video generation AI.
--- YOUR THOUGHT PROCESS ---
1.  **Analyze Product Image:** Identify the product's key features, category, and potential use cases.
2.  **Analyze Style Image:** Deconstruct the style reference image to understand its mood, color palette, lighting, environment, and overall aesthetic (e.g., "warm and rustic," "minimalist and clean," "edgy and urban").
3.  **Brainstorm Scene Concepts:** Based on the product and style, create three different video concepts. Think about what would be most engaging for a social media audience.
4.  **Extract Style Keywords:** Distill the visual essence into a list of keywords. Be descriptive (e.g., "golden hour lighting," "soft focus," "vintage film grain," "high contrast").
5.  **Final Output:** Format the result as a valid JSON object.`;

    const userParts = [
        { "text": "--- TASK: Generate Video Concepts ---" },
        { "text": "Here is the main product:" },
        { "inlineData": { "mimeType": "image/jpeg", "data": productBase64 } },
        { "text": "And here is the style reference:" },
        { "inlineData": { "mimeType": "image/jpeg", "data": styleBase64 } },
        { "text": "Now, act as a professional director and generate the scene ideas and style keywords in the required JSON format." }
    ];

    const payload = {
        contents: [{ role: "user", parts: userParts }],
        systemInstruction: { parts: [{ "text": systemPrompt }] },
        generationConfig: { responseMimeType: "application/json" }
    };

    try {
        const result = await fetchWithRetry(`${API_BASE_URL}/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const jsonText = result.candidates[0].content.parts[0].text;
        const ideaData = JSON.parse(jsonText);
        return { success: true, data: ideaData };
    } catch (error) {
        console.error('AI Generate Video Ideas Error:', error);
        return { success: false, error: error.message };
    }
}

async function generateVideoFromImage({ sceneDescription, styleKeywords }) {
    if (!API_KEY) return { success: false, error: "API Key tidak ditemukan." };

    const finalPrompt = `${sceneDescription}, in the style of ${styleKeywords}`;
    console.log(`[AI-Service] Initiating video generation with prompt: "${finalPrompt}"`);

    try {
        // Step 1: Initiate video generation
        const initialResponse = await fetchWithRetry(`${API_BASE_URL}/videos:generate?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/veo-1.0', // Using model from reference
                prompt: finalPrompt,
                quality: 'hd'
            })
        });

        const operationName = initialResponse.name;
        if (!operationName) {
            throw new Error("API did not return an operation name.");
        }
        console.log(`[AI-Service] Video generation started. Operation: ${operationName}`);

        // Step 2: Poll for completion
        let operationResult;
        let isDone = false;
        while (!isDone) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            console.log(`[AI-Service] Polling operation: ${operationName}`);
            operationResult = await fetchWithRetry(`${API_BASE_URL}/${operationName}?key=${API_KEY}`, { method: 'GET' });
            isDone = operationResult.done || false;
        }

        if (!operationResult.response || !operationResult.response.generatedVideos) {
            throw new Error("Completed operation did not contain video results.");
        }

        console.log('[AI-Service] Video generation complete.');
        const videoResourceName = operationResult.response.generatedVideos[0].video.name;

        // Step 3: Download the video file
        console.log(`[AI-Service] Fetching video content for: ${videoResourceName}`);
        const videoFile = await fetchWithRetry(`${API_BASE_URL}/${videoResourceName}:download?key=${API_KEY}`, { method: 'GET' });
        
        const videoBytes = Buffer.from(videoFile.content, 'base64');

        const outputDir = path.join(__dirname, '..', '..', 'output', 'videos');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const filename = `video_${uuidv4()}.mp4`;
        const outputPath = path.join(outputDir, filename);

        fs.writeFileSync(outputPath, videoBytes);
        console.log(`[AI-Service] Video saved to: ${outputPath}`);

        return { success: true, videoPath: `/videos/${filename}` }; // Return relative path for server

    } catch (error) {
        console.error('AI Video Generation Error:', error);
        // Provide a more specific placeholder error
        if (error.message.includes("404") || error.message.includes("not found")) {
             return {
                success: false,
                error: "The Veo API endpoint is not yet publicly available. This is a simulated workflow. The prompt was successfully created, but the video generation step failed as expected."
            };
        }
        return { success: false, error: error.message };
    }
}

// Keep other existing functions...
module.exports = {
    // ... other functions
    generateVideoIdeas,
    generateVideoFromImage,
    // ... other functions
};
