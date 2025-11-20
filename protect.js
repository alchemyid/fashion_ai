// protect.js
const obfuscator = require('javascript-obfuscator');
const fs = require('fs-extra');
const path = require('path');

const SOURCE_DIR = __dirname;
const DEST_DIR = path.join(__dirname, 'app_build');

// Konfigurasi Obfuscator
const obfOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    splitStrings: true,
    selfDefending: true,
    disableConsoleOutput: true,
    deadCodeInjection: true,
    ignoreRequireImports: true,
    reservedStrings: ['require', 'exports', 'module', 'electron', 'ipcMain', 'ipcRenderer', 'backendServer']
};

// Daftar file/folder yang di-ignore
const IGNORE_LIST = [
    '.git', '.idea', '.vscode', 'node_modules', 'dist', 'app_build', 'obf', 'app.asar', 'output',
    '.env', '.env.example', '.gitignore', 'protect.js', 'rebuild.sh', 'build.log',
    'package-lock.json', 'README.md', 'obf.json'
];

async function protect() {
    console.log(`Build started... Output: ${DEST_DIR}`);

    // 1. Bersihkan folder tujuan
    await fs.emptyDir(DEST_DIR);

    // 2. Copy file satu per satu (Looping Manual)
    const allFiles = await fs.readdir(SOURCE_DIR);

    for (const file of allFiles) {
        if (IGNORE_LIST.includes(file)) continue;
        if (path.resolve(SOURCE_DIR, file) === DEST_DIR) continue;

        // SKIP package.json (Kita proses manual nanti agar "clean")
        if (file === 'package.json') continue;

        // SKIP JS root (diproses manual nanti)
        if (file === 'main.js' || file === 'preload.js') continue;

        await fs.copy(path.join(SOURCE_DIR, file), path.join(DEST_DIR, file));
    }

    console.log('✔ Static files copied');

    // 3. Proses Obfuscation src
    const srcPath = path.join(DEST_DIR, 'src');
    if (fs.existsSync(srcPath)) {
        await processDirectory(srcPath);
    }

    // 4. Obfuscation main.js & preload.js
    await obfuscateFile('main.js', path.join(SOURCE_DIR, 'main.js'), path.join(DEST_DIR, 'main.js'));
    await obfuscateFile('preload.js', path.join(SOURCE_DIR, 'preload.js'), path.join(DEST_DIR, 'preload.js'));

    // 5. BUAT package.json BERSIH (Tanpa config "build")
    await createCleanPackageJson();

    console.log('✔ Obfuscation & Cleanup complete.');
}

async function createCleanPackageJson() {
    const pkgPath = path.join(SOURCE_DIR, 'package.json');
    const pkgData = await fs.readJson(pkgPath);

    // Hapus bagian development
    delete pkgData.build;
    delete pkgData.scripts;
    delete pkgData.devDependencies;

    // PASTIKAN AUTHOR ADA DAN MEMILIKI FORMAT EMAIL
    // Electron Builder butuh ini untuk build .deb
    pkgData.author = "Fashion AI Team <admin@fashionai.com>";

    // Tulis file baru
    await fs.writeJson(path.join(DEST_DIR, 'package.json'), pkgData, { spaces: 2 });
    console.log('✔ Clean package.json created with Author info');
}

async function processDirectory(dir) {
    const files = await fs.readdir(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            await processDirectory(fullPath);
        } else if (file.endsWith('.js')) {
            const code = await fs.readFile(fullPath, 'utf8');
            try {
                const obfuscated = obfuscator.obfuscate(code, obfOptions).getObfuscatedCode();
                await fs.writeFile(fullPath, obfuscated);
                console.log(`  - Obfuscated: ${file}`);
            } catch (e) {
                console.error(`  ! Failed to obfuscate ${file}:`, e.message);
            }
        }
    }
}

async function obfuscateFile(name, srcPath, destPath) {
    if (fs.existsSync(srcPath)) {
        const code = await fs.readFile(srcPath, 'utf8');
        const obfuscated = obfuscator.obfuscate(code, obfOptions).getObfuscatedCode();
        await fs.writeFile(destPath, obfuscated);
        console.log(`  - Obfuscated Root: ${name}`);
    }
}

protect().catch(err => {
    console.error('❌ Build Error:', err);
    process.exit(1);
});