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
            console.log("File input changed");
            const file = e.target.files[0];
            
            if (!file) return;

            // Validasi tipe file sederhana
            if (!file.type.startsWith('image/')) {
                showError("Harap upload file gambar (JPG/PNG).");
                return;
            }

            try {
                // Tampilkan loading sementara jika perlu (opsional, tapi image reader cepat)
                
                // Convert to Base64
                const dataUrl = await fileToBase64(file);
                console.log("File converted successfully");

                // Update UI: Show Preview, Hide Placeholder
                productPreview.src = dataUrl;
                productPreview.style.display = 'block'; // Pastikan ini 'block'
                if (uploadPlaceholder) uploadPlaceholder.style.display = 'none';

                // Simpan raw base64 (hapus prefix data:image/...)
                productBase64 = dataUrl.split(',')[1];

                // Aktifkan Tombol Generate
                generateBtn.disabled = false;
                generateBtn.classList.remove('opacity-50', 'cursor-not-allowed'); // Visual feedback if any
                console.log("Generate button enabled");

            } catch (err) {
                console.error("Error reading file:", err);
                showError('Gagal membaca file gambar. Silakan coba file lain.');
            }
            
            // Reset value agar bisa re-upload file yang sama jika user salah klik lalu ingin ulang
            // productInput.value = ''; 
        });
    } else {
        console.error("Element #productInput not found!");
    }

    // 2. Handle Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            console.log("Generate button clicked");

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
            generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sedang Memproses...';

            try {
                console.log("Invoking API: generate-stylist-outfit");
                console.log("Backend Server:", window.electronAPI?.backendServer || 'http://localhost:8000');
                
                // Panggil Backend menggunakan fetch dengan URL dinamis
                const response = await fetch(`${window.electronAPI?.backendServer || 'http://localhost:8000'}/api/generate-stylist-outfit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        productBase64,
                        style,
                        gender
                    })
                });

                console.log("Response Status:", response.status);
                console.log("Response Content-Type:", response.headers.get('content-type'));

                if (!response.ok) {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const data = await response.json();
                        throw new Error(data.error || `HTTP Error: ${response.status}`);
                    } else {
                        throw new Error(`Server Error: HTTP ${response.status} - Endpoint mungkin tidak ditemukan atau belum ter-register`);
                    }
                }

                const data = await response.json();
                console.log("API Response:", data);

                if (data.success) {
                    renderResult(data.data);
                } else {
                    throw new Error(data.error || "Gagal mendapatkan respon dari AI.");
                }

            } catch (error) {
                showError(error.message);
            } finally {
                // Reset Loading State
                loading.style.display = 'none';
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate Outfit Look';
            }
        });
    } else {
        console.error("Element #generateBtn not found!");
    }

    // Helper Render Result
    function renderResult(data) {
        const imageUrl = `data:image/png;base64,${data.imageBase64}`;
        
        // Format saran styling (simple formatting)
        let formattedAdvice = data.stylingAdvice || "Tidak ada saran khusus.";
        formattedAdvice = formattedAdvice
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