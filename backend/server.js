/**
 * DeepCamera JVH — Backend Server
 * Stack: Express + SQLite (better-sqlite3) + MQTT
 * Hosting: cPanel Passenger (NO Socket.io, NO PM2)
 */

import express from 'express';
import mqtt from 'mqtt';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { verifyJWT } from './middleware/auth.js';
import * as authHandler       from './handlers/authHandler.js';
import * as customerHandler   from './handlers/customerHandler.js';
import * as alertHandler      from './handlers/alertHandler.js';
import * as cameraHandler     from './handlers/cameraHandler.js';
import * as detectionHandler  from './handlers/detectionHandler.js';
import db from './db/init.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3100;

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json({ limit: '5mb' }));    // thumbnail base64 puede ser grande
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Strip /deepcamera prefix (cPanel Passenger base URI)
app.use((req, res, next) => {
  if (req.path.startsWith('/deepcamera/')) {
    req.url = req.url.replace('/deepcamera', '');
  }
  next();
});

// ============ MQTT ============
const MQTT_BROKER = process.env.MQTT_HOST || 'broker.hivemq.com';
const MQTT_PORT   = parseInt(process.env.MQTT_PORT || '1883', 10);

const mqttClient = mqtt.connect(`mqtt://${MQTT_BROKER}:${MQTT_PORT}`, {
  clientId:  'deepcamera-dashboard-cpanel',
  clean:     true,
  reconnectPeriod: 5000
});

mqttClient.on('connect', () => {
  console.log(`[MQTT] Conectado a ${MQTT_BROKER}`);

  // Detecciones YOLO desde edge Ryzen
  mqttClient.subscribe('deepcamera/jvh/detections', { qos: 1 });
  // Heartbeat del edge
  mqttClient.subscribe('deepcamera/jvh/alive', { qos: 0 });
  // Alertas legacy (compatibilidad hacia atras)
  mqttClient.subscribe('deepcamera/alerts/+', { qos: 1 });
});

mqttClient.on('message', (topic, payload) => {
  let data;
  try {
    data = JSON.parse(payload.toString());
  } catch {
    console.error(`[MQTT] JSON invalido en ${topic}`);
    return;
  }

  // --- Detecciones YOLO del Ryzen ---
  if (topic === 'deepcamera/jvh/detections') {
    if (!data.camera_id) return;
    try {
      detectionHandler.saveEvent(db, data);
    } catch (err) {
      console.error('[MQTT] Error guardando evento:', err.message);
    }
    return;
  }

  // --- Heartbeat edge ---
  if (topic === 'deepcamera/jvh/alive') {
    try {
      detectionHandler.upsertEdgeStatus(db, data);
    } catch (err) {
      console.error('[MQTT] Error guardando edge status:', err.message);
    }
    return;
  }

  // --- Alertas legacy ---
  if (topic.startsWith('deepcamera/alerts/')) {
    const customerId = topic.split('/')[2];
    if (!data.camera_id) return;
    try {
      db.prepare(`
        INSERT INTO dc_alerts
          (customer_id, alert_type, description, confidence, image_url)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        customerId,
        data.type || 'unknown',
        data.description || '',
        data.confidence || 0,
        data.image_url || null
      );
    } catch (err) {
      console.error('[MQTT] Error guardando alerta legacy:', err.message);
    }
  }
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] Error:', err.message);
});

// ============ ROUTES ============

// Auth
app.post('/api/auth/login', (req, res) => authHandler.login(req, res, db));
app.get('/api/auth/me', verifyJWT, (req, res) => authHandler.getMe(req, res, db));
app.post('/api/auth/register', verifyJWT, (req, res) => authHandler.register(req, res, db));

// Customers
app.get('/api/customers', verifyJWT, (req, res) => customerHandler.getCustomers(req, res, db));
app.get('/api/customers/:id', verifyJWT, (req, res) => customerHandler.getCustomerById(req, res, db));
app.post('/api/customers', verifyJWT, (req, res) => customerHandler.createCustomer(req, res, db));
app.put('/api/customers/:id', verifyJWT, (req, res) => customerHandler.updateCustomer(req, res, db));
app.delete('/api/customers/:id', verifyJWT, (req, res) => customerHandler.deleteCustomer(req, res, db));
app.post('/api/customers/:id/api-key', verifyJWT, (req, res) => customerHandler.regenerateAPIKey(req, res, db));

// Cameras
app.get('/api/cameras', verifyJWT, (req, res) => cameraHandler.getCameras(req, res, db));
app.get('/api/cameras/:id', verifyJWT, (req, res) => cameraHandler.getCameraById(req, res, db));
app.post('/api/cameras', verifyJWT, (req, res) => cameraHandler.createCamera(req, res, db));
app.put('/api/cameras/:id', verifyJWT, (req, res) => cameraHandler.updateCamera(req, res, db));
app.delete('/api/cameras/:id', verifyJWT, (req, res) => cameraHandler.deleteCamera(req, res, db));
app.get('/api/test-cameras', (req, res) => cameraHandler.getTestCameras(req, res, db));
app.post('/api/test-cameras', (req, res) => cameraHandler.createTestCamera(req, res, db));
app.put('/api/test-cameras/:id/status', (req, res) => cameraHandler.updateTestCameraStatus(req, res, db));

// Alerts (legacy)
app.get('/api/alerts', verifyJWT, (req, res) => alertHandler.getAlerts(req, res, db));
app.get('/api/alerts/:id', verifyJWT, (req, res) => alertHandler.getAlertById(req, res, db));
app.put('/api/alerts/:id/acknowledge', verifyJWT, (req, res) => alertHandler.acknowledgeAlert(req, res, db));
app.delete('/api/alerts/:id', verifyJWT, (req, res) => alertHandler.deleteAlert(req, res, db));
app.get('/api/test-alerts', (req, res) => alertHandler.getTestAlerts(req, res, db));

// POST /api/alerts — desde edge con API key (legacy)
app.post('/api/alerts', (req, res) => {
  const apiKey = req.query.api_key || req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  const customer = db.prepare('SELECT id, name FROM dc_customers WHERE api_key = ?').get(apiKey);
  if (!customer) return res.status(401).json({ error: 'Invalid API key' });

  alertHandler.createAlert(req, res, db, customer);
});

// Events — detecciones YOLO del Ryzen
app.get('/api/events',        verifyJWT, (req, res) => detectionHandler.getEvents(req, res, db));
app.get('/api/events/latest', verifyJWT, (req, res) => detectionHandler.getLatestEvents(req, res, db));
app.get('/api/events/:id',    verifyJWT, (req, res) => detectionHandler.getEventById(req, res, db));

// Edge status (sin JWT — el frontend lo usa para el indicador de conexion)
app.get('/api/edge-status', (req, res) => detectionHandler.getEdgeStatus(req, res, db));

// Health check
app.get('/api/health', (req, res) => {
  const edgeRow = db.prepare('SELECT status, last_seen FROM dc_edge_status LIMIT 1').get();
  res.json({
    status:     'ok',
    db:         'sqlite',
    mqtt:       mqttClient.connected ? 'connected' : 'disconnected',
    edge:       edgeRow || { status: 'unknown', last_seen: null }
  });
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ============ START ============
app.listen(PORT, () => {
  console.log(`[SERVER] DeepCamera JVH corriendo en puerto ${PORT}`);
  console.log(`[SERVER] MQTT broker: ${MQTT_BROKER}:${MQTT_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  mqttClient.end();
  db.close();
  process.exit(0);
});
