const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const storage = require('./components/storage/storage');
const app = express();
const PORT = process.env.PORT || 3000;

// Log di tutte le richieste
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl} - Accepts: ${req.headers.accept || ''}`);
  next();
});

app.use(bodyParser.json());

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// API routes
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
    console.log('[POST /api/grades] body:', req.body);
    const { subject, value, weight = 1, note = '' } = req.body;
    if (!subject || typeof value !== 'number' || isNaN(value)) {
      console.log('[POST /api/grades] validation failed:', { subject, value });
      return res.status(400).json({ ok: false, error: 'subject e value (number) sono richiesti' });
    }
    const grade = await storage.addGrade({ subject, value, weight: Number(weight), note });
    console.log('[POST /api/grades] created:', grade);
    res.status(201).json({ ok: true, grade });
  } catch (err) {
    console.error('[POST /api/grades] error:', err && err.stack ? err.stack : err);
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

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();

  if (req.accepts('html')) {
    return res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) {
        console.error('Errore nel sendFile index.html:', err);
        next(err);
      }
    });
  }

  const candidate = path.join(publicDir, req.path);
  if (fs.existsSync(candidate)) {
    return res.sendFile(candidate);
  }

  res.status(404).send('Not found');
});

(async () => {
  try {
    await storage.init();
    app.listen(PORT, () => {
      console.log(`Server avviato su http://localhost:${PORT} (STORAGE=${process.env.STORAGE || 'sqlite'})`);
    });
  } catch (err) {
    console.error('Errore inizializzazione storage', err);
    process.exit(1);
  }
})();