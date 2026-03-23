# DeepCamera JVH — Manual de Instalación y Configuración

**Versión:** 1.0.0
**Fecha:** 2026-03-23
**Autor:** JVH Soporte SpA
**Repositorio:** https://github.com/Nahj2023/deepcamera-jvh

---

## Tabla de Contenidos

1. [Visión General y Arquitectura](#1-visión-general-y-arquitectura)
2. [Requisitos Previos](#2-requisitos-previos)
3. [Preparación del Entorno](#3-preparación-del-entorno)
4. [Instalación de la Base de Datos](#4-instalación-de-la-base-de-datos)
5. [Despliegue del Código](#5-despliegue-del-código)
6. [Configuración de la Aplicación](#6-configuración-de-la-aplicación)
7. [Configuración del Servidor Web](#7-configuración-del-servidor-web)
8. [Ejecución y Verificación](#8-ejecución-y-verificación)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Visión General y Arquitectura

DeepCamera JVH es un sistema de vigilancia con inteligencia artificial distribuido en tres capas:

```
┌─────────────────────────────────────────────────────────────────┐
│                        ARQUITECTURA                             │
│                                                                 │
│  ┌──────────────────┐       HTTP POST        ┌───────────────┐ │
│  │  EDGE AI NODE    │ ──────────────────────▶ │   BACKEND     │ │
│  │  (Ryzen + GPU)   │                         │   (cPanel)    │ │
│  │                  │       MQTT (fallback)   │               │ │
│  │ • YOLOv8n        │ ──────────────────────▶ │ • Express     │ │
│  │ • OpenCV         │                         │ • sql.js      │ │
│  │ • paho-mqtt      │       Heartbeat/30s     │ • MQTT sub    │ │
│  │ • Python 3.11    │ ──────────────────────▶ │               │ │
│  └──────────────────┘                         └───────┬───────┘ │
│                                                       │         │
│  ┌──────────────────┐                                 │ SQLite  │
│  │   CÁMARA IP      │  RTSP Stream                    ▼         │
│  │  Sonoff / Tapo   │ ──────────▶ Edge Node   ┌───────────────┐ │
│  │  192.168.x.x     │                         │  deepcamera   │ │
│  └──────────────────┘                         │    .db        │ │
│                                               └───────────────┘ │
│  ┌──────────────────┐       HTTPS             ┌───────────────┐ │
│  │   NAVEGADOR      │ ◀────────────────────── │   FRONTEND    │ │
│  │   Dashboard      │                         │   (Apache)    │ │
│  └──────────────────┘                         └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Componentes

| Componente | Tecnología | Ubicación |
|---|---|---|
| Edge AI Detector | Python 3.11 + YOLOv8n + OpenCV + CUDA | PC local (Windows) |
| Backend API | Node.js 24 + Express + sql.js | cPanel Passenger |
| Base de datos | SQLite via sql.js (wasm) | cPanel `/deepcamera/data/` |
| Frontend | HTML/CSS/JS Vanilla (ES Modules) | Apache `/public_html/deepcamera/` |
| Broker MQTT | HiveMQ Public (fallback) | `broker.hivemq.com:1883` |
| Cámara | RTSP (Sonoff / Tapo / Reolink) | Red local |

### Flujo de datos

1. La cámara IP transmite video vía RTSP a la red local
2. El Edge AI Node captura el stream con OpenCV y ejecuta inferencia YOLOv8n en GPU
3. Cada 5 segundos publica los resultados (JSON + thumbnail JPEG base64) via **HTTP POST** al backend en cPanel
4. El backend almacena los eventos en SQLite y los expone via API REST con JWT
5. El dashboard frontend hace polling cada 5 segundos a `/api/events/latest` y muestra los thumbnails en tiempo real

---

## 2. Requisitos Previos

### 2.1 Edge AI Node (PC Local — Windows)

#### Hardware mínimo

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | Intel i5 8ª gen / Ryzen 5 | Ryzen 5 5600X o superior |
| RAM | 8 GB | 16 GB |
| GPU | NVIDIA GTX 1060 6GB (CUDA) | GTX 1660 Super / RTX 3060 |
| Disco | 5 GB libres | 20 GB SSD |
| Red | 10 Mbps LAN | 100 Mbps LAN |

> ⚠️ **Sin GPU NVIDIA:** La inferencia YOLOv8 puede correr en CPU, pero es ~10x más lenta. Usar `--cpu` al ejecutar.

#### Software requerido (Edge)

- **Windows 10/11** (64-bit)
- **Python 3.11.x** — https://www.python.org/downloads/
- **CUDA Toolkit 12.x** — https://developer.nvidia.com/cuda-downloads *(solo si tienes GPU NVIDIA)*
- **cuDNN 8.x** — https://developer.nvidia.com/cudnn *(requerido para CUDA)*
- **Git** — https://git-scm.com/

Verificar instalaciones:
```bash
python --version        # Python 3.11.x
nvcc --version          # CUDA 12.x (si aplica)
git --version           # git 2.x
```

### 2.2 Servidor Backend (cPanel Hosting)

#### Requerimientos cPanel

| Recurso | Mínimo |
|---|---|
| Node.js | 24.x (via Application Manager) |
| RAM disponible | 256 MB |
| Espacio en disco | 500 MB |
| PHP | No requerido |
| SSL | Recomendado (Let's Encrypt via cPanel) |

#### Software disponible en cPanel

- Node.js 24 en `/opt/alt/alt-nodejs24/root/usr/bin/`
- SQLite3 CLI en `/bin/sqlite3`
- Apache (sirve archivos estáticos desde `public_html/`)
- Passenger (ejecuta la app Node.js)

### 2.3 Cámara IP

- Protocolo **RTSP** habilitado
- Accesible desde el Edge Node por red local o VPN
- Formatos compatibles probados:

| Marca | URL RTSP |
|---|---|
| Sonoff GK-200MP2-B | `rtsp://rtsp:PASSWORD@IP:554/av_stream/ch0` |
| Tapo C310 | `rtsp://admin:PASSWORD@IP:554/stream1` |
| Reolink RLC-510A | `rtsp://admin:PASSWORD@IP:554//h264Preview_01_main` |
| Hikvision | `rtsp://admin:PASSWORD@IP:554/Streaming/Channels/101` |

---

## 3. Preparación del Entorno

### 3.1 Edge AI Node (Windows)

#### Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/Nahj2023/deepcamera-jvh.git C:\DeepCamera
cd C:\DeepCamera
```

#### Paso 2 — Crear entorno virtual Python

```bash
python -m venv venv
venv\Scripts\activate
```

#### Paso 3 — Instalar dependencias Python

**Con GPU NVIDIA (CUDA):**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install ultralytics opencv-python paho-mqtt
```

**Sin GPU (CPU only):**
```bash
pip install torch torchvision torchaudio
pip install ultralytics opencv-python paho-mqtt
```

#### Paso 4 — Verificar instalación

```bash
python -c "import torch; print('CUDA:', torch.cuda.is_available())"
python -c "import cv2; print('OpenCV:', cv2.__version__)"
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt'); print('YOLO OK')"
```

Salida esperada:
```
CUDA: True
OpenCV: 4.x.x
YOLO OK (descarga yolov8n.pt ~6MB en primer uso)
```

#### Paso 5 — Verificar stream de cámara

```bash
python -c "
import cv2
url = 'rtsp://rtsp:PASSWORD@192.168.0.x:554/av_stream/ch0'
cap = cv2.VideoCapture(url)
print('Stream OK' if cap.isOpened() else 'ERROR: no abre')
cap.release()
"
```

### 3.2 Servidor cPanel

#### Paso 1 — Acceder a Application Manager

1. Ingresar a cPanel → **Setup Node.js App**
2. Crear nueva aplicación:
   - **Node.js version:** 24.x
   - **Application mode:** Production
   - **Application root:** `deepcamera`
   - **Application URL:** `https://tudominio.cl/deepcamera` (o subdominio)
   - **Application startup file:** `server.js`
3. Guardar y anotar la ruta generada

#### Paso 2 — Subir el código al servidor

**Opción A — via File Manager:**
1. Comprimir el proyecto: excluir `node_modules/`, `data/`, `*.zip`
2. Subir el ZIP a `~/deepcamera/`
3. Extraer en el mismo directorio

**Opción B — via SSH/SCP:**
```bash
scp -r ./deepcamera-jvh/* usuario@servidor:~/deepcamera/
```

#### Paso 3 — Instalar dependencias Node.js

```bash
# En el Terminal de cPanel
cd ~/deepcamera
/opt/alt/alt-nodejs24/root/usr/bin/npm install
```

Salida esperada:
```
added 247 packages, and audited 248 packages in 15s
found 0 vulnerabilities
```

#### Paso 4 — Copiar frontend a public_html

```bash
mkdir -p ~/public_html/deepcamera/modules/detections
cp -r ~/deepcamera/frontend/* ~/public_html/deepcamera/
```

---

## 4. Instalación de la Base de Datos

DeepCamera JVH usa **SQLite via sql.js** (WebAssembly). No requiere un servidor de base de datos externo. La DB se crea automáticamente al iniciar el servidor.

### 4.1 Inicialización automática

Al arrancar `server.js`, el módulo `init.js` ejecuta automáticamente:

```sql
-- Tablas creadas automáticamente por init.js
CREATE TABLE IF NOT EXISTS dc_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dc_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    detections TEXT NOT NULL,  -- JSON array
    counts TEXT NOT NULL,       -- JSON object
    total INTEGER DEFAULT 0,
    thumbnail TEXT,             -- JPEG base64
    stats TEXT,                 -- JSON object
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dc_edge_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cameras TEXT,
    status TEXT DEFAULT 'online',
    last_seen TEXT DEFAULT (datetime('now'))
);

-- + dc_customers, dc_cameras, dc_alerts, dc_test_cameras, dc_test_alerts
```

El usuario administrador también se crea automáticamente:
- **Usuario:** `admin`
- **Contraseña:** `JVHadmin2026` *(cambiar en producción)*
- **Rol:** `superadmin`

### 4.2 Ubicación del archivo de base de datos

```
~/deepcamera/data/deepcamera.db
```

### 4.3 Verificar tablas (cPanel Terminal)

```bash
sqlite3 ~/deepcamera/data/deepcamera.db ".tables"
```

Salida esperada:
```
dc_alerts        dc_customers     dc_events        dc_test_cameras
dc_cameras       dc_edge_status   dc_test_alerts   dc_users
```

### 4.4 Respaldar la base de datos

```bash
cp ~/deepcamera/data/deepcamera.db ~/deepcamera/data/deepcamera_$(date +%Y%m%d).db
```

### 4.5 Restaurar la base de datos

```bash
cp ~/deepcamera/data/deepcamera_20260323.db ~/deepcamera/data/deepcamera.db
touch ~/deepcamera/tmp/restart.txt
```

---

## 5. Despliegue del Código

### 5.1 Estructura de directorios

```
/home2/USUARIO/
├── deepcamera/                    ← App Node.js (Passenger)
│   ├── server.js                  ← Entry point
│   ├── init.js                    ← DB init + schema
│   ├── authHandler.js
│   ├── cameraHandler.js
│   ├── customerHandler.js
│   ├── alertHandler.js
│   ├── detectionHandler.js
│   ├── db/
│   │   └── sqlite-compat.js       ← Wrapper sql.js
│   ├── frontend/                  ← Fuente (no servido por Apache)
│   ├── data/
│   │   └── deepcamera.db          ← SQLite DB
│   ├── node_modules/
│   ├── package.json
│   └── tmp/
│       └── restart.txt            ← Trigger restart Passenger
│
└── public_html/
    └── deepcamera/                ← Archivos estáticos (Apache)
        ├── dashboard.html
        ├── login.html
        ├── auth.js
        ├── styles.css
        └── modules/
            ├── detections/
            │   ├── index.html
            │   └── auth.js
            ├── alerts/
            ├── cameras/
            ├── customers/
            └── reports/

C:\DeepCamera\                     ← Edge AI Node (Windows)
├── edge_detector.py
├── start_deepcamera.bat
├── yolov8n.pt
├── venv/
└── test_edge.py
```

### 5.2 Permisos recomendados

```bash
# En cPanel Terminal
chmod 755 ~/deepcamera/
chmod 644 ~/deepcamera/*.js
chmod 755 ~/deepcamera/data/
chmod 644 ~/deepcamera/data/deepcamera.db
chmod -R 755 ~/public_html/deepcamera/
chmod 644 ~/public_html/deepcamera/*.html
chmod 644 ~/public_html/deepcamera/*.js
chmod 644 ~/public_html/deepcamera/*.css
```

### 5.3 Actualizar frontend desde GitHub

```bash
U=https://raw.githubusercontent.com/Nahj2023/deepcamera-jvh/master/frontend
curl -s $U/dashboard.html -o ~/public_html/deepcamera/dashboard.html
curl -s $U/auth.js -o ~/public_html/deepcamera/auth.js
curl -s $U/styles.css -o ~/public_html/deepcamera/styles.css
mkdir -p ~/public_html/deepcamera/modules/detections
curl -s $U/modules/detections/index.html -o ~/public_html/deepcamera/modules/detections/index.html
cp ~/public_html/deepcamera/auth.js ~/public_html/deepcamera/modules/detections/auth.js
```

---

## 6. Configuración de la Aplicación

### 6.1 Variables de entorno — Backend (cPanel)

Crear o editar `~/deepcamera/.env`:

```env
# ─── Servidor ──────────────────────────────────────
PORT=3100                          # Puerto interno (Passenger lo ignora, usa el suyo)
NODE_ENV=production

# ─── Seguridad ─────────────────────────────────────
JWT_SECRET=CAMBIAR_POR_STRING_ALEATORIO_64_CHARS
EDGE_API_KEY=DC-EDGE-2026-JVH      # Clave que usa el edge_detector para autenticarse

# ─── Base de datos ──────────────────────────────────
DB_PATH=./data/deepcamera.db       # Ruta relativa al directorio de la app

# ─── MQTT (opcional) ────────────────────────────────
MQTT_HOST=broker.hivemq.com
MQTT_PORT=1883
MQTT_PROTOCOL=mqtt

# ─── Admin inicial ──────────────────────────────────
# El hash en init.js es para: JVHadmin2026
# Para cambiar: generar nuevo hash y actualizar init.js
```

> ⚠️ **Seguridad:** Cambiar `JWT_SECRET` y `EDGE_API_KEY` en producción. Nunca commitear `.env` al repositorio.

### 6.2 Parámetros críticos explicados

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `JWT_SECRET` | Firma los tokens JWT de autenticación. Si cambia, todos los tokens existentes se invalidan | `dev_secret_key_change_in_production` |
| `EDGE_API_KEY` | Header `x-edge-key` que debe enviar el edge detector para autenticarse en `/api/events/ingest` | `DC-EDGE-2026-JVH` |
| `DB_PATH` | Ruta al archivo SQLite. Si no existe el directorio `data/`, se crea automáticamente | `./data/deepcamera.db` |
| `MQTT_HOST` | Broker MQTT para redundancia. HiveMQ público es gratuito pero inestable | `broker.hivemq.com` |

### 6.3 Configuración del Edge Detector (Windows)

Editar directamente en `C:\DeepCamera\edge_detector.py`, sección de constantes:

```python
# ─── Configuración MQTT (fallback) ────────────────────────────────────────────
MQTT_BROKER    = "broker.hivemq.com"
MQTT_PORT      = 1883
MQTT_TOPIC     = "deepcamera/jvh/detections"
MQTT_ALIVE     = "deepcamera/jvh/alive"
MQTT_CLIENT_ID = "deepcamera-edge-ryzen"   # ← Único por instalación

# ─── Configuración HTTP (transporte principal) ────────────────────────────────
HTTP_BASE_URL  = "https://tudominio.cl/deepcamera"  # ← URL de tu backend
EDGE_API_KEY   = "DC-EDGE-2026-JVH"                 # ← Debe coincidir con backend

# ─── Configuración de detección ───────────────────────────────────────────────
MODEL_PATH    = "yolov8n.pt"   # yolov8s.pt = más preciso, más lento
CONFIDENCE    = 0.45           # Umbral mínimo de confianza (0.0 - 1.0)
DEVICE        = "cuda"         # "cuda" o "cpu"
FRAME_SKIP    = 3              # Procesar 1 de cada 3 frames (reduce carga GPU)
PUBLISH_EVERY = 5              # Publicar resultados cada N segundos

# Clases COCO detectadas (None = todas las 80 clases)
CLASSES_OF_INTEREST = [0, 1, 2, 3, 5, 7, 14, 15, 16]
# 0=person, 1=bicycle, 2=car, 3=motorcycle, 5=bus, 7=truck, 14=bird, 15=cat, 16=dog
```

### 6.4 Configuración del .bat de arranque (Windows)

El archivo `C:\DeepCamera\start_deepcamera.bat` contiene la URL y credenciales de cámara:

```bat
venv\Scripts\python.exe -u edge_detector.py ^
    --camera rtsp://rtsp:PASSWORD@192.168.0.x:554/av_stream/ch0 ^
    --camera-id CAM01
```

Para múltiples cámaras, agregar más flags `--camera` y `--camera-id`:

```bat
venv\Scripts\python.exe -u edge_detector.py ^
    --camera rtsp://rtsp:PASS@192.168.0.135:554/av_stream/ch0 --camera-id CAM01 ^
    --camera rtsp://admin:PASS@192.168.0.136:554/stream1 --camera-id CAM02
```

---

## 7. Configuración del Servidor Web

### 7.1 Passenger (Node.js) en cPanel

cPanel gestiona Passenger automáticamente. El archivo de configuración generado se encuentra en:

```
~/.htaccess  (o en la configuración de la app Node.js en cPanel)
```

El `.htaccess` en `~/deepcamera/` (gestionado por cPanel):

```apache
PassengerNodejs /opt/alt/alt-nodejs24/root/usr/bin/node
PassengerAppRoot /home2/USUARIO/deepcamera
PassengerBaseURI /deepcamera
PassengerStartupFile server.js
```

### 7.2 Apache — archivos estáticos (public_html)

El `.htaccess` en `~/public_html/deepcamera/`:

```apache
# Redirigir raíz a login
DirectoryIndex login.html

# Headers de seguridad
Header set X-Content-Type-Options "nosniff"
Header set X-Frame-Options "SAMEORIGIN"

# Cache para assets estáticos
<FilesMatch "\.(css|js)$">
    Header set Cache-Control "max-age=3600"
</FilesMatch>

# No cachear HTML
<FilesMatch "\.html$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
</FilesMatch>
```

### 7.3 SSL/HTTPS

1. En cPanel → **SSL/TLS** → **Let's Encrypt**
2. Generar certificado para tu dominio
3. Activar **Force HTTPS Redirect** en cPanel

El edge detector ya usa `https://` en `HTTP_BASE_URL`. No requiere configuración adicional.

### 7.4 Subdomain (configuración alternativa)

Si usas `deepcamera.tudominio.cl` en lugar de `tudominio.cl/deepcamera`:

1. cPanel → **Subdomains** → crear `deepcamera.tudominio.cl` apuntando a `/public_html/deepcamera`
2. Crear una app Node.js separada con Application URL = `deepcamera.tudominio.cl`
3. Actualizar `HTTP_BASE_URL` en `edge_detector.py`:
   ```python
   HTTP_BASE_URL = "https://deepcamera.tudominio.cl"
   ```

---

## 8. Ejecución y Verificación

### 8.1 Iniciar el Backend (cPanel)

```bash
# Restart Passenger (aplica cambios de código)
touch ~/deepcamera/tmp/restart.txt
```

Verificar que arrancó:
```bash
curl -s https://tudominio.cl/deepcamera/api/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "db": "sqlite-sqljs",
  "mqtt": "connected",
  "edge": { "status": "unknown", "last_seen": null }
}
```

### 8.2 Iniciar el Edge Detector (Windows)

**Opción 1 — Doble clic:**
```
C:\DeepCamera\start_deepcamera.bat
```

**Opción 2 — PowerShell/CMD:**
```cmd
cd C:\DeepCamera
venv\Scripts\activate
python -u edge_detector.py --camera rtsp://rtsp:PASS@IP:554/av_stream/ch0 --camera-id CAM01
```

Salida esperada al arrancar:
```
=======================================================
  DeepCamera JVH - Edge AI
  Modelo: yolov8n.pt | Device: cuda | Conf: 0.45
  Camaras: [('CAM01', 'rtsp://...')]
=======================================================
[HTTP] Endpoint: https://tudominio.cl/deepcamera/api/events/ingest
[MQTT] Conectado a broker.hivemq.com
[INFO] Edge detector corriendo. Ctrl+C para detener.

[CAM01] Stream abierto - 10 FPS
[CAM01] Publicado: {'persona': 1} | frames=5 | http=OK
```

### 8.3 Verificar pipeline completo

```bash
# 1. Verificar health del backend
curl -s https://tudominio.cl/deepcamera/api/health

# 2. Verificar login
curl -s -X POST https://tudominio.cl/deepcamera/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"JVHadmin2026"}'

# 3. Verificar ingest (simular un evento del edge)
curl -s -X POST https://tudominio.cl/deepcamera/api/events/ingest \
  -H "Content-Type: application/json" \
  -H "x-edge-key: DC-EDGE-2026-JVH" \
  -d '{"camera_id":"TEST","timestamp":"2026-01-01T00:00:00Z","detections":[],"counts":{},"total":0,"thumbnail":"","stats":{}}'

# 4. Verificar edge status
curl -s https://tudominio.cl/deepcamera/api/edge-status
```

Respuestas esperadas:
```
# health
{"status":"ok","db":"sqlite-sqljs","mqtt":"connected","edge":{...}}

# login
{"token":"eyJ...","user":{"id":1,"username":"admin",...}}

# ingest
{"ok":true}

# edge-status
{"status":"online","last_seen":"2026-03-23 22:00:00","cameras":["CAM01"]}
```

### 8.4 Acceder al Dashboard

1. Abrir navegador → `https://tudominio.cl/deepcamera/login.html`
2. Ingresar: `admin` / `JVHadmin2026`
3. El módulo **Detecciones YOLO** se carga por defecto
4. Verificar indicador verde **Edge: online (CAM01)** arriba a la derecha

---

## 9. Troubleshooting

### Problema 1 — `Invalid credentials` al hacer login

**Síntoma:** El dashboard devuelve "Credenciales inválidas" aunque la contraseña sea correcta.

**Causa:** El proceso Passenger hace `_save()` al reiniciarse, sobreescribiendo cambios manuales en la DB.

**Solución:**
```bash
# En cPanel Terminal — ejecutar EN ESTE ORDEN:
sqlite3 ~/deepcamera/data/deepcamera.db \
  "UPDATE dc_users SET password_hash='\$2a\$10\$wk5h/SPZBkv6cBO6y1a/uepkcrOjWk.uN191bi9HzaoJzD7NBuzJO' WHERE username='admin';"

touch ~/deepcamera/tmp/restart.txt
# Esperar 15 segundos antes de intentar login
```

> ✅ **Fix permanente:** Actualizar `init.js` para usar hash fijo via UPSERT (ya incluido en versión >= commit b489219)

---

### Problema 2 — `{"error":"no such table: dc_events"}`

**Síntoma:** El endpoint `/api/events/ingest` devuelve error 500 con este mensaje.

**Causa A:** El servidor arrancó con un `init.js` desactualizado que no incluye la tabla `dc_events`.

**Solución A:**
```bash
# Verificar qué tablas existen
sqlite3 ~/deepcamera/data/deepcamera.db ".tables"

# Si falta dc_events, crearla manualmente:
sqlite3 ~/deepcamera/data/deepcamera.db "
CREATE TABLE IF NOT EXISTS dc_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  detections TEXT NOT NULL,
  counts TEXT NOT NULL,
  total INTEGER DEFAULT 0,
  thumbnail TEXT,
  stats TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);"

touch ~/deepcamera/tmp/restart.txt
```

**Causa B:** El archivo `init.js` en cPanel es el viejo (sin `dc_events` en el schema).

**Solución B:**
```bash
U=https://raw.githubusercontent.com/Nahj2023/deepcamera-jvh/master
curl -s $U/init.js -o ~/deepcamera/init.js
touch ~/deepcamera/tmp/restart.txt
```

---

### Problema 3 — Stream RTSP no abre (`FALLO` o `ERROR: no se pudo abrir`)

**Síntoma:** El edge detector imprime `[CAM01] ERROR: no se pudo abrir rtsp://...` o `FALLO`.

**Causa A:** Credenciales incorrectas o URL RTSP equivocada.

**Solución A:**
```python
# Probar URLs alternativas comunes
urls = [
    "rtsp://rtsp:PASS@IP:554/av_stream/ch0",      # Sonoff
    "rtsp://rtsp:PASS@IP:554/av_stream/ch1",
    "rtsp://admin:PASS@IP:554/stream1",            # Tapo
    "rtsp://admin:PASS@IP:554/h264Preview_01_main" # Reolink
]
import cv2
for url in urls:
    cap = cv2.VideoCapture(url)
    print(f"{'OK' if cap.isOpened() else 'FALLO'} -> {url}")
    cap.release()
```

**Causa B:** La cámara rechaza UDP. Forzar TCP:

**Solución B:**
```python
# Agregar antes de cv2.VideoCapture():
import os
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
```

**Causa C:** Firewall bloqueando puerto 554.

**Solución C:**
```bash
# Verificar conectividad
Test-NetConnection -ComputerName 192.168.0.135 -Port 554  # PowerShell
```

---

### Problema 4 — `npm: command not found` en cPanel Terminal

**Síntoma:** Al intentar `npm install` en cPanel Terminal, el comando no se reconoce.

**Causa:** Node.js en cPanel está instalado en una ruta no estándar.

**Solución:**
```bash
# Usar la ruta completa
/opt/alt/alt-nodejs24/root/usr/bin/npm install

# Opcional: agregar al PATH de la sesión
export PATH=/opt/alt/alt-nodejs24/root/usr/bin:$PATH
npm install
```

---

### Problema 5 — Dashboard muestra "No hay eventos aún" aunque el edge esté publicando

**Síntoma:** El edge detector muestra `http=OK` pero el dashboard no actualiza.

**Causa A:** Token JWT expirado en el navegador (tokens duran 24h).

**Solución A:** Hacer logout y volver a ingresar.

**Causa B:** El módulo `detections/index.html` tiene un import path incorrecto.

**Verificar:**
```bash
grep "import.*auth" ~/public_html/deepcamera/modules/detections/index.html
# Debe decir: import { apiGet } from './auth.js';
# NO: import { apiGet } from '../../auth.js';
```

**Solución B:**
```bash
# Actualizar archivo y asegurarse que auth.js existe en la carpeta
U=https://raw.githubusercontent.com/Nahj2023/deepcamera-jvh/master/frontend
curl -s $U/modules/detections/index.html -o ~/public_html/deepcamera/modules/detections/index.html
cp ~/public_html/deepcamera/auth.js ~/public_html/deepcamera/modules/detections/auth.js
```

**Causa C:** La carpeta correcta es `public_html/deepcamera/`, no `deepcamera/public/`.

**Solución C:**
```bash
ls ~/public_html/deepcamera/  # Debe existir y contener dashboard.html
```

---

## Apéndice A — Comandos de mantenimiento frecuentes

```bash
# Restart Passenger
touch ~/deepcamera/tmp/restart.txt

# Ver últimos eventos en la DB
sqlite3 ~/deepcamera/data/deepcamera.db \
  "SELECT camera_id, timestamp, counts, total FROM dc_events ORDER BY id DESC LIMIT 10;"

# Ver estado del edge
sqlite3 ~/deepcamera/data/deepcamera.db \
  "SELECT status, last_seen FROM dc_edge_status;"

# Limpiar eventos antiguos (más de 30 días)
sqlite3 ~/deepcamera/data/deepcamera.db \
  "DELETE FROM dc_events WHERE created_at < datetime('now', '-30 days');"

# Respaldar DB
cp ~/deepcamera/data/deepcamera.db \
   ~/deepcamera/data/deepcamera_$(date +%Y%m%d_%H%M).db
```

## Apéndice B — URLs de la API

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/api/health` | Ninguna | Estado del servidor |
| POST | `/api/auth/login` | Ninguna | Login → JWT |
| GET | `/api/auth/me` | JWT | Datos del usuario |
| POST | `/api/events/ingest` | x-edge-key | Recibir evento YOLO |
| GET | `/api/events` | JWT | Listar eventos |
| GET | `/api/events/latest` | JWT | Último evento por cámara |
| POST | `/api/edge/alive` | x-edge-key | Heartbeat del edge |
| GET | `/api/edge-status` | Ninguna | Estado del edge |

---

*Manual generado para DeepCamera JVH v1.0.0 — JVH Soporte SpA — 2026*
