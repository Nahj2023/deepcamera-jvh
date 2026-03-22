import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import mqtt from 'mqtt';
import cors from 'cors';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { verifyJWT } from './middleware/auth.js';
import * as authHandler from './handlers/authHandler.js';
import * as customerHandler from './handlers/customerHandler.js';
import * as alertHandler from './handlers/alertHandler.js';
import * as cameraHandler from './handlers/cameraHandler.js';
import { initDB } from './db/init.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3100;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============ DATABASE (SQLite) ============
const dbPath = process.env.DB_PATH || join(__dirname, '..', 'deepcamera.db');
const db = new sqlite3.Database(dbPath);
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

// Inicializar BD
initDB(db);

// Promisify para queries
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

const dbPromise = {
  run: (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  }),
  all: (sql, params) => dbAll(sql, params),
  get: (sql, params) => dbGet(sql, params)
};

// Crear admin por defecto si no existe
(async () => {
  try {
    const admin = await dbPromise.get('SELECT id FROM dc_users WHERE username = ?', [process.env.ADMIN_USERNAME || 'admin']);
    if (!admin) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'JVHadmin2026', 10);
      await dbPromise.run(
        'INSERT INTO dc_users (username, password_hash, role) VALUES (?, ?, ?)',
        [process.env.ADMIN_USERNAME || 'admin', hash, 'superadmin']
      );
      console.log('✅ Admin user created');
    }
  } catch (err) {
    console.error('Admin creation error:', err);
  }
})();

// ============ MQTT ============
const mqttClient = mqtt.connect(`${process.env.MQTT_PROTOCOL || 'mqtt'}://${process.env.MQTT_HOST || 'localhost'}:${process.env.MQTT_PORT || 1883}`);

mqttClient.on('connect', () => {
  console.log('✅ MQTT connected');
  mqttClient.subscribe('deepcamera/alerts/+');
  mqttClient.subscribe('deepcamera/test/alerts');
});

mqttClient.on('message', async (topic, payload) => {
  try {
    const alert = JSON.parse(payload.toString());

    if (topic.startsWith('deepcamera/alerts/')) {
      const customerId = topic.split('/')[2];

      await dbPromise.run(
        `INSERT INTO dc_alerts (customer_id, camera_id, alert_type, description, confidence, image_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [customerId, alert.camera_id || null, alert.type || 'unknown', alert.description || '', alert.confidence || 0, alert.image_url || null]
      );

      io.emit('new_alert', { customer_id: customerId, ...alert });
      io.emit(`alert_${customerId}`, alert);
    }

    if (topic === 'deepcamera/test/alerts') {
      await dbPromise.run(
        `INSERT INTO dc_test_alerts (test_camera_id, alert_type, description, confidence, image_url)
         VALUES (?, ?, ?, ?, ?)`,
        [alert.camera_id || null, alert.type || 'unknown', alert.description || '', alert.confidence || 0, alert.image_url || null]
      );

      io.emit('test_alert', alert);
    }
  } catch (err) {
    console.error('MQTT error:', err);
  }
});

mqttClient.on('error', (err) => {
  console.error('MQTT connection error:', err.message);
});

// ============ MIDDLEWARE ============
// Strip /deepcamera prefix (Passenger on cPanel doesn't strip PassengerBaseURI)
const BASE_URI = process.env.BASE_URI || '/deepcamera';
app.use((req, res, next) => {
  if (req.url.startsWith(BASE_URI)) {
    req.url = req.url.slice(BASE_URI.length) || '/';
  }
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'frontend')));

// Pasar DB a handlers
const withDB = (handler) => (req, res) => handler(req, res, dbPromise);

// ============ ROUTES ============

// Auth
app.post('/api/auth/login', withDB(authHandler.login));
app.get('/api/auth/me', verifyJWT, withDB(authHandler.getMe));
app.post('/api/auth/register', verifyJWT, withDB(authHandler.register));

// Customers
app.get('/api/customers', verifyJWT, withDB(customerHandler.getCustomers));
app.get('/api/customers/:id', verifyJWT, withDB(customerHandler.getCustomerById));
app.post('/api/customers', verifyJWT, withDB(customerHandler.createCustomer));
app.put('/api/customers/:id', verifyJWT, withDB(customerHandler.updateCustomer));
app.delete('/api/customers/:id', verifyJWT, withDB(customerHandler.deleteCustomer));
app.post('/api/customers/:id/api-key', verifyJWT, withDB(customerHandler.regenerateAPIKey));

// Alerts
app.get('/api/alerts', verifyJWT, withDB(alertHandler.getAlerts));
app.post('/api/alerts', async (req, res) => {
  const apiKey = req.query.api_key || req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  try {
    const customer = await dbPromise.get('SELECT id, name FROM dc_customers WHERE api_key = ?', [apiKey]);
    if (!customer) return res.status(401).json({ error: 'Invalid API key' });

    req.customer = customer;
    alertHandler.createAlert(req, res, dbPromise);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/alerts/:id/acknowledge', verifyJWT, withDB(alertHandler.acknowledgeAlert));
app.get('/api/test-alerts', withDB(alertHandler.getTestAlerts));

// Cameras
app.get('/api/cameras', verifyJWT, withDB(cameraHandler.getCameras));
app.post('/api/cameras', verifyJWT, withDB(cameraHandler.createCamera));
app.put('/api/cameras/:id', verifyJWT, withDB(cameraHandler.updateCamera));
app.get('/api/test-cameras', withDB(cameraHandler.getTestCameras));
app.post('/api/test-cameras', withDB(cameraHandler.createTestCamera));
app.put('/api/test-cameras/:id/status', withDB(cameraHandler.updateTestCameraStatus));

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: NODE_ENV });
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log(`Socket: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Disconnected: ${socket.id}`));
});

// ============ START ============
httpServer.listen(PORT, () => {
  console.log(`\nDeepCamera Dashboard\n   Port: ${PORT}\n   Env: ${NODE_ENV}\n   DB: SQLite (${dbPath})\n   MQTT: ${process.env.MQTT_HOST || 'localhost'}\n`);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  httpServer.close();
  db.close();
  mqttClient.end();
  process.exit(0);
});
