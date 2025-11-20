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

# Build Platform (Script npm sudah mencakup clean & obfuscate)
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

# Logging status
if [ $? -eq 0 ]; then
    DATE=$(date +"%Y-%m-%d %H:%M:%S")
    echo "Build Success: $TARGET at $DATE" >> build.log
    echo ""
    echo "=============================="
    echo "  ✅ Build Completed Successfully"
    echo "  📁 Check folder 'dist' for results"
    echo "=============================="
else
    echo "❌ Build Failed!"
    exit 1
fi