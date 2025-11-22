document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENTS ---
    const productInput = document.getElementById('productInput');
    const productPreview = document.getElementById('productPreview');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const generateBtn = document.getElementById('generateBtn');
    const resultArea = document.getElementById('resultArea');
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('errorMessage');

    // State
    let productBase64 = null;

    // --- HELPERS ---
    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
    };

    const showError = (msg) => {
        console.error(msg);
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
        // Hide after 5 seconds
        setTimeout(() => { errorMessage.style.display = 'none'; }, 5000);
    };

    // --- EVENT LISTENERS ---

    // 1. Handle File Upload
    if (productInput) {
        productInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showError("Harap upload file gambar (JPG/PNG).");
                return;
            }

            try {
                const dataUrl = await fileToBase64(file);
                
                // Update UI
                productPreview.src = dataUrl;
                productPreview.style.display = 'block';
                if (uploadPlaceholder) uploadPlaceholder.style.display = 'none';

                // Simpan raw base64
                productBase64 = dataUrl.split(',')[1];

                // Aktifkan Tombol Generate
                generateBtn.disabled = false;
                
            } catch (err) {
                console.error("Error reading file:", err);
                showError('Gagal membaca file gambar.');
            }
        });
    }

    // 2. Handle Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            if (!productBase64) {
                showError("Silakan upload produk terlebih dahulu.");
                return;
            }

            // Ambil Data Form
            const styleElement = document.querySelector('input[name="style"]:checked');
            const style = styleElement ? styleElement.value : 'Casual Daily';
            const gender = document.getElementById('genderSelect').value;

            // UI Loading State
            loading.style.display = 'flex';
            errorMessage.style.display = 'none';
            generateBtn.disabled = true;
            
            try {
                // Menggunakan window.electron.invoke agar konsisten dengan preload.js
                const response = await window.electron.invoke('/api/generate-stylist-outfit', {
                    productBase64,
                    style,
                    gender
                });

                if (response.success) {
                    renderResult(response.data);
                } else {
                    throw new Error(response.error || "Gagal mendapatkan respon dari AI.");
                }

            } catch (error) {
                console.error("Generation Error:", error);
                showError(`Gagal memproses: ${error.message}`);
            } finally {
                loading.style.display = 'none';
                generateBtn.disabled = false;
            }
        });
    }

    // Helper Render Result
    function renderResult(data) {
        const imageUrl = `data:image/png;base64,${data.imageBase64}`;
        
        // --- PERBAIKAN: Validasi Tipe Data Advice ---
        let adviceContent = "Tidak ada saran khusus.";
        
        // Cek apakah data ada dan tipe datanya apa
        if (data.stylingAdvice) {
            if (typeof data.stylingAdvice === 'string') {
                adviceContent = data.stylingAdvice;
            } else if (Array.isArray(data.stylingAdvice)) {
                // Jika AI mengembalikan array list, gabungkan jadi string
                adviceContent = data.stylingAdvice.join('\n');
            } else if (typeof data.stylingAdvice === 'object') {
                // Jika object, coba ambil value pertama atau stringify
                adviceContent = JSON.stringify(data.stylingAdvice); 
            } else {
                // Fallback paksa ke string (misal number)
                adviceContent = String(data.stylingAdvice);
            }
        }

        // Lakukan formatting (Bold & Newline) pada String yang sudah aman
        const formattedAdvice = adviceContent
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        resultArea.innerHTML = `
            <div class="outfit-card" style="animation: slideIn 0.5s ease-out;">
                <img src="${imageUrl}" class="outfit-image" alt="AI Generated Outfit">
                <div class="outfit-details">
                    <span class="style-tag" style="background:#e2e8f0; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:600; color:#4a5568; margin-bottom:0.5rem; display:inline-block;">
                        <i class="fas fa-magic"></i> AI Generated
                    </span>
                    <h3 class="font-bold text-xl mb-2">Rekomendasi Stylist</h3>
                    
                    <div class="advice-box" style="background:#f0fff4; border:1px solid #c6f6d5; padding:1rem; border-radius:8px; margin-top:1rem; font-size:0.9rem; color:#276749;">
                        <h4 style="font-weight:700; margin-bottom:5px;"><i class="fas fa-comment-dots"></i> Catatan:</h4>
                        <p>${formattedAdvice}</p>
                    </div>

                    <a href="${imageUrl}" download="outfit_mixmatch.png" class="btn-execute" style="width:100%; text-align:center; margin-top:1.5rem; display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none;">
                        <i class="fas fa-download"></i> Download Foto
                    </a>
                </div>
            </div>
        `;
    }
});