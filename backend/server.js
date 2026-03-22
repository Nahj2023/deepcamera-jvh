import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import pg from 'pg';
import mqtt from 'mqtt';
import cors from 'cors';
import dotenv from 'dotenv';
import { verifyJWT, verifyAPIKey } from './middleware/auth.js';
import * as authHandler from './handlers/authHandler.js';
import * as customerHandler from './handlers/customerHandler.js';
import * as alertHandler from './handlers/alertHandler.js';
import * as cameraHandler from './handlers/cameraHandler.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3100;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============ DATABASE ============
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'deepcamera_jvh',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// ============ MQTT ============
const mqttClient = mqtt.connect(`${process.env.MQTT_PROTOCOL || 'mqtt'}://${process.env.MQTT_HOST || 'localhost'}:${process.env.MQTT_PORT || 1883}`, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined
});

mqttClient.on('connect', () => {
  console.log('✅ MQTT connected');
  // Suscribirse a topics de alertas
  mqttClient.subscribe('deepcamera/alerts/+');
  mqttClient.subscribe('deepcamera/test/alerts');
});

mqttClient.on('message', async (topic, payload) => {
  try {
    const alert = JSON.parse(payload.toString());

    // Topic: deepcamera/alerts/{customer_id}
    if (topic.startsWith('deepcamera/alerts/')) {
      const customerId = topic.split('/')[2];

      // Guardar en BD
      if (alert.camera_id) {
        await pool.query(
          `INSERT INTO dc_alerts (customer_id, camera_id, alert_type, description, confidence, image_url)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [customerId, alert.camera_id, alert.type || 'unknown', alert.description || '', alert.confidence || 0, alert.image_url || null]
        );
      }

      // Broadcast a todos los clientes Socket.io
      io.emit('new_alert', {
        customer_id: customerId,
        ...alert
      });

      io.emit(`alert_${customerId}`, alert); // Sala específica
    }

    // Topic: deepcamera/test/alerts
    if (topic === 'deepcamera/test/alerts') {
      const testAlert = {
        test_camera_id: alert.camera_id,
        alert_type: alert.type || 'unknown',
        description: alert.description || '',
        confidence: alert.confidence || 0,
        image_url: alert.image_url || null
      };

      // Guardar en BD test lab
      await pool.query(
        `INSERT INTO dc_test_alerts (test_camera_id, alert_type, description, confidence, image_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [testAlert.test_camera_id, testAlert.alert_type, testAlert.description, testAlert.confidence, testAlert.image_url]
      );

      // Broadcast a todos
      io.emit('test_alert', testAlert);
    }
  } catch (err) {
    console.error('MQTT message error:', err);
  }
});

mqttClient.on('error', (err) => {
  console.error('MQTT error:', err);
});

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// ============ ROUTES ============

// Auth
app.post('/api/auth/login', async (req, res) => {
  authHandler.login(req, res, pool);
});

app.get('/api/auth/me', verifyJWT, async (req, res) => {
  authHandler.getMe(req, res, pool);
});

app.post('/api/auth/register', verifyJWT, async (req, res) => {
  authHandler.register(req, res, pool);
});

// Customers
app.get('/api/customers', verifyJWT, async (req, res) => {
  customerHandler.getCustomers(req, res, pool);
});

app.get('/api/customers/:id', verifyJWT, async (req, res) => {
  customerHandler.getCustomerById(req, res, pool);
});

app.post('/api/customers', verifyJWT, async (req, res) => {
  customerHandler.createCustomer(req, res, pool);
});

app.put('/api/customers/:id', verifyJWT, async (req, res) => {
  customerHandler.updateCustomer(req, res, pool);
});

app.delete('/api/customers/:id', verifyJWT, async (req, res) => {
  customerHandler.deleteCustomer(req, res, pool);
});

app.post('/api/customers/:id/api-key', verifyJWT, async (req, res) => {
  customerHandler.regenerateAPIKey(req, res, pool);
});

// Alerts
app.get('/api/alerts', verifyJWT, async (req, res) => {
  alertHandler.getAlerts(req, res, pool);
});

app.get('/api/alerts/:id', verifyJWT, async (req, res) => {
  alertHandler.getAlertById(req, res, pool);
});

app.post('/api/alerts', async (req, res) => {
  // Autenticación por API key
  const apiKey = req.query.api_key || req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name FROM dc_customers WHERE api_key = $1',
      [apiKey]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    const customer = result.rows[0];
    alertHandler.createAlert(req, res, pool, customer);
  } catch (err) {
    console.error('API key verification error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/alerts/:id/acknowledge', verifyJWT, async (req, res) => {
  alertHandler.acknowledgeAlert(req, res, pool);
});

app.delete('/api/alerts/:id', verifyJWT, async (req, res) => {
  alertHandler.deleteAlert(req, res, pool);
});

app.get('/api/test-alerts', async (req, res) => {
  alertHandler.getTestAlerts(req, res, pool);
});

// Cameras
app.get('/api/cameras', verifyJWT, async (req, res) => {
  cameraHandler.getCameras(req, res, pool);
});

app.get('/api/cameras/:id', verifyJWT, async (req, res) => {
  cameraHandler.getCameraById(req, res, pool);
});

app.post('/api/cameras', verifyJWT, async (req, res) => {
  cameraHandler.createCamera(req, res, pool);
});

app.put('/api/cameras/:id', verifyJWT, async (req, res) => {
  cameraHandler.updateCamera(req, res, pool);
});

app.delete('/api/cameras/:id', verifyJWT, async (req, res) => {
  cameraHandler.deleteCamera(req, res, pool);
});

app.get('/api/test-cameras', async (req, res) => {
  cameraHandler.getTestCameras(req, res, pool);
});

app.post('/api/test-cameras', async (req, res) => {
  cameraHandler.createTestCamera(req, res, pool);
});

app.put('/api/test-cameras/:id/status', async (req, res) => {
  cameraHandler.updateTestCameraStatus(req, res, pool);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: NODE_ENV });
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log(`👤 Socket connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`👤 Socket disconnected: ${socket.id}`);
  });
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ============ START SERVER ============
httpServer.listen(PORT, () => {
  console.log(`\n🚀 DeepCamera Dashboard Server`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Environment: ${NODE_ENV}`);
  console.log(`   Database: ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  console.log(`   MQTT: ${process.env.MQTT_HOST}:${process.env.MQTT_PORT}\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
  await pool.end();
  mqttClient.end();
  process.exit(0);
});
