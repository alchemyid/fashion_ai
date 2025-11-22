document.addEventListener('DOMContentLoaded', () => {
    const productInput = document.getElementById('productInput');
    const productPreview = document.getElementById('productPreview');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const generateBtn = document.getElementById('generateBtn');
    const resultArea = document.getElementById('resultArea');
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('errorMessage');

    let productBase64 = null;

    // Helper: File to Base64
    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
        });
    };

    // Handle Upload
    productInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const dataUrl = await fileToBase64(file);
                productPreview.src = dataUrl;
                productPreview.style.display = 'block';
                uploadPlaceholder.style.display = 'none';
                productBase64 = dataUrl.split(',')[1];
                generateBtn.disabled = false;
            } catch (err) {
                showError('Gagal membaca file.');
            }
        }
    });

    // Handle Generate
    generateBtn.addEventListener('click', async () => {
        if (!productBase64) return;

        // Get Form Data
        const style = document.querySelector('input[name="style"]:checked').value;
        const gender = document.getElementById('genderSelect').value;

        // UI Loading
        loading.style.display = 'flex';
        errorMessage.style.display = 'none';
        generateBtn.disabled = true;

        try {
            // Invoke Backend API
            const response = await window.electron.invoke('/api/generate-stylist-outfit', {
                productBase64,
                style,
                gender
            });

            if (response.success) {
                renderResult(response.data);
            } else {
                throw new Error(response.error);
            }

        } catch (error) {
            showError(error.message);
        } finally {
            loading.style.display = 'none';
            generateBtn.disabled = false;
        }
    });

    function renderResult(data) {
        const { imageBase64, stylingAdvice } = data;
        const imageUrl = `data:image/png;base64,${imageBase64}`;

        // Simple markdown-like parser for advice
        const formattedAdvice = stylingAdvice
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        resultArea.innerHTML = `
            <div class="outfit-card">
                <img src="${imageUrl}" class="outfit-image" alt="AI Generated Outfit">
                <div class="outfit-details">
                    <span class="style-tag"><i class="fas fa-magic"></i> AI Generated</span>
                    <h3 class="font-bold text-xl mb-2">Rekomendasi Outfit</h3>
                    
                    <div class="advice-box">
                        <h4 style="font-weight: 700; margin-bottom: 5px;"><i class="fas fa-comment-dots"></i> Catatan Stylist:</h4>
                        <p>${formattedAdvice}</p>
                    </div>

                    <a href="${imageUrl}" download="outfit_mixmatch.png" class="btn-execute" style="width: 100%; text-align: center; margin-top: 1.5rem; justify-content: center; text-decoration: none;">
                        <i class="fas fa-download"></i> Download Foto
                    </a>
                </div>
            </div>
        `;
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
        setTimeout(() => { errorMessage.style.display = 'none'; }, 5000);
    }
});