document.addEventListener('DOMContentLoaded', () => {
    const videoForm = document.getElementById('videoForm');
    const productImageInput = document.getElementById('product-image');
    const styleImageInput = document.getElementById('style-image');
    const generateIdeasBtn = document.getElementById('generate-ideas-btn');
    const ideaSection = document.getElementById('idea-section');
    const ideaLoading = document.getElementById('idea-loading');
    const sceneIdeasContainer = document.getElementById('scene-ideas-container');
    const customSceneDescriptionInput = document.getElementById('custom-scene-description');
    const styleKeywordsInput = document.getElementById('style-keywords');
    const generateVideoBtn = document.getElementById('generate-video-btn');
    
    const generationLoading = document.getElementById('generation-loading');
    const errorMessage = document.getElementById('error-message');
    const videoResultDisplay = document.getElementById('videoResultDisplay');
    const downloadVideoBtn = document.getElementById('download-video-btn');

    const productPreview = document.getElementById('product-preview');
    const stylePreview = document.getElementById('style-preview');
    const productUploadLabel = document.getElementById('product-upload-label');
    const styleUploadLabel = document.getElementById('style-upload-label');

    let productBase64 = null;
    let styleBase64 = null;

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
            styleBase64 = base64.split(',')[1];
        }
        
        generateIdeasBtn.disabled = !(productBase64 && styleBase64);
    };

    productImageInput.addEventListener('change', (e) => handleFileInput(e, productPreview, productUploadLabel, 'product'));
    styleImageInput.addEventListener('change', (e) => handleFileInput(e, stylePreview, styleUploadLabel, 'style'));

    generateIdeasBtn.addEventListener('click', async () => {
        ideaSection.style.display = 'block';
        ideaLoading.style.display = 'flex';
        errorMessage.style.display = 'none';
        generateIdeasBtn.disabled = true;
        sceneIdeasContainer.innerHTML = ''; // Clear previous ideas

        try {
            const response = await window.electron.invoke('/api/generate-video-ideas', {
                productBase64,
                styleBase64,
            });

            if (response.success) {
                styleKeywordsInput.value = response.data.styleKeywords.join(', ');
                
                response.data.sceneIdeas.forEach((idea, index) => {
                    const ideaId = `scene-idea-${index}`;
                    const item = document.createElement('div');
                    item.className = 'scene-idea-item';
                    item.innerHTML = `
                        <input type="radio" id="${ideaId}" name="scene-idea" value="${idea}">
                        <label for="${ideaId}">${idea}</label>
                    `;
                    sceneIdeasContainer.appendChild(item);
                });
            } else {
                errorMessage.textContent = `AI Idea Generation Error: ${response.error}`;
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            errorMessage.textContent = `Error: ${error.message}`;
            errorMessage.style.display = 'block';
        } finally {
            ideaLoading.style.display = 'none';
            generateIdeasBtn.disabled = false;
        }
    });

    videoForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedSceneIdea = document.querySelector('input[name="scene-idea"]:checked');
        const finalSceneDescription = customSceneDescriptionInput.value.trim() || (selectedSceneIdea ? selectedSceneIdea.value : '');
        const finalStyleKeywords = styleKeywordsInput.value;

        if (!finalSceneDescription) {
            errorMessage.textContent = 'Please select a scene idea or write your own description.';
            errorMessage.style.display = 'block';
            return;
        }

        generationLoading.style.display = 'block';
        errorMessage.style.display = 'none';
        generateVideoBtn.disabled = true;
        downloadVideoBtn.style.display = 'none';

        try {
            // Note: We no longer send the images here, only the text prompts
            const response = await window.electron.invoke('/api/generate-video-from-image', {
                sceneDescription: finalSceneDescription,
                styleKeywords: finalStyleKeywords,
            });

            if (response.success && response.data.videoUrl) {
                const videoUrl = response.data.videoUrl;
                videoResultDisplay.innerHTML = `<video controls autoplay loop src="${videoUrl}"></video>`;
                downloadVideoBtn.href = videoUrl;
                downloadVideoBtn.style.display = 'inline-flex';
            } else {
                errorMessage.innerHTML = `<b>Video Generation Failed</b><br>${response.error || 'An unknown error occurred.'}`;
                errorMessage.style.display = 'block';
                videoResultDisplay.innerHTML = '<div><i class="fas fa-video-slash"></i><p>Video result will appear here</p></div>';
            }
        } catch (error) {
            errorMessage.textContent = `Error: ${error.message}`;
            errorMessage.style.display = 'block';
        } finally {
            generationLoading.style.display = 'none';
            generateVideoBtn.disabled = false;
        }
    });
});
