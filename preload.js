const { contextBridge } = require('electron');

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
            const response = await fetch(`http://localhost:5000${endpoint}`, {
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
