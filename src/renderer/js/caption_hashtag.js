document.addEventListener('DOMContentLoaded', () => {
    const platformSelect = document.getElementById('platform-select');
    const productPhotoInput = document.getElementById('product-photo');
    const modelPhotoInput = document.getElementById('model-photo');
    const keywordsInput = document.getElementById('keywords');
    const generateBtn = document.getElementById('generate-btn');
    const errorMessage = document.getElementById('error-message');
    const generatedCaption = document.getElementById('generated-caption');
    const generatedHashtags = document.getElementById('generated-hashtags');
    const productPreview = document.getElementById('product-preview');
    const modelPreview = document.getElementById('model-preview');
    const productUploadLabel = document.getElementById('product-upload-label');
    const modelUploadLabel = document.getElementById('model-upload-label');
    const resultsContainer = document.getElementById('results-container');
    const loadingOverlay = resultsContainer.querySelector('.loading-overlay');

    let productBase64 = null;
    let modelBase64 = null;

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
    };

    const handleFileInput = async (event, preview, label, type) => {
        const file = event.target.files[0];
        if (!file) return;

        preview.style.display = 'block';
        preview.src = URL.createObjectURL(file);
        label.querySelector('p').textContent = file.name;

        const base64 = await fileToBase64(file);
        if (type === 'product') {
            productBase64 = base64.split(',')[1];
        } else {
            modelBase64 = base64.split(',')[1];
        }
    };

    productPhotoInput.addEventListener('change', (e) => handleFileInput(e, productPreview, productUploadLabel, 'product'));
    modelPhotoInput.addEventListener('change', (e) => handleFileInput(e, modelPreview, modelUploadLabel, 'model'));

    generateBtn.addEventListener('click', async () => {
        const platform = platformSelect.value;
        const keywords = keywordsInput.value;

        if (!productBase64 && !modelBase64) {
            errorMessage.textContent = 'Please upload at least one image to generate content.';
            errorMessage.style.display = 'block';
            return;
        }

        loadingOverlay.style.display = 'flex';
        errorMessage.style.display = 'none';
        generatedCaption.textContent = 'Your generated caption will appear here.';
        generatedHashtags.textContent = 'Your generated hashtags will appear here.';
        generateBtn.disabled = true;

        try {
            const payload = {
                platform,
                productBase64,
                modelBase64,
                keywords,
            };
            
            const response = await window.electron.invoke('/api/generate-caption-hashtags', payload);

            if (response.success) {
                generatedCaption.textContent = response.data.caption || "No caption generated.";
                generatedHashtags.textContent = response.data.hashtags || "No hashtags generated.";
            } else {
                errorMessage.textContent = `AI Generation Error: ${response.error || 'An unknown error occurred.'}`;
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('Frontend Error:', error);
            errorMessage.textContent = `An error occurred: ${error.message}`;
            errorMessage.style.display = 'block';
        } finally {
            loadingOverlay.style.display = 'none';
            generateBtn.disabled = false;
        }
    });
});
