require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { router: publicRoutes } = require('./routes/public');
const { router: adminRoutes } = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Todas las rutas del front (usa hash-routing) sirven el mismo index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Manejador global de errores (incluye errores de Multer: tipo de archivo o tamaño inválido)
app.use((err, req, res, next) => {
  if (!err) return next();
  console.error('[CEM] Error:', err.message);
  const status = err.status || 400;
  res.status(status).json({ error: err.message || 'Ocurrió un error al procesar la solicitud.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[CEM] Servidor corriendo en el puerto ${PORT}`);
});
