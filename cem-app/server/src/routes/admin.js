const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { db, UPLOADS_DIR } = require('../db');
const { signToken, requireAdmin } = require('../auth');
const { sendMail } = require('../mailer');
const { studentToJSON, DOCS_REQUERIDOS } = require('./public');

const router = express.Router();

const MODALIDADES = {
  modular: 'Modalidad Modular',
  prepa3: 'Preparatoria · 3 meses',
  prepa4: 'Preparatoria · 4 meses',
};

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
  if (!admin || username !== admin.username || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  const token = signToken({ sub: 'admin', username: admin.username });
  res.json({ token, username: admin.username, email: admin.email || '' });
});

// GET /api/admin/estudiantes
router.get('/estudiantes', requireAdmin, (req, res) => {
  const folios = db.prepare('SELECT folio FROM students ORDER BY created_at DESC').all().map(r => r.folio);
  res.json(folios.map(f => studentToJSON(f)));
});

// GET /api/admin/estudiantes/:folio
router.get('/estudiantes/:folio', requireAdmin, (req, res) => {
  const data = studentToJSON(req.params.folio);
  if (!data) return res.status(404).json({ error: 'No encontrado.' });
  res.json(data);
});

// PATCH /api/admin/estudiantes/:folio
router.patch('/estudiantes/:folio', requireAdmin, (req, res) => {
  const { folio } = req.params;
  const existing = db.prepare('SELECT folio FROM students WHERE folio = ?').get(folio);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  const { inscripcionPagada, status } = req.body || {};
  if (status && !['activo', 'suspendido'].includes(status)) return res.status(400).json({ error: 'Estatus inválido.' });
  db.prepare('UPDATE students SET inscripcion_pagada = ?, status = ? WHERE folio = ?')
    .run(inscripcionPagada ? 1 : 0, status || 'activo', folio);
  res.json(studentToJSON(folio));
});

