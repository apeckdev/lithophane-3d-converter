@echo off
setlocal

title Lithophane 3D Converter Launcher

echo =======================================
echo   Lithophane 3D Converter Launcher
echo =======================================
echo.

:: 1. Check for Node.js
echo Checking system requirements...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed.
    echo Downloading Node.js 20 LTS Installer...
    curl -# -o node-installer.msi https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
    echo.
    echo Installing Node.js... You may be prompted for Administrator permissions.
    msiexec /i node-installer.msi /passive
    
    :: Wait a few seconds for installation to finish
    timeout /t 5 >nul
    
    :: Add to current session path just in case
    set PATH=%PATH%;C:\Program Files\nodejs\
    
    node -v >nul 2>&1
    if %errorlevel% neq 0 (
        echo Setup failed to verify Node.js installation.
        echo Please try manual installation from: https://nodejs.org/en/download
        echo If it is installed, please try closing and re-opening this script.
        pause
        exit /b 1
    )
    
    echo Node.js successfully installed!
    del node-installer.msi
) else (
    echo Node.js is installed.
)
echo.

:: 2. Download and Extract the Repository
set "FOLDER_NAME=lithophane-3d-converter-main"
if not exist "%FOLDER_NAME%" (
    echo Step 1: Application folder not found. Downloading from GitHub...
    curl -# -L -o repo.zip https://github.com/apeckdev/lithophane-3d-converter/archive/refs/heads/main.zip
    
    if exist repo.zip (
        echo Extraction in progress...
        tar -xf repo.zip
        del repo.zip
        echo Repository successfully downloaded!
    ) else (
        echo Failed to download repository. Please check your internet connection.
        pause
        exit /b 1
    )
) else (
    echo Step 1: Application folder already exists. Skipping download.
)
echo.

:: Navigate into the repository folder
cd "%FOLDER_NAME%"

:: 3. Install Dependencies
if not exist "node_modules\" (
    echo Step 2: Installing application dependencies... (this may take a minute)
    call npm install
) else (
    echo Step 2: Dependencies already installed.
)
echo.

:: 4. Start the Application
echo Step 3: Launching the development server...
echo The application will open in your default browser automatically.
echo (Do not close this window to keep the app running)

:: Give the server 3 seconds to boot up before opening the default browser
start "" "http://localhost:5173/"

:: Run Vite Dev Server
call npm run dev
