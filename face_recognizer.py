"""
face_recognizer.py — Reconocimiento facial para DeepCamera JVH
Usa face_recognition (dlib) para comparar detectados contra known_faces/
"""

import os
import logging
import numpy as np

logger = logging.getLogger("deepcamera.face")

_face_recognition = None
_known_encodings = []
_known_names = []


def _lazy_import():
    """Importa face_recognition solo cuando se necesita (pesado)."""
    global _face_recognition
    if _face_recognition is None:
        try:
            import face_recognition as fr
            _face_recognition = fr
        except ImportError:
            logger.error("face_recognition no instalado. Ejecuta: pip install face-recognition")
            raise
    return _face_recognition


def load_known_faces(known_faces_dir: str) -> int:
    """
    Carga encodings de todas las imágenes en known_faces_dir.
    Estructura esperada:
        known_faces/
            Juan/foto1.jpg
            Juan/foto2.jpg
            Maria/foto1.jpg
    Retorna el número de personas cargadas.
    """
    global _known_encodings, _known_names

    if not os.path.isdir(known_faces_dir):
        os.makedirs(known_faces_dir, exist_ok=True)
        logger.info(f"Directorio {known_faces_dir}/ creado. Agrega fotos de personas conocidas.")
        return 0

    fr = _lazy_import()
    _known_encodings = []
    _known_names = []

    people_loaded = set()

    for person_name in os.listdir(known_faces_dir):
        person_path = os.path.join(known_faces_dir, person_name)

        # Soporta tanto subdirectorios (nombre/foto.jpg) como imágenes directas (nombre.jpg)
        if os.path.isdir(person_path):
            image_files = [
                os.path.join(person_path, f) for f in os.listdir(person_path)
                if f.lower().endswith(('.jpg', '.jpeg', '.png'))
            ]
            name = person_name
        elif person_name.lower().endswith(('.jpg', '.jpeg', '.png')):
            image_files = [person_path]
            name = os.path.splitext(person_name)[0]
        else:
            continue

        for img_path in image_files:
            try:
                image = fr.load_image_file(img_path)
                encodings = fr.face_encodings(image)
                if encodings:
                    _known_encodings.append(encodings[0])
                    _known_names.append(name)
                    people_loaded.add(name)
                else:
                    logger.warning(f"No se detectó cara en: {img_path}")
            except Exception as e:
                logger.error(f"Error cargando {img_path}: {e}")

    logger.info(f"Personas conocidas cargadas: {sorted(people_loaded)} ({len(_known_encodings)} encodings)")
    return len(people_loaded)


def identify_faces(frame_rgb: np.ndarray, tolerance: float = 0.5) -> list[dict]:
    """
    Identifica caras en el frame dado (RGB numpy array).
    Retorna lista de dicts: [{name, confidence, location}, ...]
    """
    if not _known_encodings and not _known_names:
        return [{"name": "Desconocido", "confidence": 0.0, "location": None}]

    fr = _lazy_import()

    try:
        # Reducir resolución para mayor velocidad
        small_frame = frame_rgb[::2, ::2]
        face_locations = fr.face_locations(small_frame, model="hog")
        face_encodings = fr.face_encodings(small_frame, face_locations)
    except Exception as e:
        logger.error(f"Error en detección facial: {e}")
        return []

    results = []
    for encoding, location in zip(face_encodings, face_locations):
        name = "Desconocido"
        confidence = 0.0

        if _known_encodings:
            distances = fr.face_distance(_known_encodings, encoding)
            best_idx = int(np.argmin(distances))
            best_distance = float(distances[best_idx])
            confidence = round(1.0 - best_distance, 3)

            if best_distance <= tolerance:
                name = _known_names[best_idx]

        # Escalar ubicación de vuelta (dividimos el frame por 2 arriba)
        top, right, bottom, left = location
        location_scaled = (top * 2, right * 2, bottom * 2, left * 2)

        results.append({
            "name": name,
            "confidence": confidence,
            "location": location_scaled,
            "is_known": name != "Desconocido"
        })

    return results


def is_known_person(frame_rgb: np.ndarray, tolerance: float = 0.5) -> tuple[bool, str]:
    """
    Conveniencia: retorna (True, nombre) si se reconoce a alguien, (False, "Desconocido") si no.
    """
    faces = identify_faces(frame_rgb, tolerance)
    if not faces:
        return False, "Sin cara visible"

    # Si al menos una cara es conocida → no alertar
    for face in faces:
        if face.get("is_known"):
            return True, face["name"]

    return False, faces[0]["name"]
