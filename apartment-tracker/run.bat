@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\apartment-bot.exe" (
    echo [!] Bot not installed. Run setup.bat first by double-clicking it.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [!] No .env file. Run setup.bat first and fill in TELEGRAM_BOT_TOKEN.
    pause
    exit /b 1
)

echo === Starting apartment-tracker bot ===
echo (To stop: close this window or press Ctrl+C)
echo.

".venv\Scripts\apartment-bot.exe"

echo.
echo === Bot stopped ===
pause
