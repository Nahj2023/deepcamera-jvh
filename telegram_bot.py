"""
telegram_bot.py — Notificaciones Telegram para DeepCamera JVH
Envía foto + mensaje cuando se detecta intruso desconocido.
"""

import logging
import urllib.request
import urllib.parse
import json
import io
import os
import cv2
import numpy as np
from datetime import datetime

logger = logging.getLogger("deepcamera.telegram")

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"


def _api_call(token: str, method: str, data: dict = None, files: dict = None) -> dict:
    """Llamada a la API de Telegram (sin dependencias externas, solo urllib)."""
    url = TELEGRAM_API.format(token=token, method=method)
    try:
        if files:
            # Multipart para envío de foto
            import email.mime.multipart as mp
            boundary = "----DeepCameraJVH"
            body_parts = []

            # Campos de texto
            for key, value in (data or {}).items():
                body_parts.append(
                    f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
                )

            # Archivo
            for field_name, (filename, file_data, content_type) in files.items():
                body_parts.append(
                    f'--{boundary}\r\nContent-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'.encode()
                    + file_data + b'\r\n'
                )

            body_parts.append(f'--{boundary}--\r\n'.encode())
            body = b''.join(body_parts)

            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
            )
        else:
            body = json.dumps(data or {}).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json"}
            )

        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode('utf-8'))

    except Exception as e:
        logger.error(f"Telegram API error ({method}): {e}")
        return {"ok": False, "error": str(e)}


def send_alert(token: str, chat_id: str, frame: np.ndarray,
               person_name: str = "Desconocido",
               camera_name: str = "Cámara",
               confidence: float = 0.0,
               extra_info: str = "") -> bool:
    """
    Envía alerta Telegram con foto del intruso.
    frame: numpy array BGR (OpenCV format)
    Retorna True si se envió correctamente.
    """
    if not token or not chat_id or token == "PONER_BOT_TOKEN_AQUI":
        logger.warning("Telegram no configurado. Agrega bot_token y chat_id en edge_config.json")
        return False

    now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    if person_name == "Desconocido":
        emoji = "🚨"
        status = "INTRUSO DETECTADO"
    else:
        emoji = "👤"
        status = f"Persona: {person_name}"

    caption = (
        f"{emoji} *{status}*\n"
        f"📷 {camera_name}\n"
        f"🕒 {now}\n"
        f"📊 Confianza: {confidence:.0%}"
    )
    if extra_info:
        caption += f"\nℹ️ {extra_info}"

    # Codificar frame como JPEG
    try:
        success, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not success:
            logger.error("No se pudo codificar el frame como JPEG")
            return False
        img_bytes = buffer.tobytes()
    except Exception as e:
        logger.error(f"Error codificando imagen: {e}")
        return False

    # Enviar foto con caption
    result = _api_call(
        token=token,
        method="sendPhoto",
        data={"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"},
        files={"photo": ("alerta.jpg", img_bytes, "image/jpeg")}
    )

    if result.get("ok"):
        logger.info(f"Telegram: alerta enviada — {status}")
        return True
    else:
        logger.error(f"Telegram: error enviando foto: {result}")
        # Fallback: solo texto
        text_result = _api_call(
            token=token,
            method="sendMessage",
            data={"chat_id": chat_id, "text": caption.replace("*", ""), "parse_mode": ""}
        )
        return text_result.get("ok", False)


def send_text(token: str, chat_id: str, message: str) -> bool:
    """Envía solo texto (para notificaciones de estado)."""
    if not token or not chat_id or token == "PONER_BOT_TOKEN_AQUI":
        return False
    result = _api_call(token, "sendMessage", {"chat_id": chat_id, "text": message})
    return result.get("ok", False)


def test_connection(token: str, chat_id: str) -> bool:
    """Verifica que el bot funcione enviando mensaje de prueba."""
    msg = (
        "✅ DeepCamera JVH conectado\n"
        f"🕒 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n"
        "Sistema de alertas activo."
    )
    result = send_text(token, chat_id, msg)
    if result:
        logger.info("Telegram: conexión verificada correctamente")
    else:
        logger.error("Telegram: no se pudo conectar. Verifica bot_token y chat_id")
    return result
