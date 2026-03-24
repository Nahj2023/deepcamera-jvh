@echo off
title DeepCamera JVH — Edge Detector v2
color 0A
echo.
echo  =============================================
echo   DeepCamera JVH — Edge Detector v2.0
echo   YOLOv8 + Face Recognition + Telegram Bot
echo  =============================================
echo.

:: Directorio base del script
cd /d "%~dp0"

:: Verificar que existe el venv
if not exist "venv\Scripts\activate.bat" (
    echo [ERROR] No se encontro el entorno virtual.
    echo         Ejecuta install_deepcamera.bat primero.
    pause
    exit /b 1
)

:: Verificar config
if not exist "edge_config.json" (
    echo [ERROR] No se encontro edge_config.json
    echo         Copia y configura el archivo de configuracion.
    pause
    exit /b 1
)

:: Activar entorno virtual
call venv\Scripts\activate.bat

echo [OK] Entorno virtual activado
echo [OK] Iniciando DeepCamera Edge Detector...
echo.
echo Presiona Ctrl+C para detener.
echo.

:: Iniciar detector
python edge_detector.py

:: Si termina con error, pausar para ver el mensaje
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] El detector termino con error %ERRORLEVEL%
    echo Revisa edge_detector.log para detalles.
    pause
)
