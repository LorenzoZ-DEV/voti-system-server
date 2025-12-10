const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const storage = require('./components/storage/storage');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Storewide2-Slaw9-Hacker9-Antitrust0-Maternity1';
const SESSION_SECRET = process.env.SESSION_SECRET || 'voti-dashboard-eZe00ZOuMH';
const publicDir = path.join(__dirname, 'public');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false //TODO IMPLLEMENTARE HTTPS QUANDO SI HA IL DOMINIO
  }
}));

function isAuthenticated(req) {
  return Boolean(req.session && req.session.user && req.session.user.username === ADMIN_USERNAME);
}

function requireApiAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ ok: false, error: 'Non autenticato' });
}

function requirePageAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.redirect('/login');
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.user = { username: ADMIN_USERNAME };
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Credenziali non valide' });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  return requireApiAuth(req, res, next);
});

app.post('/api/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy((err) => {
    if (err) {
      console.error('[logout] errore distruzione sessione', err);
      return res.status(500).json({ ok: false, error: 'Errore durante il logout' });
    }
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

app.get('/api/grades', async (req, res) => {
  try {
    const grades = await storage.getGrades();
    res.json({ ok: true, grades });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Errore server' });
  }
});
app.post('/api/grades', async (req, res) => {
  try {
    const { subject, value, weight = 1, note = '' } = req.body;
    if (!subject || typeof value !== 'number' || isNaN(value)) {
      return res.status(400).json({ ok: false, error: 'subject e value (number) sono richiesti' });
    }
    const grade = await storage.addGrade({ subject, value, weight: Number(weight), note });
    res.status(201).json({ ok: true, grade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Errore server' });
  }
});

app.delete('/api/grades/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await storage.removeGrade(id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Errore server' });
  }
});

app.get('/api/summary', async (req, res) => {
  try {
    const summary = await storage.getSummary();
    res.json({ ok: true, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Errore server' });
  }
});

app.get('/login', (req, res) => {
  if (isAuthenticated(req)) {
    return res.redirect('/');
  }
  return res.sendFile(path.join(publicDir, 'login.html'));
});

app.use(express.static(publicDir, { index: false }));

app.get('/', requirePageAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/index.html', requirePageAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (!req.accepts('html')) {
    return res.status(404).send('Not found');
  }
  return requirePageAuth(req, res, () => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
});

(async () => {
  try {
    await storage.init();
    app.listen(PORT, () => {
      console.log(`[*] Server avviato su http://localhost:${PORT} (STORAGE=${process.env.STORAGE || 'sqlite'})`);
    });
  } catch (err) {
    console.error('[!] Errore inizializzazione storage', err);
    process.exit(1);
  }
})();