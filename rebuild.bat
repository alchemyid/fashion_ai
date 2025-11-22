@echo off
REM ================================
REM Fashion AI – Build Automation
REM ================================

setlocal enabledelayedexpansion

if "%1"=="" (
    echo Usage: rebuild.bat [linux^|win^|mac]
    exit /b 1
)

echo.
echo ==============================
echo   Fashion AI Build Script
echo ==============================
echo.

REM Build Platform (Script npm sudah mencakup clean ^& obfuscate)
if /i "%1"=="linux" (
    echo ^> Building for Linux...
    call npm run build:linux
) else if /i "%1"=="win" (
    echo ^> Building for Windows...
    call npm run build:win
) else if /i "%1"=="mac" (
    echo ^> Building for macOS...
    call npm run build:mac
) else (
    echo ❌ Unknown target: %1
    exit /b 1
)

REM Logging status
if %errorlevel% equ 0 (
    for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set date=%%c-%%a-%%b)
    for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set time=%%a:%%b)
    (
        echo Build Success: %1 at !date! !time!
    ) >> build.log
    echo.
    echo ==============================
    echo   ✅ Build Completed Successfully
    echo   📁 Check folder 'dist' for results
    echo ==============================
    echo.
) else (
    echo ❌ Build Failed!
    exit /b 1
)

endlocal
