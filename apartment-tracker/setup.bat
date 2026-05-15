@echo off
setlocal

REM ===========================================================================
REM Install apartment-tracker. Double-click to run ONCE.
REM Requires Python 3.10+ (https://www.python.org/downloads/).
REM ===========================================================================

cd /d "%~dp0"

echo === Checking Python ===
REM Use py launcher (avoids Windows Store python.exe stub which shadows real Python in PATH).
py -3 --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [!] Python launcher 'py' not found.
    echo     Install Python 3.10 or newer from https://www.python.org/downloads/
    echo     During install, CHECK "Add Python to PATH" AND "py launcher".
    echo.
    pause
    exit /b 1
)

echo === Creating venv .venv ===
if not exist ".venv" (
    py -3 -m venv .venv
    if errorlevel 1 (
        echo [!] Failed to create venv. Check folder permissions.
        pause
        exit /b 1
    )
)

echo === Upgrading pip ===
".venv\Scripts\python.exe" -m pip install --upgrade pip

echo === Installing apartment-tracker and dependencies ===
".venv\Scripts\python.exe" -m pip install -e ".[dev]"
if errorlevel 1 (
    echo [!] Install failed. See errors above.
    pause
    exit /b 1
)

echo === Preparing config.yaml ===
if not exist "config.yaml" (
    copy /Y "config_examples\config.example.yaml" "config.yaml" >nul
    echo [+] config.yaml created. Edit scoring weights to your taste.
) else (
    echo [=] config.yaml already exists, leaving it.
)

echo === Preparing .env ===
if not exist ".env" (
    copy /Y "config_examples\.env.example" ".env" >nul
    echo [+] .env created. OPEN IT and fill in TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
) else (
    echo [=] .env already exists, leaving it.
)

echo === Initializing database ===
".venv\Scripts\apartment-tracker.exe" init

echo.
echo =========================================================================
echo Done.
echo.
echo Next steps:
echo   1) Create a bot: message @BotFather in Telegram, command /newbot. Copy the token.
echo   2) Get your chat_id: message @userinfobot - it will reply with your ID.
echo   3) Open .env, fill in TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
echo   4) (optional) Edit config.yaml - scoring weights.
echo   5) Run the bot: double-click run.bat.
echo =========================================================================
pause
