const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { db, UPLOADS_DIR } = require('../db');
const { sendMail } = require('../mailer');

const router = express.Router();

const DOCS_REQUERIDOS = [
  { key: 'acta', label: 'Acta de nacimiento' },
  { key: 'curp_doc', label: 'CURP (documento)' },
  { key: 'domicilio', label: 'Comprobante de domicilio' },
  { key: 'certificado', label: 'Certificado o boleta de estudios previos' },
  { key: 'ine_tutor', label: 'INE del padre, madre o tutor' },
];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Solo se aceptan archivos PDF.'));
    cb(null, true);
  },
});

function nextFolio() {
  const year = new Date().getFullYear();
  const row = db.prepare('SELECT value FROM counter WHERE id = 1').get();
  const n = (row?.value || 0) + 1;
  db.prepare('UPDATE counter SET value = ? WHERE id = 1').run(n);
  return `CEM-${year}-${String(n).padStart(4, '0')}`;
}

function studentToJSON(folio) {
  const s = db.prepare('SELECT * FROM students WHERE folio = ?').get(folio);
  if (!s) return null;
  const docs = db.prepare('SELECT doc_key, filename, uploaded_at FROM documents WHERE folio = ?').all(folio);
  const payments = db.prepare('SELECT id, concepto, day, month, year, monto FROM payments WHERE folio = ? ORDER BY id ASC').all(folio);
  const documentos = {};
  docs.forEach(d => { documentos[d.doc_key] = { filename: d.filename, uploadedAt: d.uploaded_at }; });
  return {
    folio: s.folio,
    modalidad: s.modalidad,
    createdAt: s.created_at,
    student: { nombre: s.nombre, nacimiento: s.nacimiento, curp: s.curp, grado: s.grado },
    tutor: { nombre: s.tutor_nombre, telefono: s.tutor_telefono, correo: s.tutor_correo },
    documentos,
    pagos: payments.map(p => ({ id: p.id, concepto: p.concepto, day: p.day, month: p.month, year: p.year, monto: p.monto })),
    inscripcionPagada: !!s.inscripcion_pagada,
    status: s.status,
  };
}

function saveDocFile(folio, key, file) {
  const dir = path.join(UPLOADS_DIR, folio);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `${key}.pdf`);
  fs.writeFileSync(filepath, file.buffer);
  db.prepare(`
    INSERT INTO documents (folio, doc_key, filename, filepath, uploaded_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(folio, doc_key) DO UPDATE SET filename=excluded.filename, filepath=excluded.filepath, uploaded_at=excluded.uploaded_at
  `).run(folio, key, file.originalname, filepath, new Date().toISOString());
}

// POST /api/registro
router.post('/registro', upload.fields(DOCS_REQUERIDOS.map(d => ({ name: d.key, maxCount: 1 }))), async (req, res) => {
  try {
    const b = req.body;
    const required = ['modalidad', 'nombre', 'nacimiento', 'curp', 'grado', 'tutorNombre', 'tutorTelefono', 'tutorCorreo'];
    for (const f of required) {
      if (!b[f] || !String(b[f]).trim()) return res.status(400).json({ error: `Falta el campo obligatorio: ${f}` });
    }
    const missing = DOCS_REQUERIDOS.filter(d => !(req.files && req.files[d.key] && req.files[d.key][0]));
    if (missing.length) return res.status(400).json({ error: `Faltan documentos: ${missing.map(d => d.label).join(', ')}` });

    const folio = nextFolio();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO students (folio, modalidad, nombre, nacimiento, curp, grado, tutor_nombre, tutor_telefono, tutor_correo, inscripcion_pagada, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'activo', ?)
    `).run(folio, b.modalidad, b.nombre.trim(), b.nacimiento, b.curp.trim().toUpperCase(), b.grado.trim(), b.tutorNombre.trim(), b.tutorTelefono.trim(), b.tutorCorreo.trim(), now);

    for (const d of DOCS_REQUERIDOS) saveDocFile(folio, d.key, req.files[d.key][0]);

    const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/#/estudiante?folio=${encodeURIComponent(folio)}`;
    sendMail({
      to: b.tutorCorreo.trim(),
      subject: `Preinscripción recibida - Folio ${folio}`,
      html: `<p>Hola ${b.tutorNombre.trim()},</p>
             <p>Recibimos la preinscripción de <strong>${b.nombre.trim()}</strong> en el Centro Educativo CEM.</p>
             <p>Tu folio es: <strong>${folio}</strong></p>
             <p>Puedes consultar el estado del registro en cualquier momento aquí: <a href="${link}">${link}</a></p>`,
    }).catch(err => console.error('[CEM] Error enviando correo de confirmación:', err.message));

    res.json({ folio });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al procesar el registro.' });
  }
});

// GET /api/estudiante/:folio
router.get('/estudiante/:folio', (req, res) => {
  const data = studentToJSON(req.params.folio);
  if (!data) return res.status(404).json({ error: 'No se encontró ningún registro con ese folio.' });
  res.json(data);
});

// POST /api/estudiante/:folio/documento/:key  (subir documento faltante)
router.post('/estudiante/:folio/documento/:key', upload.single('file'), (req, res) => {
  const { folio, key } = req.params;
  const valid = DOCS_REQUERIDOS.some(d => d.key === key);
  if (!valid) return res.status(400).json({ error: 'Documento no reconocido.' });
  const student = db.prepare('SELECT folio FROM students WHERE folio = ?').get(folio);
  if (!student) return res.status(404).json({ error: 'Folio no encontrado.' });
  if (!req.file) return res.status(400).json({ error: 'Adjunta un archivo PDF.' });
  try {
    saveDocFile(folio, key, req.file);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar el documento.' });
  }
});

// GET /api/documento/:folio/:key (ver/descargar PDF)
router.get('/documento/:folio/:key', (req, res) => {
  const row = db.prepare('SELECT filepath, filename FROM documents WHERE folio = ? AND doc_key = ?').get(req.params.folio, req.params.key);
  if (!row || !fs.existsSync(row.filepath)) return res.status(404).send('Documento no encontrado.');
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(row.filepath);
});

module.exports = { router, DOCS_REQUERIDOS, studentToJSON };
