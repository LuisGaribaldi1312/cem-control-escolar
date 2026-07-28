const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'cem.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT DEFAULT '',
  reset_code_hash TEXT,
  reset_code_expires INTEGER
);

CREATE TABLE IF NOT EXISTS counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS students (
  folio TEXT PRIMARY KEY,
  modalidad TEXT NOT NULL,
  nombre TEXT NOT NULL,
  nacimiento TEXT,
  curp TEXT,
  grado TEXT,
  tutor_nombre TEXT NOT NULL,
  tutor_telefono TEXT NOT NULL,
  tutor_correo TEXT NOT NULL,
  inscripcion_pagada INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'activo',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  UNIQUE(folio, doc_key)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL,
  concepto TEXT NOT NULL,
  day INTEGER NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  monto REAL NOT NULL,
  created_at TEXT NOT NULL
);
`);

// Seed inicial: contador y administrador por defecto
const counterRow = db.prepare('SELECT * FROM counter WHERE id = 1').get();
if (!counterRow) db.prepare('INSERT INTO counter (id, value) VALUES (1, 0)').run();

const adminRow = db.prepare('SELECT * FROM admin WHERE id = 1').get();
if (!adminRow) {
  const username = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
  const password = process.env.ADMIN_DEFAULT_PASSWORD || '12345';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admin (id, username, password_hash, email) VALUES (1, ?, ?, ?)').run(username, hash, '');
  console.log(`[CEM] Administrador inicial creado -> usuario: ${username} (contraseña definida por variables de entorno o por defecto).`);
}

module.exports = { db, UPLOADS_DIR };
