const fs = require('fs').promises;
const path = require('path');

const STORAGE = (process.env.STORAGE || 'sqlite').toLowerCase();
// Percorsi file 
const JSON_FILE = path.join(__dirname, 'data.json');
const SQLITE_FILE = path.join(__dirname, 'grades.db');

let db = null;
let sqlite3 = null;

async function init() {
  if (STORAGE === 'json') {
    try {
      await fs.access(JSON_FILE);
    } catch {
      await fs.writeFile(JSON_FILE, JSON.stringify({ grades: [], nextId: 1 }, null, 2), 'utf8');
    }
    return;
  }

  // sqlite
  sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database(SQLITE_FILE);
  await run(`CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    value REAL NOT NULL,
    weight REAL NOT NULL DEFAULT 1,
    note TEXT,
    created_at TEXT NOT NULL
  )`);
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function getGrades() {
  if (STORAGE === 'json') {
    const raw = await fs.readFile(JSON_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.grades;
  } else {
    const rows = await all('SELECT * FROM grades ORDER BY created_at DESC');
    return rows;
  }
}

async function addGrade({ subject, value, weight = 1, note = '' }) {
  const created_at = new Date().toISOString();
  if (STORAGE === 'json') {
    const raw = await fs.readFile(JSON_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const id = parsed.nextId++;
    const grade = { id, subject, value: Number(value), weight: Number(weight), note, created_at };
    parsed.grades.unshift(grade);
    await fs.writeFile(JSON_FILE, JSON.stringify(parsed, null, 2), 'utf8');
    return grade;
  } else {
    const res = await run(
      'INSERT INTO grades (subject, value, weight, note, created_at) VALUES (?, ?, ?, ?, ?)',
      [subject, value, weight, note, created_at]
    );
    const id = res.lastID;
    return { id, subject, value, weight, note, created_at };
  }
}

async function removeGrade(id) {
  if (STORAGE === 'json') {
    const raw = await fs.readFile(JSON_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.grades = parsed.grades.filter(g => g.id !== id);
    await fs.writeFile(JSON_FILE, JSON.stringify(parsed, null, 2), 'utf8');
    return;
  } else {
    await run('DELETE FROM grades WHERE id = ?', [id]);
    return;
  }
}

async function getSummary() {
  const grades = await getGrades();
  // per materia: calcolo media pesata (weight) o aritmetica se tutti weight=1
  const subjects = {};
  for (const g of grades) {
    const w = g.weight && !isNaN(g.weight) ? Number(g.weight) : 1;
    const v = Number(g.value);
    if (!subjects[g.subject]) subjects[g.subject] = { totalWeighted: 0, totalWeight: 0, count: 0 };
    subjects[g.subject].totalWeighted += v * w;
    subjects[g.subject].totalWeight += w;
    subjects[g.subject].count += 1;
  }
  const perSubject = [];
  let overallTotalWeighted = 0;
  let overallTotalWeight = 0;
  for (const [subject, data] of Object.entries(subjects)) {
    const avg = data.totalWeight > 0 ? data.totalWeighted / data.totalWeight : 0;
    perSubject.push({ subject, average: Number(avg.toFixed(2)), count: data.count });
    overallTotalWeighted += data.totalWeighted;
    overallTotalWeight += data.totalWeight;
  }
  const overallAverage = overallTotalWeight > 0 ? Number((overallTotalWeighted / overallTotalWeight).toFixed(2)) : 0;
  // ordina per subject alfabetico
  perSubject.sort((a, b) => a.subject.localeCompare(b.subject));
  return { perSubject, overallAverage, totalGrades: grades.length };
}

module.exports = {
  init,
  getGrades,
  addGrade,
  removeGrade,
  getSummary
};