document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENTS ---
    const videoInput = document.getElementById('videoInput');
    const videoListContainer = document.getElementById('videoListContainer');
    const voiceInput = document.getElementById('voiceInput');
    const voiceFileName = document.getElementById('voiceFileName');
    const backsoundInput = document.getElementById('backsoundInput');
    const backsoundFileName = document.getElementById('backsoundFileName');
    // HAPUS: const backsoundToggle = document.getElementById('backsoundToggle');
    const backsoundUploadContainer = document.getElementById('backsoundUploadContainer');
    const processButton = document.getElementById('processButton');
    const joinVideoForm = document.getElementById('joinVideoForm');

    const loading = document.getElementById('loading');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const errorMessage = document.getElementById('errorMessage');
    const videoResultDisplay = document.getElementById('videoResultDisplay');
    const downloadBtn = document.getElementById('downloadBtn');

    // --- STATE ---
    let videoFiles = []; // Array untuk menyimpan file video sesuai urutan
    let voiceFile = null;
    let backsoundFile = null;

    // --- FUNCTIONS ---

    // Update tampilan list video
    function updateVideoList() {
        videoListContainer.innerHTML = '';

        if (videoFiles.length === 0) {
            videoListContainer.innerHTML = '<p class="empty-state">Belum ada video yang dipilih.</p>';
            return;
        }

        videoFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'video-list-item';
            item.innerHTML = `
                <div class="file-info">
                    <span class="file-order">#${index + 1}</span>
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                </div>
                <button type="button" class="remove-btn" data-index="${index}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            videoListContainer.appendChild(item);
        });

        // Add event listeners for remove buttons
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                videoFiles.splice(idx, 1);
                updateVideoList();
                checkProcessButtonState();
            });
        });
    }

    function checkProcessButtonState() {
        // Minimal 1 video harus ada
        const hasVideo = videoFiles.length > 0;
        processButton.disabled = !hasVideo;
    }

    // Helper untuk membaca file sebagai Base64
    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]); // Ambil data setelah koma
            reader.onerror = (error) => reject(error);
        });
    };

    // --- EVENT LISTENERS ---

    // 1. Video Input
    videoInput.addEventListener('change', (e) => {
        const newFiles = Array.from(e.target.files);

        // Validasi ekstensi mp4
        const validFiles = newFiles.filter(f => f.type === 'video/mp4' || f.name.toLowerCase().endsWith('.mp4'));

        if (newFiles.length !== validFiles.length) {
            alert('Beberapa file diabaikan karena bukan format .mp4');
        }

        videoFiles = [...videoFiles, ...validFiles];
        updateVideoList();
        checkProcessButtonState();

        // Reset input agar bisa pilih file yang sama lagi jika perlu
        videoInput.value = '';
    });

    // 2. Voice Input
    voiceInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            voiceFile = file;
            voiceFileName.textContent = file.name;
            voiceFileName.classList.add('file-selected');
        }
    });

    // 3. Backsound Input (Tanpa Toggle)
    backsoundInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            backsoundFile = file;
            backsoundFileName.textContent = file.name;
            backsoundFileName.classList.add('file-selected');
        }
    });

    // 4. Process Form
    joinVideoForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (videoFiles.length === 0) {
            errorMessage.textContent = 'Mohon upload minimal satu video.';
            errorMessage.style.display = 'block';
            return;
        }

        // UI Updates
        loading.style.display = 'block';
        errorMessage.style.display = 'none';
        videoResultDisplay.innerHTML = '<div class="placeholder-state"><i class="fas fa-film"></i><p>Sedang memproses...</p></div>';
        downloadBtn.style.display = 'none';
        processButton.disabled = true;

        // Simulate Upload Progress
        let progress = 0;
        const interval = setInterval(() => {
            progress += 5;
            if (progress > 90) clearInterval(interval);
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${progress}%`;
        }, 200);

        try {
            // Persiapkan Data
            const videoPayloads = await Promise.all(videoFiles.map(async (file) => ({
                name: file.name,
                data: await fileToBase64(file)
            })));

            let voicePayload = null;
            if (voiceFile) {
                voicePayload = {
                    name: voiceFile.name,
                    data: await fileToBase64(voiceFile)
                };
            }

            let backsoundPayload = null;
            // Logic baru: Jika ada file backsound, maka otomatis digunakan
            if (backsoundFile) {
                backsoundPayload = {
                    name: backsoundFile.name,
                    data: await fileToBase64(backsoundFile)
                };
            }

            // Kirim ke Backend
            const payload = {
                videos: videoPayloads,
                voice: voicePayload,
                backsound: backsoundPayload,
                useBacksound: !!backsoundFile // Otomatis true jika file ada
            };

            // Panggil API Backend
            const response = await window.electron.invoke('/api/join-video', payload);

            clearInterval(interval);
            progressBar.style.width = '100%';
            progressText.textContent = '100%';

            if (response.success) {
                const videoSrc = `data:video/mp4;base64,${response.data.videoBase64}`;

                videoResultDisplay.innerHTML = `
                    <video controls autoplay>
                        <source src="${videoSrc}" type="video/mp4">
                        Browser Anda tidak mendukung tag video.
                    </video>
                `;

                downloadBtn.href = videoSrc;
                downloadBtn.download = 'joined_video_output.mp4';
                downloadBtn.style.display = 'inline-flex';
            } else {
                throw new Error(response.error || 'Gagal memproses video.');
            }

        } catch (err) {
            clearInterval(interval);
            progressBar.style.width = '0%';
            errorMessage.textContent = 'Terjadi kesalahan: ' + err.message;
            errorMessage.style.display = 'block';
            console.error(err);
        } finally {
            loading.style.display = 'none';
            processButton.disabled = false;
        }
    });
});