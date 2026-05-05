@echo off
echo Compiling watcher.exe with MinGW...
g++ -o watcher.exe watcher.cpp -lkernel32 -static-libgcc -static-libstdc++
if %ERRORLEVEL% == 0 (
    echo Build successful: watcher.exe
) else (
    echo Build FAILED
    exit /b 1
)
