/**
 * DeepCamera JVH — Backend Server (CJS)
 * Stack: Express + SQLite (sql.js) + MQTT
 * Hosting: cPanel Passenger
 */

const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

const authHandler = require('./authHandler');
const customerHandler = require('./customerHandler');
const alertHandler = require('./alertHandler');
const cameraHandler = require('./cameraHandler');
const detectionHandler = require('./detectionHandler');
const dbPromise = require('./init');

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';

// JWT middleware
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid token format' });
  try {
    req.user = jwt.verify(parts[1], JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Wait for DB, then start
dbPromise.then(db => {

  const app = express();
  const PORT = process.env.PORT || 3100;

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  var staticDir = path.join(path.dirname(require.resolve('./package.json')), 'frontend');
  console.log('[STATIC]', staticDir);
  app.use(express.static(staticDir));

  // Strip /deepcamera prefix
  app.use((req, res, next) => {
    if (req.path.startsWith('/deepcamera/')) {
      req.url = req.url.replace('/deepcamera', '');
    }
    next();
  });

  // MQTT
  const MQTT_BROKER = process.env.MQTT_HOST || 'broker.hivemq.com';
  const MQTT_PORT_NUM = parseInt(process.env.MQTT_PORT || '1883', 10);

  const mqttClient = mqtt.connect('mqtt://' + MQTT_BROKER + ':' + MQTT_PORT_NUM, {
    clientId: 'deepcamera-dashboard-cpanel',
    clean: true,
    reconnectPeriod: 5000
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Conectado a ' + MQTT_BROKER);
    mqttClient.subscribe('deepcamera/jvh/detections', { qos: 1 });
    mqttClient.subscribe('deepcamera/jvh/alive', { qos: 0 });
    mqttClient.subscribe('deepcamera/alerts/+', { qos: 1 });
  });

  mqttClient.on('message', (topic, payload) => {
    var data;
    try { data = JSON.parse(payload.toString()); } catch (e) { return; }

    if (topic === 'deepcamera/jvh/detections') {
      if (!data.camera_id) return;
      try { detectionHandler.saveEvent(db, data); } catch (err) { console.error('[MQTT]', err.message); }
      return;
    }
    if (topic === 'deepcamera/jvh/alive') {
      try { detectionHandler.upsertEdgeStatus(db, data); } catch (err) { console.error('[MQTT]', err.message); }
      return;
    }
    if (topic.startsWith('deepcamera/alerts/')) {
      var customerId = topic.split('/')[2];
      if (!data.camera_id) return;
      try {
        db.prepare('INSERT INTO dc_alerts (customer_id, alert_type, description, confidence, image_url) VALUES (?, ?, ?, ?, ?)')
          .run(customerId, data.type || 'unknown', data.description || '', data.confidence || 0, data.image_url || null);
      } catch (err) { console.error('[MQTT]', err.message); }
    }
  });

  mqttClient.on('error', (err) => { console.error('[MQTT] Error:', err.message); });

  // Routes — Auth
  app.post('/api/auth/login', (req, res) => authHandler.login(req, res, db));
  app.get('/api/auth/me', verifyJWT, (req, res) => authHandler.getMe(req, res, db));
  app.post('/api/auth/register', verifyJWT, (req, res) => authHandler.register(req, res, db));

  // Routes — Customers
  app.get('/api/customers', verifyJWT, (req, res) => customerHandler.getCustomers(req, res, db));
  app.get('/api/customers/:id', verifyJWT, (req, res) => customerHandler.getCustomerById(req, res, db));
  app.post('/api/customers', verifyJWT, (req, res) => customerHandler.createCustomer(req, res, db));
  app.put('/api/customers/:id', verifyJWT, (req, res) => customerHandler.updateCustomer(req, res, db));
  app.delete('/api/customers/:id', verifyJWT, (req, res) => customerHandler.deleteCustomer(req, res, db));
  app.post('/api/customers/:id/api-key', verifyJWT, (req, res) => customerHandler.regenerateAPIKey(req, res, db));

  // Routes — Cameras
  app.get('/api/cameras', verifyJWT, (req, res) => cameraHandler.getCameras(req, res, db));
  app.get('/api/cameras/:id', verifyJWT, (req, res) => cameraHandler.getCameraById(req, res, db));
  app.post('/api/cameras', verifyJWT, (req, res) => cameraHandler.createCamera(req, res, db));
  app.put('/api/cameras/:id', verifyJWT, (req, res) => cameraHandler.updateCamera(req, res, db));
  app.delete('/api/cameras/:id', verifyJWT, (req, res) => cameraHandler.deleteCamera(req, res, db));
  app.get('/api/test-cameras', (req, res) => cameraHandler.getTestCameras(req, res, db));
  app.post('/api/test-cameras', (req, res) => cameraHandler.createTestCamera(req, res, db));
  app.put('/api/test-cameras/:id/status', (req, res) => cameraHandler.updateTestCameraStatus(req, res, db));

  // Routes — Alerts
  app.get('/api/alerts', verifyJWT, (req, res) => alertHandler.getAlerts(req, res, db));
  app.get('/api/alerts/:id', verifyJWT, (req, res) => alertHandler.getAlertById(req, res, db));
  app.put('/api/alerts/:id/acknowledge', verifyJWT, (req, res) => alertHandler.acknowledgeAlert(req, res, db));
  app.delete('/api/alerts/:id', verifyJWT, (req, res) => alertHandler.deleteAlert(req, res, db));
  app.get('/api/test-alerts', (req, res) => alertHandler.getTestAlerts(req, res, db));

  app.post('/api/alerts', (req, res) => {
    var apiKey = req.query.api_key || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    var customer = db.prepare('SELECT id, name FROM dc_customers WHERE api_key = ?').get(apiKey);
    if (!customer) return res.status(401).json({ error: 'Invalid API key' });
    alertHandler.createAlert(req, res, db, customer);
  });

  // Edge key middleware
  var EDGE_API_KEY = process.env.EDGE_API_KEY || 'DC-EDGE-2026-JVH';
  function verifyEdgeKey(req, res, next) {
    if (req.headers['x-edge-key'] !== EDGE_API_KEY) {
      return res.status(401).json({ error: 'Invalid edge key' });
    }
    next();
  }

  // Routes — Events
  app.get('/api/events', verifyJWT, (req, res) => detectionHandler.getEvents(req, res, db));
  app.get('/api/events/latest', verifyJWT, (req, res) => detectionHandler.getLatestEvents(req, res, db));
  app.get('/api/events/:id', verifyJWT, (req, res) => detectionHandler.getEventById(req, res, db));

  // Edge ingest (desde Ryzen via HTTP)
  app.post('/api/events/ingest', verifyEdgeKey, (req, res) => {
    try {
      detectionHandler.saveEvent(db, req.body);
      res.json({ ok: true });
    } catch (err) {
      console.error('[INGEST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/edge/alive', verifyEdgeKey, (req, res) => {
    try {
      detectionHandler.upsertEdgeStatus(db, req.body);
      res.json({ ok: true });
    } catch (err) {
      console.error('[ALIVE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Edge status
  app.get('/api/edge-status', (req, res) => detectionHandler.getEdgeStatus(req, res, db));

  // Health
  app.get('/api/health', (req, res) => {
    var edgeRow = db.prepare('SELECT status, last_seen FROM dc_edge_status LIMIT 1').get();
    res.json({
      status: 'ok',
      db: 'sqlite-sqljs',
      mqtt: mqttClient.connected ? 'connected' : 'disconnected',
      edge: edgeRow || { status: 'unknown', last_seen: null }
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  // Start
  app.listen(PORT, () => {
    console.log('[SERVER] DeepCamera JVH en puerto ' + PORT);
    console.log('[SERVER] MQTT: ' + MQTT_BROKER);
  });

  process.on('SIGTERM', () => {
    mqttClient.end();
    db.close();
    process.exit(0);
  });

}).catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
