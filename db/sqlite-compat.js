/**
 * SQLite Compatibility Layer (CJS)
 * Wraps sql.js (asm.js) — no native compilation needed
 */

const initSqlJs = require('sql.js/dist/sql-asm.js');
const fs = require('fs');
const path = require('path');

class Statement {
  constructor(db, sql) {
    this._db = db;
    this._sql = sql;
  }

  run(...params) {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    this._db._db.run(this._sql, flatParams);
    this._db._save();
    return {
      changes: this._db._db.getRowsModified(),
      lastInsertRowid: this._getLastInsertRowid()
    };
  }

  get(...params) {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    try {
      const stmt = this._db._db.prepare(this._sql);
      if (flatParams.length > 0) stmt.bind(flatParams);
      if (stmt.step()) {
        const result = stmt.getAsObject();
        stmt.free();
        return result;
      }
      stmt.free();
    } catch (e) {}
    return undefined;
  }

  all(...params) {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const results = [];
    try {
      const stmt = this._db._db.prepare(this._sql);
      if (flatParams.length > 0) stmt.bind(flatParams);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
    } catch (e) {}
    return results;
  }

  _getLastInsertRowid() {
    try {
      const stmt = this._db._db.prepare('SELECT last_insert_rowid() as id');
      stmt.step();
      const row = stmt.getAsObject();
      stmt.free();
      return row.id;
    } catch {
      return 0;
    }
  }
}

class Database {
  constructor(sqlDb, dbPath) {
    this._db = sqlDb;
    this._path = dbPath;
  }

  static async create(dbPath) {
    const SQL = await initSqlJs();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let sqlDb;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      sqlDb = new SQL.Database(buffer);
    } else {
      sqlDb = new SQL.Database();
    }
    return new Database(sqlDb, dbPath);
  }

  pragma(str) {
    try { this._db.run('PRAGMA ' + str); } catch (e) {}
  }

  exec(sql) {
    this._db.run(sql);
    this._save();
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  close() {
    this._save();
    this._db.close();
  }

  _save() {
    try {
      const data = this._db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this._path, buffer);
    } catch (e) {
      console.error('[DB] Error saving:', e.message);
    }
  }
}

module.exports = Database;
