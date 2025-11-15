const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
    generateByCommand: async (prompt) => {
        const response = await fetch('http://localhost:5000/api/generate-by-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        return await response.json();
    }
});
