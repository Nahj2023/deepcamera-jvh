"""
edge_detector.py — DeepCamera JVH Edge Detector v2.0
Motor de detección YOLO + reconocimiento facial + alertas Telegram

Características:
  - YOLOv8 detección de personas en tiempo real
  - Filtro: perros (16), gatos (15) y otras clases NO alertan
  - Reconocimiento facial: personas conocidas (known_faces/) no alertan
  - Bot Telegram: foto del intruso + metadatos
  - Cooldown configurable entre alertas
  - Horario de alertas configurable
  - Keep-alive al backend cada N segundos
  - Thumbnails locales de cada detección

Uso:
  python edge_detector.py                     # Modo normal
  python edge_detector.py --test-telegram     # Probar bot Telegram
  python edge_detector.py --test-camera       # Probar cámara
  python edge_detector.py --config mi.json    # Config personalizada
"""

import argparse
import json
import logging
import logging.handlers
import os
import sys
import time
import urllib.request
import urllib.parse
import json as json_mod
from datetime import datetime, time as dtime
from pathlib import Path

import cv2
import numpy as np

# Módulos locales DeepCamera
try:
    from face_recognizer import load_known_faces, is_known_person
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    FACE_RECOGNITION_AVAILABLE = False

try:
    from telegram_bot import send_alert, send_text, test_connection
    TELEGRAM_AVAILABLE = True
except ImportError:
    TELEGRAM_AVAILABLE = False

# ============================================================
# CONFIGURACIÓN
# ============================================================
DEFAULT_CONFIG = "edge_config.json"


def load_config(config_path: str) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def setup_logging(cfg: dict):
    log_cfg = cfg.get("logging", {})
    level = getattr(logging, log_cfg.get("level", "INFO"), logging.INFO)
    log_file = log_cfg.get("log_file", "edge_detector.log")
    max_bytes = log_cfg.get("max_bytes", 5 * 1024 * 1024)
    backup_count = log_cfg.get("backup_count", 3)

    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.handlers.RotatingFileHandler(
            log_file, maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8"
        )
    ]
    logging.basicConfig(level=level, format=fmt, handlers=handlers)
    return logging.getLogger("deepcamera.edge")


# ============================================================
# HORARIO
# ============================================================
def is_alert_time(schedule_cfg: dict) -> bool:
    """Retorna True si ahora está dentro del horario de alertas."""
    if not schedule_cfg.get("enabled", False):
        return True

    now = datetime.now().time()
    for slot in schedule_cfg.get("alert_hours", []):
        t_from = dtime.fromisoformat(slot["from"])
        t_to = dtime.fromisoformat(slot["to"])

        # Manejo de rangos nocturnos (ej: 22:00 → 06:00)
        if t_from > t_to:
            if now >= t_from or now <= t_to:
                return True
        else:
            if t_from <= now <= t_to:
                return True

    return False


# ============================================================
# BACKEND KEEP-ALIVE
# ============================================================
def notify_backend_alive(backend_url: str, api_key: str, camera_name: str, logger):
    """POST /api/edge/alive"""
    try:
        url = f"{backend_url.rstrip('/')}/api/edge/alive"
        data = json_mod.dumps({
            "camera": camera_name,
            "timestamp": datetime.now().isoformat(),
            "status": "online"
        }).encode("utf-8")
        req = urllib.request.Request(
            url, data=data,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key
            }
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            logger.debug(f"Keep-alive: {resp.status}")
    except Exception as e:
        logger.warning(f"Keep-alive error: {e}")


def send_event_to_backend(backend_url: str, api_key: str, event: dict, logger) -> bool:
    """POST /api/alerts?api_key=xxx"""
    try:
        url = f"{backend_url.rstrip('/')}/api/alerts?api_key={urllib.parse.quote(api_key)}"
        data = json_mod.dumps(event).encode("utf-8")
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        logger.error(f"Backend send error: {e}")
        return False


