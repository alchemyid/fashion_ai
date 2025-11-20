#!/bin/bash

# ================================
# Fashion AI – Build Automation
# ================================

TARGET=$1

if [ -z "$TARGET" ]; then
    echo "Usage: ./rebuild.sh [linux|win|mac]"
    exit 1
fi

echo "=============================="
echo "  Fashion AI Build Script"
echo "=============================="

# 1. Cleanup
echo "> Cleaning old build folders..."
rm -rf dist app-obf app.asar

# 2. Run Obfuscation
echo "> Running JavaScript Obfuscator..."
npm run obfuscate
if [ $? -ne 0 ]; then
    echo "❌ Obfuscation failed!"
    exit 1
fi

# 3. Prepare ASAR (optional)
echo "> Creating app.asar..."
npx asar pack app-obf app.asar
if [ $? -ne 0 ]; then
    echo "❌ Failed creating app.asar!"
    exit 1
fi

# 4. Build Platform
case $TARGET in
    linux)
        echo "> Building for Linux..."
        npm run build:linux
        ;;
    win)
        echo "> Building for Windows..."
        npm run build:win
        ;;
    mac)
        echo "> Building for macOS..."
        npm run build:mac
        ;;
    *)
        echo "❌ Unknown target: $TARGET"
        exit 1
        ;;
esac

# 5. Logging
DATE=$(date +"%Y-%m-%d %H:%M:%S")
echo "Build Finished at: $DATE" >> build.log

echo ""
echo "=============================="
echo "  ✅ Build Completed"
echo "=============================="