// DELETE /api/admin/estudiantes/:folio
router.delete('/estudiantes/:folio', requireAdmin, (req, res) => {
  const { folio } = req.params;
  db.prepare('DELETE FROM payments WHERE folio = ?').run(folio);
  db.prepare('DELETE FROM documents WHERE folio = ?').run(folio);
  db.prepare('DELETE FROM students WHERE folio = ?').run(folio);
  const dir = require('path').join(UPLOADS_DIR, folio);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

// POST /api/admin/estudiantes/:folio/pagos
router.post('/estudiantes/:folio/pagos', requireAdmin, (req, res) => {
  const { folio } = req.params;
  const existing = db.prepare('SELECT folio FROM students WHERE folio = ?').get(folio);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  const { concepto, day, month, year, monto } = req.body || {};
  if (!monto || Number(monto) <= 0) return res.status(400).json({ error: 'Monto inválido.' });
  db.prepare('INSERT INTO payments (folio, concepto, day, month, year, monto, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(folio, concepto || 'Colegiatura', Number(day), Number(month), Number(year), Number(monto), new Date().toISOString());
  res.json(studentToJSON(folio));
});

// DELETE /api/admin/estudiantes/:folio/pagos/:id
router.delete('/estudiantes/:folio/pagos/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM payments WHERE id = ? AND folio = ?').run(req.params.id, req.params.folio);
  res.json(studentToJSON(req.params.folio));
});

// GET /api/admin/export
router.get('/export', requireAdmin, async (req, res) => {
  const folios = db.prepare('SELECT folio FROM students ORDER BY created_at DESC').all().map(r => r.folio);
  const students = folios.map(f => studentToJSON(f));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Alumnos');
  ws.columns = [
    { header: 'Folio', key: 'folio', width: 16 },
    { header: 'Alumno', key: 'alumno', width: 26 },
    { header: 'CURP', key: 'curp', width: 20 },
    { header: 'Fecha de nacimiento', key: 'nacimiento', width: 18 },
    { header: 'Grado/Nivel', key: 'grado', width: 16 },
    { header: 'Modalidad', key: 'modalidad', width: 22 },
    { header: 'Tutor', key: 'tutor', width: 26 },
    { header: 'Teléfono tutor', key: 'telefono', width: 16 },
    { header: 'Correo tutor', key: 'correo', width: 26 },
    { header: 'Inscripción pagada', key: 'inscripcion', width: 18 },
    { header: 'Estatus', key: 'status', width: 14 },
    { header: 'Documentos completos', key: 'docs', width: 20 },
    { header: 'Total pagado colegiaturas', key: 'total', width: 22 },
    { header: 'Último pago', key: 'ultimo', width: 16 },
    { header: 'Fecha de registro', key: 'creado', width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  students.forEach(s => {
    const total = s.pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
    const ultimo = s.pagos.length ? s.pagos[s.pagos.length - 1] : null;
    const docsCompletos = DOCS_REQUERIDOS.every(d => s.documentos[d.key]);
    ws.addRow({
      folio: s.folio, alumno: s.student.nombre, curp: s.student.curp, nacimiento: s.student.nacimiento,
      grado: s.student.grado, modalidad: MODALIDADES[s.modalidad] || s.modalidad, tutor: s.tutor.nombre,
      telefono: s.tutor.telefono, correo: s.tutor.correo, inscripcion: s.inscripcionPagada ? 'Sí' : 'No',
      status: s.status, docs: docsCompletos ? 'Sí' : 'No', total,
      ultimo: ultimo ? `${ultimo.day}/${ultimo.month}/${ultimo.year}` : '', creado: (s.createdAt || '').slice(0, 10),
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="CEM_control_escolar_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// POST /api/admin/change-password
router.post('/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
  if (!bcrypt.compareSync(currentPassword || '', admin.password_hash)) {
    return res.status(400).json({ error: 'La contraseña actual no coincide.' });
  }
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'La nueva contraseña es muy corta.' });
  db.prepare('UPDATE admin SET password_hash = ? WHERE id = 1').run(bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
});

// POST /api/admin/account/email
router.post('/account/email', requireAdmin, (req, res) => {
  const { email } = req.body || {};
  db.prepare('UPDATE admin SET email = ? WHERE id = 1').run((email || '').trim());
  res.json({ ok: true });
});

// POST /api/admin/forgot-password  (público)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
  const generic = { ok: true, message: 'Si el correo está registrado, se envió un código de verificación.' };
  if (!admin.email || !email || email.toLowerCase() !== admin.email.toLowerCase()) {
    return res.json(generic); // no revelar si coincide o no
  }
  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = bcrypt.hashSync(code, 10);
  db.prepare('UPDATE admin SET reset_code_hash = ?, reset_code_expires = ? WHERE id = 1')
    .run(codeHash, Date.now() + 15 * 60 * 1000);
  await sendMail({
    to: admin.email,
    subject: 'Código de recuperación - Panel CEM',
    html: `<p>Tu código de recuperación es: <strong>${code}</strong></p><p>Vence en 15 minutos.</p>`,
  }).catch(err => console.error('[CEM] Error enviando código de recuperación:', err.message));
  res.json(generic);
});

// POST /api/admin/reset-password (público, requiere código)
router.post('/reset-password', (req, res) => {
  const { code, newPassword } = req.body || {};
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
  if (!admin.reset_code_hash || Date.now() > (admin.reset_code_expires || 0)) {
    return res.status(400).json({ error: 'El código expiró o no existe. Solicita uno nuevo.' });
  }
  if (!code || !bcrypt.compareSync(code, admin.reset_code_hash)) {
    return res.status(400).json({ error: 'Código incorrecto.' });
  }
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'La nueva contraseña es muy corta.' });
  db.prepare('UPDATE admin SET password_hash = ?, reset_code_hash = NULL, reset_code_expires = NULL WHERE id = 1')
    .run(bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
});

module.exports = { router };
