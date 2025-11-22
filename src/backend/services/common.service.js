// src/backend/services/common.service.js
const fetch = require('node-fetch');

const API_KEY = process.env.GEMINI_API_KEY;
const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;
const GEMINI_IMAGE_EDIT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${API_KEY}`;
const GEMINI_TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
const GEMINI_TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`;

/**
 * Shared helper function to fetch from Google AI APIs with retry logic.
 * Handles common errors like rate limiting (429) and server errors (503).
 */
async function fetchWithRetry(url, options, maxRetries = 5) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            
            if (response.ok) {
                return await response.json();
            }

            const errorText = await response.text();
            const status = response.status;
            
            if (status === 429 || status === 503) {
                console.warn(`API Busy (Status ${status}). Retrying... Attempt ${attempt + 1}/${maxRetries}`);
                throw new Error(`Server Busy (${status}): ${errorText}`);
            }

            if (status >= 400 && status < 500) {
                console.error(`Client Error (${status}): ${errorText}`);
                throw new Error(`API Error (${status}): ${errorText}`);
            }

            throw new Error(`API Error (${status}): ${errorText}`);

        } catch (error) {
            lastError = error;
            
            const isRetryable = error.message.includes('429') || 
                                error.message.includes('503') || 
                                error.message.includes('fetch failed') ||
                                error.code === 'ETIMEDOUT';

            if (attempt < maxRetries - 1 && isRetryable) {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.log(`Waiting ${delay.toFixed(0)}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else if (!isRetryable) {
                throw error;
            }
        }
    }
    
    console.error('Max retries reached. Failing.');
    throw lastError;
}

function cleanJsonResponse(text) {
    if (!text) return "{}";
    return text.replace(/```json\n?|```/g, '').trim();
}

module.exports = {
    API_KEY,
    IMAGEN_API_URL,
    GEMINI_IMAGE_EDIT_API_URL,
    GEMINI_TEXT_API_URL,
    GEMINI_TTS_API_URL,
    fetchWithRetry,
    cleanJsonResponse
};
