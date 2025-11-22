const { contextBridge, ipcRenderer } = require('electron');

const API_PORT = process.env.API_PORT || 8000;
const API_BASE_URL = `http://localhost:${API_PORT}`;

// Expose backend server configuration FIRST
// Note: BACKEND_SERVER in .env would override the API_PORT for this specific value.
contextBridge.exposeInMainWorld('electronAPI', {
    backendServer: process.env.BACKEND_SERVER || API_BASE_URL,
    apiBaseUrl: API_BASE_URL
});

// API untuk .env
contextBridge.exposeInMainWorld('api', {
    readEnv: () => ipcRenderer.invoke('read-env'),
    writeEnv: (content) => ipcRenderer.invoke('write-env', content),
    showRestartDialog: () => ipcRenderer.invoke('show-restart-dialog')
});

// Expose a secure API for the renderer process
contextBridge.exposeInMainWorld('electron', {
    /**
     * Generic fetch handler for all API calls to the local server.
     * @param {string} endpoint - The API endpoint (e.g., '/api/generate-by-command').
     * @param {object} body - The JSON body for the POST request.
     * @returns {Promise<object>} - The JSON response from the server.
     */

    invoke: async (endpoint, body) => {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            // Check if the response is JSON before trying to parse it
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                // If not JSON, it's likely an HTML error page from the server
                const errorText = await response.text();
                console.error("Server returned non-JSON response:", errorText);
                throw new Error(`Server Error: Received HTML instead of JSON. Status: ${response.status}`);
            }
        } catch (error) {
            console.error(`API call to ${endpoint} failed:`, error);
            // Re-throw a more user-friendly error
            throw new Error(`Failed to communicate with the backend service. ${error.message}`);
        }
    },

    // Specific function for the new feature for convenience
    generateCaptionAndHashtags: async (data) => {
        return contextBridge.invoke('/api/generate-caption-hashtags', data);
    }
});