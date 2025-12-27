// server.js - versión actualizada con Content Security Policy (CSP) via helmet
// Nota:
// - Esta configuración permite ciertas fuentes externas necesarias para la demo
//   (APIs públicas de Roblox, ngrok local API, etc).
// - Para máxima seguridad evita 'unsafe-inline' y mueve scripts/estilos a archivos externos.
//   Aquí incluimos 'unsafe-inline' temporalmente para compatibilidad con demos locales donde hay código inline.
// - Requiere Node 18+ (uso de fetch global). Si usas Node 16 instala `node-fetch` y adáptalo.

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RESP_FILE = path.join(DATA_DIR, 'responses.json');
const LOGINS_FILE = path.join(DATA_DIR, 'logins.json');

async function ensureDataFiles() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch(e){}
  for (const f of [USERS_FILE, RESP_FILE, LOGINS_FILE]) {
    try {
      await fs.access(f);
    } catch (e) {
      await fs.writeFile(f, '[]', 'utf8');
    }
  }
}
ensureDataFiles();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // en producción configura orígenes específicos

// Seguridad: Helmet con CSP
// IMPORTANTE: 'unsafe-inline' debilita CSP — retíralo moviendo scripts/styles a archivos externos.
// Aquí se permite transitoriamente para demos locales con inline scripts/styles.
app.use(helmet({
  // otras cabeceras de helmet por defecto ya están activas
}));

const cspDirectives = {
  defaultSrc: ["'self'"],
  // Si tienes scripts inline en tu HTML y no usas nonces/hashes, 'unsafe-inline' será necesario.
  // Para mayor seguridad: mueve scripts a /public/main.js y elimina 'unsafe-inline' de scriptSrc.
  scriptSrc: [
    "'self'",
    "'unsafe-inline'"
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    'https:'
  ],
  imgSrc: [
    "'self'",
    'data:',
    'https:'
  ],
  connectSrc: [
    "'self'",
    // APIs que la demo usa
    'https://thumbnails.roblox.com',
    'https://api.roblox.com',
    // Si usas ngrok local, la API local en :4040 puede consultarse desde el cliente (dev)
    'http://127.0.0.1:4040',
    // Puedes añadir dominios públicos que necesites (ej: para proxys)
    'https://api.ngrok.com',
    'https://*.ngrok.io',
    'wss://*.ngrok.io'
  ],
  frameAncestors: ["'none'"],
  objectSrc: ["'none'"]
};

// Aplica CSP con helmet
app.use(helmet.contentSecurityPolicy({
  directives: cspDirectives
}));

// Rate limit para rutas sensibles
const authLimiter = rateLimit({
  windowMs: 60*1000, // 1 minuto
  max: 8,
  message: { error: 'Demasiados intentos. Intenta más tarde.' }
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000 } // 1 día
}));

// servir archivos estáticos desde public/
app.use('/', express.static(path.join(__dirname, 'public')));

// helpers para leer/escribir JSON
async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw || '[]');
}
async function writeJson(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2), 'utf8');
}

// endpoint para registrar usuario local (demo)
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    let { username, password } = req.body;
    username = String(username || '').trim();
    password = String(password || '');
    if (!username || username.length < 2) return res.status(400).json({ error: 'Nombre de usuario inválido' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    if (!/^[A-Za-z0-9_-]{2,32}$/.test(username)) return res.status(400).json({ error: 'Usuario sólo letras/números/_- permitidos' });

    const users = await readJson(USERS_FILE);
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'Usuario ya existe' });
    }
    const hash = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now(), username, passwordHash: hash, avatarUrl: '', createdAt: new Date().toISOString() };
    users.push(newUser);
    await writeJson(USERS_FILE, users);
    req.session.userId = newUser.id;
    res.json({ ok: true, username: newUser.username, id: newUser.id });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// endpoint para login
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    let { username, password } = req.body;
    username = String(username || '').trim();
    password = String(password || '');
    if (!username || !password) return res.status(400).json({ error: 'Credenciales incompletas' });

    const users = await readJson(USERS_FILE);
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Usuario/contraseña inválidos' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Usuario/contraseña inválidos' });

    req.session.userId = user.id;
    res.json({ ok: true, username: user.username, id: user.id, avatarUrl: user.avatarUrl || '' });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// obtener usuario actual
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ logged: false });
  const users = await readJson(USERS_FILE);
  const user = users.find(u => u.id === req.session.userId);
  if (!user) return res.json({ logged: false });
  res.json({ logged: true, username: user.username, avatarUrl: user.avatarUrl || '' });
});

// actualizar avatar de usuario (opcional) - guarda la URL (no la imagen)
app.post('/api/me/avatar', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  const { avatarUrl } = req.body;
  const users = await readJson(USERS_FILE);
  const idx = users.findIndex(u => u.id === req.session.userId);
  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
  users[idx].avatarUrl = avatarUrl || '';
  await writeJson(USERS_FILE, users);
  res.json({ ok: true });
});

// endpoint que consulta API pública de Roblox y devuelve la URL de miniatura (server-side)
// Evita problemas de CORS en el cliente al hacer fetch desde el servidor.
app.get('/api/avatar/:username', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Falta username' });

    // obtener id de usuario
    const ures = await fetch(`https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`);
    if (!ures.ok) return res.status(502).json({ error: 'Error consultando Roblox' });
    const ud = await ures.json();
    if (!ud || !ud.Id) return res.status(404).json({ error: 'Usuario Roblox no encontrado' });
    const uid = ud.Id;

    // pedir thumbnail
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${uid}&size=150x150&format=Png&isCircular=false`);
    if (!thumbRes.ok) return res.status(502).json({ error: 'No se pudo obtener miniatura' });
    const j = await thumbRes.json();
    const imageUrl = j?.data?.[0]?.imageUrl || '';
    if (!imageUrl) return res.status(404).json({ error: 'Sin imagen' });
    res.json({ imageUrl });
  } catch (err) {
    console.warn('avatar endpoint error', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// guardar respuesta de encuesta (puede usarse sin sesión)
app.post('/api/saveResponse', async (req, res) => {
  try {
    const body = req.body || {};
    body.timestamp = new Date().toISOString();
    const arr = await readJson(RESP_FILE);
    arr.push(body);
    await writeJson(RESP_FILE, arr);
    res.json({ ok: true });
  } catch (err) {
    console.error('saveResponse error', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// guardar intento de login / registro (sin password)
app.post('/api/saveLogin', async (req, res) => {
  try {
    const { username, avatarUrl } = req.body || {};
    const entry = { username: String(username||'').trim(), avatarUrl: avatarUrl||'', timestamp: new Date().toISOString() };
    const arr = await readJson(LOGINS_FILE);
    arr.push(entry);
    await writeJson(LOGINS_FILE, arr);
    res.json({ ok: true });
  } catch (err) {
    console.error('saveLogin error', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// descargar recopilación (solo local; en producción proteger)
app.get('/api/download', async (req, res) => {
  try {
    const responses = await readJson(RESP_FILE);
    const logins = await readJson(LOGINS_FILE);
    res.json({ responses, logins });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.listen(PORT, ()=> {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Public files served from /public');
});