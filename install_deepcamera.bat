@echo off
:: ============================================================
:: install_deepcamera.bat — Instalador automático DeepCamera JVH
:: Hardware: Ryzen 5600X + GTX 1660 Super + Windows 11
:: Ejecutar como ADMINISTRADOR desde Windows limpio
:: ============================================================
title DeepCamera JVH — Instalador Automatico
color 0B
setlocal enabledelayedexpansion

echo.
echo  ================================================================
echo   DeepCamera JVH — Instalador Automatico v2.0
echo   Ryzen 5600X + GTX 1660 Super + Windows 11
echo   Ejecutar como ADMINISTRADOR
echo  ================================================================
echo.

:: Verificar privilegios de administrador
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Este script requiere privilegios de Administrador.
    echo         Click derecho sobre el archivo ^> "Ejecutar como administrador"
    pause
    exit /b 1
)

:: Directorio de instalacion
set INSTALL_DIR=C:\DeepCamera
set REPO_URL=https://github.com/Nahj2023/deepcamera-jvh.git
set PYTHON_VERSION=3.11.9
set NODEJS_VERSION=20
set NSSM_URL=https://nssm.cc/release/nssm-2.24.zip

echo [1/8] Verificando Winget...
winget --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Winget no encontrado. Actualiza Windows 11 desde Microsoft Store.
    pause
    exit /b 1
)
echo [OK] Winget disponible

:: ============================================================
echo.
echo [2/8] Instalando Python 3.11...
:: ============================================================
python --version 2>nul | findstr "3.11" >nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Python 3.11 ya instalado
) else (
    winget install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Fallo instalacion de Python. Intentando via descarga directa...
        :: Fallback: descarga manual
        curl -L "https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-amd64.exe" -o "%TEMP%\python_installer.exe"
        "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1
    )
    :: Actualizar PATH en sesion actual
    for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH') do set SYS_PATH=%%b
    set PATH=%PATH%;C:\Python311;C:\Python311\Scripts
)

:: ============================================================
echo.
echo [3/8] Instalando Node.js 20 LTS...
:: ============================================================
node --version 2>nul | findstr "v20" >nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Node.js 20 ya instalado
) else (
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    set PATH=%PATH%;C:\Program Files\nodejs
)

:: ============================================================
echo.
echo [4/8] Instalando Git...
:: ============================================================
git --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Git ya instalado
) else (
    winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
    set PATH=%PATH%;C:\Program Files\Git\bin
)

:: ============================================================
echo.
echo [5/8] Instalando Claude Code (npm global)...
:: ============================================================
call npm install -g @anthropic-ai/claude-code >nul 2>&1
echo [OK] Claude Code instalado (o ya estaba)

:: ============================================================
echo.
echo [6/8] Clonando/Actualizando repo DeepCamera JVH...
:: ============================================================
if exist "%INSTALL_DIR%\.git" (
    echo [OK] Repo ya existe — actualizando...
    cd /d "%INSTALL_DIR%"
    git pull origin master
) else (
    echo Clonando en %INSTALL_DIR%...
    git clone "%REPO_URL%" "%INSTALL_DIR%"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] No se pudo clonar el repo. Verifica conexion a internet y token git.
        pause
        exit /b 1
    )
)

cd /d "%INSTALL_DIR%"

:: ============================================================
echo.
echo [7/8] Configurando entorno Python (venv + dependencias)...
:: ============================================================
if not exist "venv" (
    python -m venv venv
)
call venv\Scripts\activate.bat

echo   [7a] Actualizando pip...
python -m pip install --upgrade pip --quiet

echo   [7b] Instalando PyTorch con CUDA (GTX 1660 Super - CUDA 11.8)...
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118 --quiet
if %ERRORLEVEL% neq 0 (
    echo [WARN] CUDA no disponible. Instalando PyTorch CPU...
    pip install torch torchvision --quiet
)

echo   [7c] Instalando YOLOv8, OpenCV, paho-mqtt...
pip install ultralytics opencv-python paho-mqtt python-dotenv requests --quiet

echo   [7d] Instalando face_recognition (puede tardar varios minutos)...
:: face_recognition requiere cmake y Visual C++ Build Tools
cmake --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   Instalando CMake...
    winget install -e --id Kitware.CMake --accept-source-agreements --accept-package-agreements
)
pip install face-recognition --quiet
if %ERRORLEVEL% neq 0 (
    echo [WARN] face_recognition fallo. Puedes instalarlo manualmente luego:
    echo        pip install face-recognition
    echo        (Requiere Visual C++ Build Tools: winget install Microsoft.VisualStudio.2022.BuildTools)
)

echo   [7e] Descargando modelo YOLOv8n (si no existe)...
if not exist "yolov8n.pt" (
    python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
)

:: ============================================================
echo.
echo [8/8] Instalando como servicio Windows (NSSM)...
:: ============================================================
where nssm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   Descargando NSSM...
    curl -L "%NSSM_URL%" -o "%TEMP%\nssm.zip"
    powershell -Command "Expand-Archive '%TEMP%\nssm.zip' '%TEMP%\nssm' -Force"
    copy "%TEMP%\nssm\nssm-2.24\win64\nssm.exe" "C:\Windows\System32\nssm.exe"
)

:: Crear/actualizar servicio
nssm stop DeepCameraEdge >nul 2>&1
nssm remove DeepCameraEdge confirm >nul 2>&1

nssm install DeepCameraEdge "%INSTALL_DIR%\venv\Scripts\python.exe"
nssm set DeepCameraEdge Parameters "%INSTALL_DIR%\edge_detector.py"
nssm set DeepCameraEdge AppDirectory "%INSTALL_DIR%"
nssm set DeepCameraEdge DisplayName "DeepCamera JVH Edge Detector"
nssm set DeepCameraEdge Description "Deteccion YOLO + alertas Telegram para DeepCamera JVH"
nssm set DeepCameraEdge Start SERVICE_AUTO_START
nssm set DeepCameraEdge AppStdout "%INSTALL_DIR%\edge_detector.log"
nssm set DeepCameraEdge AppStderr "%INSTALL_DIR%\edge_detector.log"
nssm set DeepCameraEdge AppRotateFiles 1
nssm set DeepCameraEdge AppRotateBytes 5242880

echo [OK] Servicio DeepCameraEdge configurado (arranque automatico)

:: ============================================================
echo.
echo  ================================================================
echo   INSTALACION COMPLETADA
echo  ================================================================
echo.
echo  Directorio: %INSTALL_DIR%
echo.
echo  PROXIMOS PASOS:
echo  1. Editar edge_config.json con:
echo     - URL de camara (rtsp://...)
echo     - API key del backend
echo     - Token y chat_id de Telegram
echo     - Agregar fotos en known_faces/
echo.
echo  2. Probar camara:
echo     cd %INSTALL_DIR% ^&^& venv\Scripts\activate ^&^& python edge_detector.py --test-camera
echo.
echo  3. Probar Telegram:
echo     python edge_detector.py --test-telegram
echo.
echo  4. Iniciar servicio:
echo     nssm start DeepCameraEdge
echo.
echo  5. Ver logs:
echo     type %INSTALL_DIR%\edge_detector.log
echo.
echo  Para uso inmediato (sin servicio): start_deepcamera.bat
echo  ================================================================
echo.
pause
