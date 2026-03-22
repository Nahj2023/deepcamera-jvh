# DeepCamera JVH — Vigilancia IA Local

**Proyecto:** Sistema de vigilancia inteligente con IA local para empresas
**Estado:** En desarrollo (Fase 1: Pruebas locales)
**Licencia:** MIT (open-source)
**Copyright:** JVH Soporte SpA, 2026

---

## 🎯 Visión

Proporcionar a PyMEs y empresas un sistema de vigilancia inteligente con:
- ✅ Análisis IA local (sin enviar videos a nube)
- ✅ Detección de eventos (rostros, objetos, caídas, etc)
- ✅ Dashboard remoto para monitoreo multi-empresa
- ✅ Máxima privacidad y eficiencia

---

## 🏗️ Arquitectura

```
CLIENTE (Empresa)
├── Jetson Orin Nano / Servidor local
│   ├── DeepCamera (análisis local)
│   ├── Cámaras (RTSP, USB, IP)
│   ├── MQTT Client
│   └── Almacenamiento local
│
└── Red local privada

SERVIDOR JVH (Dashboard + Alertas)
├── API REST (Node.js/Express)
├── MQTT Broker (Mosquitto)
├── PostgreSQL (metadata + eventos)
├── Dashboard web (React)
├── Acceso remoto (SSH tunnel)
└── AWS cloud (pequeño)
```

---

## 📦 Stack Tecnológico

| Componente | Tecnología |
|-----------|-----------|
| **Edge (Cliente)** | DeepCamera (SharpAI) |
| **GPU** | NVIDIA Jetson Orin |
| **Modelos IA** | YOLO v11, InsightFace, Qwen VLM, SAM2 |
| **Comunicación** | MQTT + HTTPS |
| **Backend (Dashboard)** | Node.js + Express |
| **Frontend** | React + TailwindCSS |
| **Base de datos** | PostgreSQL |
| **Cache** | Redis |
| **Mensajes** | MQTT (Mosquitto) |
| **CI/CD** | GitHub Actions + Docker |
| **Hosting** | AWS (pequeño) + Edge local |

---

## 📋 Requisitos Hardware (Cliente)

### Opción A: Jetson Orin Nano
- GPU: NVIDIA Ampere (100 TFLOPS)
- CPU: 12 cores ARM
- RAM: 8 GB
- Precio: ~$800
- Cámaras: 1-3 simultáneas

### Opción B: Mini PC con GPU
- GPU: NVIDIA RTX 3060+
- RAM: 16 GB
- Precio: $500-1,000
- Cámaras: 5-10 simultáneas

### Opción C: Servidor existente
- Cualquier servidor con GPU NVIDIA
- Docker sooportado

---

## 🚀 Fases de Desarrollo

### **Fase 1: Setup Local (En progreso)**
- [ ] Setup DeepCamera en equipo de pruebas
- [ ] Instalar Jetson Orin
- [ ] Probar con cámaras reales
- [ ] Validar detecciones

**Duración:** 2-4 semanas
**Entregables:** DeepCamera funcional local

### **Fase 2: Backend (Próxima)**
- [ ] API REST (Node.js)
- [ ] PostgreSQL schema
- [ ] MQTT Broker
- [ ] Autenticación + API keys

**Duración:** 4-6 semanas
**Entregables:** API funcional, integración MQTT

### **Fase 3: Frontend (Después)**
- [ ] Dashboard React
- [ ] Alertas real-time
- [ ] Búsqueda + reportes
- [ ] Control remoto

**Duración:** 4-6 semanas
**Entregables:** Dashboard MVP

### **Fase 4: Testing (Post MVP)**
- [ ] 3-5 clientes piloto
- [ ] Casos de uso reales
- [ ] Optimizaciones
- [ ] Documentación

**Duración:** 4-6 semanas

---

## 📂 Estructura de Carpetas

```
deepcamera-jvh/
├── README.md
├── LICENSE (MIT)
├── CHANGELOG.md
├── docker-compose.yml
├── .env.example
│
├── edge/                    # Cliente (Jetson)
│   ├── docker-compose.yml   # DeepCamera local
│   ├── config/
│   │   ├── deepcamera.conf
│   │   └── cameras.json
│   └── scripts/
│       ├── install.sh
│       └── run.sh
│
├── backend/                 # API + MQTT
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── config/
│   │   ├── db.js
│   │   ├── mqtt.js
│   │   └── auth.js
│   ├── routes/
│   │   ├── api.js
│   │   ├── alerts.js
│   │   └── customers.js
│   ├── handlers/
│   │   ├── alertHandler.js
│   │   └── customerHandler.js
│   └── db/
│       └── schema.sql
│
├── frontend/                # Dashboard
│   ├── package.json
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Alerts.jsx
│   │   │   └── Reports.jsx
│   │   ├── components/
│   │   │   ├── CameraGrid.jsx
│   │   │   ├── AlertsList.jsx
│   │   │   └── AccessControl.jsx
│   │   └── utils/
│   │       └── api.js
│   └── public/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   └── USER_GUIDE.md
│
└── tests/
    ├── edge/
    ├── backend/
    └── frontend/
```

---

## 🔒 Seguridad

- ✅ Datos locales NO salen del cliente (solo alertas)
- ✅ MQTT con TLS
- ✅ API HTTPS
- ✅ Autenticación por API key
- ✅ 2FA en dashboard
- ✅ Logs auditados
- ✅ SSH tunnel para acceso remoto

---

## 💰 Costos Estimados

### Hardware Inicial (Cliente)
```
Jetson Orin Nano         $800
Cámaras (2x)             $600
SSD USB (almacenamiento) $100
─────────────────────────────
TOTAL:                  $1,500/cliente
```

### Mensual (Proveedor JVH)
```
AWS (pequeño)            $90/mes
Operaciones              $500-1,000/mes
──────────────────────────────
TOTAL:                  $600-1,100/mes

Por cliente SaaS:        $300-500/mes
Para 50 clientes:       $15,000-25,000/mes ingresos
```

---

## 📞 Contacto & Soporte

- **Repositorio:** https://github.com/Nahj2023/deepcamera-jvh
- **Issues:** GitHub Issues
- **Documentación:** `/docs/`
- **Email:** soporte@jvhsoporte.cl

---

## 📜 Licencia

MIT License — Libre para uso comercial

```
Copyright (c) 2026 JVH Soporte SpA

Permission is hereby granted, free of charge...
```

---

**Última actualización:** 2026-03-22
**Versión:** 0.1.0-alpha (desarrollo)
