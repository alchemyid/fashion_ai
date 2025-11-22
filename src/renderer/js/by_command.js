document.addEventListener('DOMContentLoaded', () => {
    loadNavbar('by_command');

    const commandForm = document.getElementById('commandForm');
    const generateButton = document.getElementById('generateButton');
    const loading = document.getElementById('loading');
    const resultContainer = document.getElementById('result');
    const resultDisplay = document.getElementById('resultDisplay');
    const errorMessage = document.getElementById('errorMessage');

    commandForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const shotType = document.getElementById('shotType').value;
        const lightingStyle = document.getElementById('lightingStyle').value;
        const sampleCount = parseInt(document.getElementById('sampleCount').value, 10);
        const prompt = document.getElementById('prompt').value;

        // UI Reset
        loading.style.display = 'block';
        resultContainer.style.display = 'none';
        errorMessage.style.display = 'none';
        resultDisplay.innerHTML = '';
        generateButton.disabled = true;
        generateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            const response = await window.electron.invoke('/api/generate-product-by-command', {
                prompt,
                shotType,
                lightingStyle,
                sampleCount
            });

            if (response.success && response.data.imagesBase64 && response.data.imagesBase64.length > 0) {
                response.data.imagesBase64.forEach((base64String, index) => {
                    const dataUrl = `data:image/png;base64,${base64String}`;
                    const item = document.createElement('div');
                    item.className = 'thumbnail-item';

                    const img = document.createElement('img');
                    img.src = dataUrl;
                    img.alt = `Generated Product ${index + 1}`;

                    const downloadBtn = document.createElement('a');
                    downloadBtn.href = dataUrl;
                    downloadBtn.download = `product-ai-${Date.now()}-${index + 1}.png`;
                    downloadBtn.className = 'download-btn';
                    downloadBtn.innerHTML = '<i class="fas fa-download"></i> Save';

                    item.appendChild(img);
                    item.appendChild(downloadBtn);
                    resultDisplay.appendChild(item);
                });
                resultContainer.style.display = 'block';
            } else {
                throw new Error(response.error || 'No images were generated. Please try a different prompt.');
            }
        } catch (error) {
            errorMessage.textContent = `Error: ${error.message}`;
            errorMessage.style.display = 'block';
        } finally {
            loading.style.display = 'none';
            generateButton.disabled = false;
            generateButton.innerHTML = '<i class="fas fa-magic"></i> Generate Product Images';
        }
    });
});
