// protect.js
const obfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');
const asar = require('asar');

const SRC = path.resolve(__dirname, 'src');
const OBF = path.resolve(__dirname, 'obf');

function copyDirRecursive(srcDir, outDir) {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.readdirSync(srcDir).forEach(name => {
        const srcPath = path.join(srcDir, name);
        const outPath = path.join(outDir, name);
        if (fs.statSync(srcPath).isDirectory()) {
            copyDirRecursive(srcPath, outPath);
        } else {
            const ext = path.extname(name).toLowerCase();
            if (ext === '.js') {
                const code = fs.readFileSync(srcPath, 'utf8');
                const ob = obfuscator.obfuscate(code, {
                    compact: true,
                    controlFlowFlattening: true,
                    controlFlowFlatteningThreshold: 0.75,
                    stringArray: true,
                    stringArrayEncoding: ['base64'],
                    stringArrayThreshold: 1,
                    selfDefending: true,
                    disableConsoleOutput: true
                });
                fs.writeFileSync(outPath, ob.getObfuscatedCode(), 'utf8');
                console.log('obf:', srcPath, '→', outPath);
            } else {
                // copy other files (html, css, images, json, etc.)
                fs.copyFileSync(srcPath, outPath);
            }
        }
    });
}

// clean old obf
if (fs.existsSync(OBF)) {
    fs.rmSync(OBF, { recursive: true, force: true });
}
fs.mkdirSync(OBF);

// copy & obfuscate src -> obf
copyDirRecursive(SRC, OBF);

// if main.js and preload.js are in project root, copy them too
['main.js','preload.js','package.json'].forEach(f => {
    const srcf = path.resolve(__dirname, f);
    if (fs.existsSync(srcf)) {
        const dest = path.join(OBF, f);
        const ext = path.extname(f);
        if (ext === '.js') {
            const code = fs.readFileSync(srcf, 'utf8');
            const ob = obfuscator.obfuscate(code, {
                compact: true,
                controlFlowFlattening: true,
                stringArray: true,
                stringArrayEncoding: ['base64'],
                selfDefending: true,
            });
            fs.writeFileSync(dest, ob.getObfuscatedCode(), 'utf8');
        } else {
            fs.copyFileSync(srcf, dest);
        }
    }
});

// create app.asar
const targetAsar = path.resolve(__dirname, 'app.asar');
asar.createPackage(OBF, targetAsar).then(() => {
    console.log('✔ app.asar created at', targetAsar);
}).catch(err => {
    console.error('asar pack error', err);
});
