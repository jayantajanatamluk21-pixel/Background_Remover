@echo off
setlocal
cd /d "%~dp0"
title Cutout - Background Remover

echo ============================================
echo   Cutout - Background Remover
echo ============================================
echo.

REM --- 1. Check that Python is installed ---
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python was not found.
    echo Install Python 3.9 or newer from https://www.python.org/downloads/
    echo and tick "Add Python to PATH" during setup.
    echo.
    pause
    exit /b 1
)

REM --- 2. Create the virtual environment on first run ---
if not exist ".venv\Scripts\activate.bat" (
    echo Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Could not create the virtual environment.
        pause
        exit /b 1
    )
)

call ".venv\Scripts\activate.bat"

REM --- 3. Install requirements on first run (or after requirements.txt changes) ---
if not exist ".venv\.installed" goto install
for %%A in (requirements.txt) do set REQ_TIME=%%~tA
for %%A in (.venv\.installed) do set INS_TIME=%%~tA
if not "%REQ_TIME%"=="%INS_TIME%" goto install
goto start

:install
echo Installing requirements. This can take a few minutes the first time...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [ERROR] Installing requirements failed. Check your internet connection.
    pause
    exit /b 1
)
copy /y requirements.txt ".venv\.installed" >nul
echo Requirements installed.
echo.

:start
echo Starting Cutout at http://127.0.0.1:5000
echo The first cutout downloads the AI model, so it will be slow once.
echo Keep this window open while you use the app. Press Ctrl+C to stop.
echo.

REM Open the browser only once the server is actually accepting connections
start "" /min powershell -NoProfile -Command "while($true){try{$c=New-Object Net.Sockets.TcpClient('127.0.0.1',5000);$c.Close();break}catch{Start-Sleep -Milliseconds 700}}; Start-Process 'http://127.0.0.1:5000'"

python app.py

echo.
echo Server stopped.
pause
