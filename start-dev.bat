@echo off
echo Starting Let's Restore in development mode...
echo.
echo Step 1: Starting backend server...
start "Backend" cmd /c "cd /d "%~dp0backend" && node src/server.js"

timeout /t 2 /nobreak > nul

echo Step 2: Starting frontend dev server...
start "Frontend" cmd /c "cd /d "%~dp0frontend" && npm run dev"

timeout /t 4 /nobreak > nul

echo Step 3: Launching Electron...
cd /d "%~dp0electron"
set NODE_ENV=development
npx electron .

echo Done.
