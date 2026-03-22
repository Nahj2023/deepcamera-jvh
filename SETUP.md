# DeepCamera JVH — Setup Guía

## Fase 1: Base de datos

### 1. Crear base de datos PostgreSQL

```bash
# Conectar a PostgreSQL
psql -U postgres

# Crear base de datos
CREATE DATABASE deepcamera_jvh;

# Conectar a la BD
\c deepcamera_jvh

# Ejecutar schema
\i backend/db/schema.sql

# Crear usuario admin inicial (reemplaza contraseñas)
INSERT INTO dc_users (username, email, password_hash, role)
VALUES ('admin', 'admin@jvhsoporte.cl',
  '$2b$10$...', 'superadmin');
```

Para generar hash bcrypt de contraseña:
```node
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash('JVHadmin2026', 10);
console.log(hash);
```

### 2. Configurar variables de entorno

```bash
cd backend
cp .env.example .env

# Editar .env con credenciales reales:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=deepcamera_jvh
DB_USER=postgres
DB_PASSWORD=tu_contraseña
JWT_SECRET=tu_secret_aleatorio_de_32_caracteres
```

---

## Fase 2: Backend

### 1. Instalar dependencias

```bash
cd backend
npm install
```

### 2. Arrancar servidor

```bash
npm start
# O con PM2
pm2 start ecosystem.config.js
pm2 save
```

El servidor escuchará en `http://localhost:3100`

### 3. Verificar salud del servidor

```bash
curl http://localhost:3100/api/health
# Respuesta esperada: {"status":"ok","env":"development"}
```

---

## Fase 3: Frontend

### 1. Abrir en navegador

```
http://localhost:3100/login.html
```

### 2. Credenciales de prueba

- Usuario: `admin`
- Contraseña: `JVHadmin2026`

---

## Fase 4: MQTT (Opcional para testing local)

### 1. Instalar Mosquitto

**Windows (Chocolatey):**
```bash
choco install mosquitto
```

**macOS:**
```bash
brew install mosquitto
```

**Linux (Ubuntu):**
```bash
sudo apt-get install mosquitto mosquitto-clients
sudo systemctl start mosquitto
```

### 2. Configurar en `.env`

```
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_PROTOCOL=mqtt
```

### 3. Probar MQTT con cliente mock

```bash
# Terminal 1: Suscribirse a alertas
mosquitto_sub -t "deepcamera/alerts/1" -h localhost

# Terminal 2: Publicar alerta de prueba
mosquitto_pub -t "deepcamera/alerts/1" -h localhost -m '{
  "camera_id": 1,
  "type": "person",
  "description": "Persona detectada",
  "confidence": 0.95,
  "image_url": "https://example.com/image.jpg"
}'
```

Deberías ver la alerta en el Terminal 1 y en el Dashboard (Socket.io).

---

## Fase 5: Setup Inicial del Dashboard

### 1. Crear cliente de prueba

**POST** `http://localhost:3100/api/customers`

```json
{
  "name": "Mi Empresa Test",
  "email": "test@empresa.cl",
  "contact_person": "Juan Pérez",
  "phone": "+56912345678"
}
```

Respuesta incluye `api_key` — **guárdalo, lo usarás para enviar alertas**.

### 2. Crear cámara de prueba

**POST** `http://localhost:3100/api/cameras`

```json
{
  "customer_id": 1,
  "name": "Cámara 1 - Entrada",
  "location": "Puerta principal",
  "camera_url": "rtsp://192.168.1.100:554/stream",
  "camera_type": "rtsp"
}
```

### 3. Test Lab (cámaras locales)

**POST** `http://localhost:3100/api/test-cameras`

```json
{
  "name": "Webcam Ryzen (Test)",
  "rtsp_url": "rtsp://localhost:8554/test",
  "location": "Escritorio"
}
```

---

## Verificación completa

### Checklist de funcionalidad

- [ ] `npm start` arranca sin errores
- [ ] `http://localhost:3100/login.html` carga
- [ ] Login con `admin` / `JVHadmin2026` funciona
- [ ] Dashboard muestra 0 alertas/clientes/cámaras inicialmente
- [ ] Puedes crear cliente vía formulario
- [ ] Puedes crear cámara vía API
- [ ] Publicar alerta MQTT → aparece en Dashboard en tiempo real (Socket.io)
- [ ] Test Lab muestra cámaras y alertas
- [ ] Filtros en Alertas funcionan
- [ ] Exportar CSV en Reportes descarga archivo
- [ ] Logout redirige a login

---

## Troubleshooting

### PostgreSQL no conecta

```bash
psql -h localhost -U postgres -d deepcamera_jvh
```

Si falla, verifica:
- PostgreSQL está corriendo: `pg_isready`
- Usuario/contraseña correctos en `.env`
- BD existe: `\l` en psql

### MQTT no conecta

```bash
# Verificar Mosquitto está corriendo
sudo systemctl status mosquitto

# Reiniciar si es necesario
sudo systemctl restart mosquitto
```

### JWT inválido

- Verifica `JWT_SECRET` en `.env` (mín 32 caracteres)
- Limpia `sessionStorage` en navegador (F12 → Application)

### Puerto 3100 en uso

```bash
# Windows
netstat -ano | findstr :3100

# macOS/Linux
lsof -i :3100

# Matar proceso
kill -9 <PID>
```

---

## Próximos pasos

### Sesión S79+

1. Conectar Ryzen con DeepCamera local
2. Publicar alertas MQTT desde edge
3. Validar flujo completo: Edge → MQTT → Backend → Dashboard
4. Integración con clientes reales

---

## Comandos útiles

```bash
# Backend
cd backend
npm start                    # Desarrollo
pm2 start ecosystem.config.js  # Producción
pm2 logs deepcamera-jvh     # Ver logs
pm2 restart deepcamera-jvh  # Reiniciar
pm2 stop deepcamera-jvh     # Detener

# Base de datos
psql -U postgres -d deepcamera_jvh
SELECT * FROM dc_users;     # Ver usuarios
SELECT * FROM dc_customers; # Ver clientes
SELECT * FROM dc_alerts;    # Ver alertas
```
