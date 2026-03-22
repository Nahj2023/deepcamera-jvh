/**
 * Detection Handler — Eventos YOLO desde edge Ryzen
 * DB: better-sqlite3 (sincrono)
 */

/**
 * Guarda un evento de deteccion recibido via MQTT
 * Llamado internamente desde server.js, no desde una ruta HTTP
 */
export const saveEvent = (db, payload) => {
  const stmt = db.prepare(`
    INSERT INTO dc_events (camera_id, timestamp, detections, counts, total, thumbnail, stats)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    payload.camera_id,
    payload.timestamp || new Date().toISOString(),
    JSON.stringify(payload.detections || []),
    JSON.stringify(payload.counts || {}),
    payload.total || 0,
    payload.thumbnail || null,
    JSON.stringify(payload.stats || {})
  );
};

/**
 * Actualiza o inserta el estado del edge (heartbeat)
 */
export const upsertEdgeStatus = (db, payload) => {
  // Mantener solo 1 registro de estado del edge
  const existing = db.prepare('SELECT id FROM dc_edge_status LIMIT 1').get();
  if (existing) {
    db.prepare(`
      UPDATE dc_edge_status
      SET cameras = ?, status = ?, last_seen = datetime('now')
      WHERE id = ?
    `).run(
      JSON.stringify(payload.cameras || []),
      payload.status || 'online',
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO dc_edge_status (cameras, status, last_seen)
      VALUES (?, ?, datetime('now'))
    `).run(
      JSON.stringify(payload.cameras || []),
      payload.status || 'online'
    );
  }
};

/**
 * GET /api/events
 * Lista eventos recientes con filtros opcionales
 * Query params: camera_id, limit (default 50), from, to
 */
export const getEvents = (req, res, db) => {
  const { camera_id, limit = 50, from, to } = req.query;

  let sql = 'SELECT id, camera_id, timestamp, counts, total, created_at FROM dc_events WHERE 1=1';
  const params = [];

  if (camera_id) {
    sql += ' AND camera_id = ?';
    params.push(camera_id);
  }
  if (from) {
    sql += ' AND created_at >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND created_at <= ?';
    params.push(to);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit, 10));

  try {
    const rows = db.prepare(sql).all(...params);
    // Parsear JSON fields
    const result = rows.map(r => ({
      ...r,
      counts: JSON.parse(r.counts || '{}')
    }));
    return res.json(result);
  } catch (err) {
    console.error('Get events error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/events/:id
 * Detalle de evento con thumbnail y detecciones completas
 */
export const getEventById = (req, res, db) => {
  const { id } = req.params;

  try {
    const row = db.prepare('SELECT * FROM dc_events WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Event not found' });

    return res.json({
      ...row,
      detections: JSON.parse(row.detections || '[]'),
      counts:     JSON.parse(row.counts || '{}'),
      stats:      JSON.parse(row.stats || '{}')
    });
  } catch (err) {
    console.error('Get event error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/events/latest
 * Ultimo evento por camara (para el dashboard principal)
 */
export const getLatestEvents = (req, res, db) => {
  try {
    const rows = db.prepare(`
      SELECT e.*
      FROM dc_events e
      INNER JOIN (
        SELECT camera_id, MAX(created_at) AS max_created
        FROM dc_events
        GROUP BY camera_id
      ) latest ON e.camera_id = latest.camera_id AND e.created_at = latest.max_created
      ORDER BY e.created_at DESC
    `).all();

    const result = rows.map(r => ({
      ...r,
      detections: JSON.parse(r.detections || '[]'),
      counts:     JSON.parse(r.counts || '{}'),
      stats:      JSON.parse(r.stats || '{}')
    }));
    return res.json(result);
  } catch (err) {
    console.error('Get latest events error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/edge-status
 * Estado del edge (online/offline, ultima vez visto)
 * El frontend usa esto para mostrar el indicador de conexion
 */
export const getEdgeStatus = (req, res, db) => {
  try {
    const row = db.prepare('SELECT * FROM dc_edge_status LIMIT 1').get();

    if (!row) {
      return res.json({ status: 'unknown', last_seen: null, cameras: [] });
    }

    // Si el last_seen tiene mas de 2 minutos, considerarlo offline
    const lastSeen = new Date(row.last_seen);
    const diffMs   = Date.now() - lastSeen.getTime();
    const isOnline  = diffMs < 2 * 60 * 1000;

    return res.json({
      status:    isOnline ? 'online' : 'offline',
      last_seen: row.last_seen,
      cameras:   JSON.parse(row.cameras || '[]')
    });
  } catch (err) {
    console.error('Get edge status error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