# ============================================================
# THUMBNAIL
# ============================================================
def save_thumbnail(frame: np.ndarray, thumbnails_dir: str, logger) -> str | None:
    """Guarda thumbnail y retorna la ruta relativa."""
    try:
        os.makedirs(thumbnails_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filename = f"alert_{ts}.jpg"
        path = os.path.join(thumbnails_dir, filename)
        cv2.imwrite(path, frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return filename
    except Exception as e:
        logger.error(f"Error guardando thumbnail: {e}")
        return None


# ============================================================
# DETECCIÓN PRINCIPAL
# ============================================================
class DeepCameraEdge:
    def __init__(self, cfg: dict, logger):
        self.cfg = cfg
        self.logger = logger
        self.det_cfg = cfg.get("detection", {})
        self.tg_cfg = cfg.get("telegram", {})
        self.face_cfg = cfg.get("face_recognition", {})
        self.backend_cfg = cfg.get("backend", {})
        self.sched_cfg = cfg.get("schedule", {})

        # Cooldown: tiempo mínimo entre alertas
        self.cooldown = self.det_cfg.get("cooldown_seconds", 30)
        self.last_alert_time = 0

        # Clases a ignorar (perros=16, gatos=15 en COCO)
        self.ignore_classes = set(self.det_cfg.get("ignore_classes", [15, 16]))
        self.person_class = self.det_cfg.get("person_class_id", 0)
        self.confidence_threshold = self.det_cfg.get("confidence_threshold", 0.55)

        # Keep-alive timer
        self.last_alive = 0
        self.alive_interval = self.backend_cfg.get("alive_interval", 60)

        self._model = None

    def _get_model(self):
        """Lazy-load YOLO model."""
        if self._model is None:
            from ultralytics import YOLO
            model_path = self.det_cfg.get("model", "yolov8n.pt")
            self.logger.info(f"Cargando modelo: {model_path}")
            self._model = YOLO(model_path)
            self.logger.info("Modelo cargado OK")
        return self._model

    def _should_alert(self) -> bool:
        """Verifica cooldown y horario."""
        now = time.time()
        if now - self.last_alert_time < self.cooldown:
            return False
        if not is_alert_time(self.sched_cfg):
            return False
        return True

    def _detect_frame(self, frame: np.ndarray) -> list[dict]:
        """Corre YOLO y retorna detecciones de personas."""
        model = self._get_model()
        results = model(frame, verbose=False, conf=self.confidence_threshold)
        detections = []

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])

                # Solo personas, ignorar mascotas y otras clases
                if cls_id != self.person_class:
                    continue
                if cls_id in self.ignore_classes:
                    continue

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                detections.append({
                    "class_id": cls_id,
                    "confidence": conf,
                    "bbox": (x1, y1, x2, y2)
                })

        return detections

    def _handle_detection(self, frame: np.ndarray, detections: list[dict]):
        """Procesa detección: face-recognition + alertas."""
        if not detections:
            return

        self.logger.info(f"Persona detectada ({len(detections)} bbox) — verificando identidad...")

        # Reconocimiento facial
        person_name = "Desconocido"
        is_known = False

        if self.face_cfg.get("enabled") and FACE_RECOGNITION_AVAILABLE:
            try:
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                tolerance = self.face_cfg.get("tolerance", 0.5)
                is_known, person_name = is_known_person(frame_rgb, tolerance)
            except Exception as e:
                self.logger.warning(f"Face recognition error: {e}")

        # Persona conocida → no alertar
        if is_known:
            self.logger.info(f"Persona reconocida: {person_name} — sin alerta")
            return

        # Verificar cooldown y horario ANTES de procesar
        if not self._should_alert():
            self.logger.debug("Alerta suprimida (cooldown o fuera de horario)")
            return

        # ---- ALERTA ----
        self.last_alert_time = time.time()
        best_conf = max(d["confidence"] for d in detections)
        camera_name = self.cfg.get("camera", {}).get("name", "Cámara")

        self.logger.warning(
            f"ALERTA: {person_name} detectado en {camera_name} "
            f"(conf={best_conf:.2f})"
        )

        # Dibujar bboxes en el frame de alerta
        alert_frame = frame.copy()
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            color = (0, 0, 255)  # Rojo para desconocido
            cv2.rectangle(alert_frame, (x1, y1), (x2, y2), color, 2)
            label = f"{person_name} {det['confidence']:.0%}"
            cv2.putText(alert_frame, label, (x1, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        # Thumbnail
        thumbnail_filename = None
        if self.det_cfg.get("save_thumbnails"):
            thumb_dir = self.det_cfg.get("thumbnails_dir", "thumbnails")
            thumbnail_filename = save_thumbnail(alert_frame, thumb_dir, self.logger)

        # Backend
        backend_url = self.backend_cfg.get("url", "")
        api_key = self.backend_cfg.get("api_key", "")
        if backend_url and api_key and api_key != "PONER_API_KEY_AQUI":
            event = {
                "alert_type": "intrusion",
                "description": f"{person_name} detectado por YOLO+FaceRec",
                "confidence": best_conf,
                "image_url": f"thumbnails/{thumbnail_filename}" if thumbnail_filename else None,
                "metadata": json_mod.dumps({
                    "person_name": person_name,
                    "detections": len(detections),
                    "camera": camera_name
                })
            }
            self.logger.debug(f"Enviando evento al backend...")
            send_event_to_backend(backend_url, api_key, event, self.logger)

        # Telegram
        if TELEGRAM_AVAILABLE and self.tg_cfg.get("enabled"):
            tg_token = self.tg_cfg.get("bot_token", "")
            tg_chat = self.tg_cfg.get("chat_id", "")
            send_alert(
                token=tg_token,
                chat_id=tg_chat,
                frame=alert_frame,
                person_name=person_name,
                camera_name=camera_name,
                confidence=best_conf
            )

    def run(self):
        """Loop principal de detección."""
        cam_cfg = self.cfg.get("camera", {})
        cam_url = cam_cfg.get("url")
        cam_name = cam_cfg.get("name", "Cámara")
        reconnect_delay = cam_cfg.get("reconnect_delay", 5)

        # Cargar caras conocidas al inicio
        if self.face_cfg.get("enabled") and FACE_RECOGNITION_AVAILABLE:
            known_dir = self.face_cfg.get("known_faces_dir", "known_faces")
            n = load_known_faces(known_dir)
            self.logger.info(f"Face recognition: {n} personas en base de datos")
        elif self.face_cfg.get("enabled") and not FACE_RECOGNITION_AVAILABLE:
            self.logger.warning(
                "face_recognition no disponible. Instala: pip install face-recognition\n"
                "Continuando sin reconocimiento facial (todas las personas alertarán)"
            )

        # Notificar Telegram que el sistema está online
        if TELEGRAM_AVAILABLE and self.tg_cfg.get("enabled"):
            tg_token = self.tg_cfg.get("bot_token", "")
            tg_chat = self.tg_cfg.get("chat_id", "")
            if tg_token and tg_token != "PONER_BOT_TOKEN_AQUI":
                send_text(tg_token, tg_chat,
                          f"🟢 DeepCamera JVH iniciado\n📷 {cam_name}\n🕒 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")

        self.logger.info(f"Iniciando loop de detección — cámara: {cam_url}")

        while True:
            cap = cv2.VideoCapture(cam_url)
            if not cap.isOpened():
                self.logger.error(f"No se pudo abrir la cámara. Reintentando en {reconnect_delay}s...")
                time.sleep(reconnect_delay)
                continue

            self.logger.info(f"Cámara conectada: {cam_name}")
            frame_count = 0
            errors = 0

            while True:
                ret, frame = cap.read()
                if not ret:
                    errors += 1
                    if errors > 10:
                        self.logger.warning("Demasiados errores de lectura. Reconectando...")
                        break
                    time.sleep(0.5)
                    continue

                errors = 0
                frame_count += 1

                # Procesar 1 de cada 5 frames (balance velocidad/CPU)
                if frame_count % 5 != 0:
                    continue

                # Keep-alive al backend
                now = time.time()
                if now - self.last_alive >= self.alive_interval:
                    self.last_alive = now
                    backend_url = self.backend_cfg.get("url", "")
                    api_key = self.backend_cfg.get("api_key", "")
                    if backend_url and api_key != "PONER_API_KEY_AQUI":
                        notify_backend_alive(backend_url, api_key, cam_name, self.logger)

                # Detección
                try:
                    detections = self._detect_frame(frame)
                    if detections:
                        self._handle_detection(frame, detections)
                except Exception as e:
                    self.logger.error(f"Error en detección: {e}", exc_info=True)

            cap.release()
            self.logger.info(f"Reconectando en {reconnect_delay}s...")
            time.sleep(reconnect_delay)


# ============================================================
# COMANDOS DE PRUEBA
# ============================================================
def cmd_test_telegram(cfg: dict, logger):
    if not TELEGRAM_AVAILABLE:
        print("ERROR: telegram_bot.py no encontrado")
        return
    tg = cfg.get("telegram", {})
    token = tg.get("bot_token", "")
    chat_id = tg.get("chat_id", "")
    if token == "PONER_BOT_TOKEN_AQUI" or not token:
        print("ERROR: Configura bot_token y chat_id en edge_config.json")
        print("Guía: https://core.telegram.org/bots/tutorial")
        return
    ok = test_connection(token, chat_id)
    print("✅ Telegram OK" if ok else "❌ Telegram FALLÓ — revisa token y chat_id")


def cmd_test_camera(cfg: dict, logger):
    cam_url = cfg.get("camera", {}).get("url")
    print(f"Probando: {cam_url}")
    cap = cv2.VideoCapture(cam_url)
    if not cap.isOpened():
        print("❌ No se pudo conectar a la cámara")
        return
    ret, frame = cap.read()
    if ret:
        cv2.imwrite("test_capture.jpg", frame)
        print(f"✅ Cámara OK — captura guardada en test_capture.jpg ({frame.shape[1]}x{frame.shape[0]})")
    else:
        print("❌ Cámara conectada pero no se pudo leer frame")
    cap.release()


# ============================================================
# MAIN
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="DeepCamera JVH Edge Detector v2")
    parser.add_argument("--config", default=DEFAULT_CONFIG, help="Ruta al archivo de configuración JSON")
    parser.add_argument("--test-telegram", action="store_true", help="Prueba la conexión con Telegram")
    parser.add_argument("--test-camera", action="store_true", help="Prueba la cámara y guarda un frame")
    args = parser.parse_args()

    if not os.path.exists(args.config):
        print(f"ERROR: No se encontró {args.config}")
        print("Copia edge_config.json.example o ejecuta desde el directorio correcto")
        sys.exit(1)

    cfg = load_config(args.config)
    logger = setup_logging(cfg)

    if args.test_telegram:
        cmd_test_telegram(cfg, logger)
        return

    if args.test_camera:
        cmd_test_camera(cfg, logger)
        return

    # Loop principal
    detector = DeepCameraEdge(cfg, logger)
    try:
        detector.run()
    except KeyboardInterrupt:
        logger.info("Detenido por usuario (Ctrl+C)")

        # Notificar Telegram offline
        if TELEGRAM_AVAILABLE:
            tg = cfg.get("telegram", {})
            token = tg.get("bot_token", "")
            chat_id = tg.get("chat_id", "")
            if token and token != "PONER_BOT_TOKEN_AQUI":
                send_text(token, chat_id,
                          f"🔴 DeepCamera JVH detenido\n🕒 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")


if __name__ == "__main__":
    main()
