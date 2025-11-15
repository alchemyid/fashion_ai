// Check login
if (!localStorage.getItem('logged_in')) {
    window.location.href = 'index.html';
}

document.getElementById('app-container').innerHTML = `
    <div class="dashboard-layout">
        <aside class="sidebar">
            <h2>AI Generator</h2>
            <nav>
                <a href="dashboard.html"><i class="fas fa-home"></i> Dashboard</a>
                <a href="by_command.html" class="active"><i class="fas fa-terminal"></i> By Command</a>
                <a href="#" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</a>
            </nav>
        </aside>
        
        <main class="content">
            <h1><i class="fas fa-terminal"></i> Generate Image by Command</h1>
            
            <div class="form-card">
                <form id="commandForm">
                    <div class="form-group">
                        <label>Example Command</label>
                        <div class="example-command">
                            <strong>Example:</strong>
                            "A photorealistic portrait of an elegant young woman wearing a fashionable full-body outfit..."
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="prompt">Your Command Prompt</label>
                        <textarea id="prompt" required placeholder="Enter your detailed prompt..."></textarea>
                    </div>
                    
                    <button type="submit" class="btn-execute">
                        <i class="fas fa-magic"></i> Execute Generation
                    </button>
                </form>
                
                <div id="result" style="display:none;">
                    <h3>Generated Image:</h3>
                    <img id="generatedImage" style="max-width: 100%; border-radius: 8px;">
                </div>
                
                <div id="loading" style="display:none;">
                    <p>Generating image... Please wait.</p>
                </div>
            </div>
        </main>
    </div>
`;

document.getElementById('commandForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const prompt = document.getElementById('prompt').value;
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');

    loading.style.display = 'block';
    result.style.display = 'none';

    try {
        const response = await window.api.generateByCommand(prompt);

        if (response.success) {
            const img = document.getElementById('generatedImage');
            img.src = `data:${response.data.mimeType};base64,${response.data.imageUrl}`;
            result.style.display = 'block';
        } else {
            alert('Error: ' + response.error);
        }
    } catch (error) {
        alert('Failed to generate image: ' + error.message);
    } finally {
        loading.style.display = 'none';
    }
});

function logout() {
    localStorage.removeItem('logged_in');
    window.location.href = 'index.html';
}
