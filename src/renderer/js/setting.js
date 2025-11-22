// setting.js
// Membaca dan mengupdate file .env melalui preload.js

document.addEventListener('DOMContentLoaded', async function() {
    const textarea = document.getElementById('envTextarea');
    const form = document.getElementById('envForm');
    const statusMsg = document.getElementById('statusMsg');

    // Baca .env
    window.api.readEnv().then(content => {
        textarea.value = content;
    });

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const newContent = textarea.value;
        const result = await window.api.writeEnv(newContent);
        if (result.success) {
            statusMsg.textContent = 'Berhasil update .env! Meminta untuk restart...';
            statusMsg.style.display = 'block';
            statusMsg.style.color = '#48bb78';

            // Ask user to restart
            await window.api.showRestartDialog();
            
        } else {
            statusMsg.textContent = `Gagal update .env! Error: ${result.error}`;
            statusMsg.style.display = 'block';
            statusMsg.style.color = '#f56565';
        }
    });
});
