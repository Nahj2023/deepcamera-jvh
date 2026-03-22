-- DeepCamera JVH — PostgreSQL Schema
-- Vigilancia IA local con dashboard remoto

-- Usuarios JVH (administradores del dashboard)
CREATE TABLE IF NOT EXISTS dc_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin', -- 'superadmin', 'admin', 'viewer'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Clientes (empresas vigiladas)
CREATE TABLE IF NOT EXISTS dc_customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(100),
  api_key VARCHAR(255) UNIQUE,
  mqtt_user VARCHAR(100),
  mqtt_pass VARCHAR(255),
  contact_person VARCHAR(200),
  phone VARCHAR(20),
  address TEXT,
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, inactive
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Cámaras (por cliente)
CREATE TABLE IF NOT EXISTS dc_cameras (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES dc_customers(id) ON DELETE CASCADE,
  name VARCHAR(200),
  location VARCHAR(200),
  camera_url VARCHAR(500),
  camera_type VARCHAR(20), -- rtsp, usb, ip, http
  status VARCHAR(20) DEFAULT 'offline', -- online, offline, error
  last_seen TIMESTAMP,
  fps_current FLOAT,
  fps_target INT DEFAULT 30,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Alertas/Eventos IA
CREATE TABLE IF NOT EXISTS dc_alerts (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES dc_customers(id) ON DELETE CASCADE,
  camera_id INT REFERENCES dc_cameras(id) ON DELETE CASCADE,
  alert_type VARCHAR(100), -- person, face, fall, object, custom
  description TEXT,
  confidence FLOAT,
  image_url VARCHAR(500),
  video_url VARCHAR(500),
  metadata JSONB, -- datos adicionales: rostros detectados, etc
  acknowledged_by VARCHAR(100),
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Test Lab (cámaras del propio JVH para testing)
CREATE TABLE IF NOT EXISTS dc_test_cameras (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  rtsp_url VARCHAR(500) NOT NULL,
  location VARCHAR(200),
  status VARCHAR(20) DEFAULT 'offline', -- online, offline, error
  last_seen TIMESTAMP,
  fps_current FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Test Lab Alerts (alertas de cámaras de prueba)
CREATE TABLE IF NOT EXISTS dc_test_alerts (
  id SERIAL PRIMARY KEY,
  test_camera_id INT REFERENCES dc_test_cameras(id) ON DELETE CASCADE,
  alert_type VARCHAR(100),
  description TEXT,
  confidence FLOAT,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes para performance
CREATE INDEX IF NOT EXISTS idx_customers_status ON dc_customers(status);
CREATE INDEX IF NOT EXISTS idx_cameras_customer ON dc_cameras(customer_id);
CREATE INDEX IF NOT EXISTS idx_cameras_status ON dc_cameras(status);
CREATE INDEX IF NOT EXISTS idx_alerts_customer ON dc_alerts(customer_id);
CREATE INDEX IF NOT EXISTS idx_alerts_camera ON dc_alerts(camera_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON dc_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON dc_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_test_alerts_camera ON dc_test_alerts(test_camera_id);
CREATE INDEX IF NOT EXISTS idx_test_alerts_created ON dc_test_alerts(created_at);
