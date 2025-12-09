
const ui = {
  tableBody: null,
  perSubject: null,
  overallValue: null,
  totalGrades: null,
  emptyState: null,
  emptyStateDefault: '',
  form: null,
  toastRegion: null,
  themeToggle: null
};

const state = {
  lastSummary: null,
  theme: 'light',
  hasManualTheme: false
};

const THEME_STORAGE_KEY = 'voti-dashboard-theme';
let systemThemeMedia = null;

function init() {
  ui.tableBody = document.getElementById('gradesTable');
  ui.perSubject = document.getElementById('perSubject');
  ui.overallValue = document.querySelector('[data-overall-value]');
  ui.totalGrades = document.querySelector('[data-total-grades]');
  ui.emptyState = document.querySelector('[data-empty-state]');
  ui.form = document.getElementById('gradeForm');
  ui.themeToggle = document.querySelector('[data-theme-toggle]');
  initializeTheme();
  if (ui.themeToggle) {
    ui.themeToggle.addEventListener('click', handleThemeToggleClick);
  }

  ui.toastRegion = ensureToastRegion();

  if (ui.emptyState) {
    ui.emptyStateDefault = ui.emptyState.textContent.trim();
  }

  if (ui.form) {
    ui.form.addEventListener('submit', handleSubmit);
  }

  fetchGrades();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

async function fetchGrades() {
  if (!ui.tableBody) return [];

  try {
    const response = await fetch('/api/grades', {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || 'Impossibile caricare i voti');
    }

    const grades = Array.isArray(payload.grades) ? payload.grades : [];
    renderGrades(grades);
    toggleEmptyState(grades.length === 0);
    return grades;
  } catch (err) {
    console.error('[fetchGrades] error', err);
    ui.tableBody.innerHTML = '';
    toggleEmptyState(true, 'Impossibile caricare i voti. Riprova più tardi.');
    return [];
  } finally {
    try {
      await updateSummary();
    } catch (summaryErr) {
      console.error(summaryErr);
    }
  }
}

function renderGrades(grades) {
  if (!ui.tableBody) return;

  ui.tableBody.innerHTML = '';
  if (!Array.isArray(grades) || grades.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();

  grades.forEach((grade) => {
    const subjectText = grade.subject ? escapeHtml(grade.subject) : '—';
    const valueText = formatNumber(grade.value, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    const weightText = formatNumber(grade.weight ?? 1, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const noteText = grade.note ? escapeHtml(grade.note) : '—';
    const dateText = escapeHtml(formatDate(grade.createdAt || grade.date));
    const gradeId = grade.id ?? grade.ID ?? grade.rowid ?? grade.rowId ?? null;
    const tone = getGradeTone(grade.value);
    const toneClass = tone && tone !== 'neutral' ? `tone-${tone}` : '';
    const actionCellContent = gradeId != null
      ? `<button type="button" class="delete" data-id="${gradeId}">Elimina</button>`
      : '—';

    const tr = document.createElement('tr');
    tr.className = 'grade-row';
    if (gradeId != null) {
      tr.dataset.gradeId = String(gradeId);
    }
    if (grade.subject) {
      tr.dataset.subject = grade.subject;
    }
    if (Number.isFinite(Number(grade.value))) {
      tr.dataset.value = String(grade.value);
    }
    if (toneClass) {
      tr.dataset.tone = tone;
    }

    tr.innerHTML = `
      <td data-label="Materia">${subjectText}</td>
      <td data-label="Voto"><span class="grade-pill ${toneClass}">${valueText}</span></td>
      <td data-label="Peso">${weightText}</td>
      <td data-label="Nota">${noteText}</td>
      <td data-label="Data">${dateText}</td>
      <td data-label="Azioni">${actionCellContent}</td>
    `;
    fragment.appendChild(tr);
  });

  ui.tableBody.appendChild(fragment);
  bindDeleteHandlers();
}

function bindDeleteHandlers() {
  if (!ui.tableBody) return;

  ui.tableBody.querySelectorAll('button.delete[data-id]').forEach((button) => {
    button.addEventListener('click', handleDeleteClick, { once: true });
  });
}

async function handleDeleteClick(event) {
  const button = event.currentTarget;
  const rawId = button.dataset.id;
  const gradeId = Number(rawId);
  const row = button.closest('tr');
  const subject = row?.dataset.subject || row?.querySelector('td')?.textContent?.trim() || 'Voto';
  const value = Number.parseFloat(row?.dataset.value ?? '');

  if (!Number.isFinite(gradeId)) {
    console.warn('[handleDeleteClick] invalid id', rawId);
    return;
  }

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch(`/api/grades/${gradeId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    await fetchGrades();
    const average = state.lastSummary?.overallAverage;
    showToast({
      title: 'Voto rimosso',
      message: `${subject}${Number.isFinite(value) ? ` (${value.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 })})` : ''}`,
      type: 'info',
      meta: Number.isFinite(average) ? `Media aggiornata: ${formatNumber(average, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : undefined
    });
  } catch (err) {
    console.error('[handleDeleteClick] error', err);
    showToast({
      title: 'Errore eliminazione',
      message: 'Non è stato possibile eliminare il voto. Riprova più tardi.',
      type: 'error'
    });
  } finally {
    if (button.isConnected) {
      button.removeAttribute('aria-busy');
      button.disabled = false;
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!ui.form) return;

  const subjectInput = document.getElementById('subject');
  const valueInput = document.getElementById('value');
  const weightInput = document.getElementById('weight');
  const noteInput = document.getElementById('note');

  const subject = subjectInput.value.trim();
  const value = Number.parseFloat(valueInput.value);
  const weightRaw = weightInput.value.trim();
  const weight = weightRaw === '' ? 1 : Number.parseFloat(weightRaw);
  const note = noteInput.value.trim();

  if (!subject || !Number.isFinite(value)) {
    valueInput.focus();
    valueInput.reportValidity?.();
    return;
  }

  const payload = {
    subject,
    value,
    weight: Number.isFinite(weight) ? weight : 1,
    note
  };

  const submitButton = ui.form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
  }

  try {
    const response = await fetch('/api/grades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    ui.form.reset();
    await fetchGrades();
    const average = state.lastSummary?.overallAverage;
    showToast({
      title: 'Voto aggiunto',
      message: `${subject} (${formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 2 })})`,
      type: 'success',
      meta: Number.isFinite(average) ? `Media aggiornata: ${formatNumber(average, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : undefined
    });
  } catch (err) {
    console.error('[handleSubmit] error', err);
    showToast({
      title: 'Errore salvataggio',
      message: err.message || 'Non è stato possibile aggiungere il voto.',
      type: 'error'
    });
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  }
}

function toggleEmptyState(show, message) {
  if (!ui.emptyState) return;

  if (show) {
    ui.emptyState.hidden = false;
    ui.emptyState.textContent = message ?? ui.emptyStateDefault;
  } else {
    ui.emptyState.hidden = true;
    ui.emptyState.textContent = ui.emptyStateDefault;
  }
}

function formatNumber(value, { minimumFractionDigits = 0, maximumFractionDigits = 2 } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '—';
  }

  return numericValue.toLocaleString('it-IT', {
    minimumFractionDigits,
    maximumFractionDigits
  });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function escapeHtml(s){
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const TONE_CLASSNAMES = ['tone-positive', 'tone-warning', 'tone-negative'];

function getGradeTone(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'neutral';
  if (numeric >= 6) return 'positive';
  if (numeric >= 5) return 'warning';
  return 'negative';
}

function applyToneClass(element, tone) {
  if (!element) return;
  TONE_CLASSNAMES.forEach((cls) => element.classList.remove(cls));
  if (!tone || tone === 'neutral') return;
  const targetClass = `tone-${tone}`;
  if (!TONE_CLASSNAMES.includes(targetClass)) return;
  element.classList.add(targetClass);
}

async function updateSummary() {
  if (!ui.perSubject || !ui.overallValue) return;

  try {
    const response = await fetch('/api/summary', {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || 'Errore durante il caricamento del riepilogo');
    }

    const summary = payload.summary || {};
    const overallAverage = Number(summary.overallAverage);
    const perSubject = Array.isArray(summary.perSubject) ? summary.perSubject : [];
    const totalGrades = Number.isFinite(Number(summary.totalGrades)) ? Number(summary.totalGrades) : perSubject.reduce((acc, item) => acc + (item.count || 0), 0);
    const hasGrades = totalGrades > 0 && Number.isFinite(overallAverage);

    ui.overallValue.textContent = hasGrades
      ? formatNumber(overallAverage, { minimumFractionDigits: 1, maximumFractionDigits: 2 })
      : '—';
    applyToneClass(ui.overallValue, hasGrades ? getGradeTone(overallAverage) : 'neutral');

    if (ui.totalGrades) {
      ui.totalGrades.textContent = `${totalGrades}`;
    }

    ui.perSubject.innerHTML = '';

    if (!perSubject.length) {
      ui.perSubject.classList.add('empty');
      state.lastSummary = { overallAverage: hasGrades ? overallAverage : null, perSubject, totalGrades };
      return;
    }

    ui.perSubject.classList.remove('empty');
    perSubject
      .slice()
      .sort((a, b) => a.subject.localeCompare(b.subject, 'it', { sensitivity: 'accent' }))
      .forEach((item) => {
        const tone = getGradeTone(item.average);
        const toneClass = tone && tone !== 'neutral' ? `tone-${tone}` : '';
        const card = document.createElement('div');
        card.className = `subject-card ${toneClass}`.trim();
        card.innerHTML = `
          <span>${escapeHtml(item.subject)}</span>
          <strong>${formatNumber(item.average, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</strong>
          <small>${item.count} vot${item.count === 1 ? 'o' : 'i'}</small>
        `;
        ui.perSubject.appendChild(card);
      });

    state.lastSummary = { overallAverage: hasGrades ? overallAverage : null, perSubject, totalGrades };
  } catch (err) {
    console.error('[updateSummary] error', err);
    ui.overallValue.textContent = '—';
    applyToneClass(ui.overallValue, 'neutral');
    ui.perSubject.innerHTML = '';
    ui.perSubject.classList.add('empty');
    if (ui.totalGrades) {
      ui.totalGrades.textContent = '0';
    }
    state.lastSummary = null;
  }
}

// Toast utilities ---------------------------------------------------------

const TOAST_TIMEOUT = 4200;
const TOAST_ICONS = {
  success: '✔',
  info: 'ℹ',
  error: '⚠'
};

function ensureToastRegion() {
  const existing = document.querySelector('[data-toast-region]');
  if (existing) return existing;

  const region = document.createElement('div');
  region.setAttribute('data-toast-region', '');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-live', 'polite');
  region.className = 'toast-container';
  document.body.appendChild(region);
  return region;
}

function showToast({ title, message, meta, type = 'info' } = {}) {
  if (!ui.toastRegion) {
    ui.toastRegion = ensureToastRegion();
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  toast.innerHTML = `
    <span class="toast__icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <div class="toast__content">
      <strong class="toast__title">${escapeHtml(title || 'Notifica')}</strong>
      ${message ? `<span class="toast__message">${escapeHtml(message)}</span>` : ''}
      ${meta ? `<span class="toast__meta">${escapeHtml(meta)}</span>` : ''}
    </div>
    <button type="button" class="toast__close" aria-label="Chiudi notifica">×</button>
  `;

  const close = () => {
    toast.classList.add('toast--exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.toast__close').addEventListener('click', close, { once: true });

  ui.toastRegion.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });

  setTimeout(close, TOAST_TIMEOUT);
}

// Theme helpers -----------------------------------------------------------

function initializeTheme() {
  const storedTheme = readStoredTheme();
  state.hasManualTheme = Boolean(storedTheme);

  if (!systemThemeMedia && window.matchMedia) {
    try {
      systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
      if (typeof systemThemeMedia.addEventListener === 'function') {
        systemThemeMedia.addEventListener('change', handleSystemThemeChange);
      } else if (typeof systemThemeMedia.addListener === 'function') {
        systemThemeMedia.addListener(handleSystemThemeChange);
      }
    } catch (err) {
      systemThemeMedia = null;
    }
  }

  const initialTheme = storedTheme
    || (systemThemeMedia && systemThemeMedia.matches ? 'dark' : 'light');

  applyTheme(initialTheme, { persist: Boolean(storedTheme), announce: false });
}

function handleThemeToggleClick(event) {
  event.preventDefault();
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  state.hasManualTheme = true;
  applyTheme(nextTheme, { persist: true, announce: true });
}

function handleSystemThemeChange(event) {
  if (state.hasManualTheme) return;
  const nextTheme = event.matches ? 'dark' : 'light';
  if (state.theme === nextTheme) return;
  applyTheme(nextTheme, { persist: false, announce: true });
}

function applyTheme(theme, { persist = true, announce = false } = {}) {
  const isDark = theme === 'dark';
  state.theme = isDark ? 'dark' : 'light';

  document.body.classList.toggle('theme-dark', isDark);
  document.body.dataset.theme = state.theme;

  if (persist) {
    persistThemePreference(state.theme);
  }

  updateThemeToggle(state.theme);

  if (announce) {
    showToast({
      title: 'Tema aggiornato',
      message: isDark ? 'Modalità scura attivata' : 'Modalità chiara attivata',
      type: 'info'
    });
  }
}

function updateThemeToggle(theme) {
  const button = ui.themeToggle || document.querySelector('[data-theme-toggle]');
  if (!button) return;

  const isDark = theme === 'dark';
  button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  button.setAttribute('aria-label', isDark ? 'Attiva modalità chiara' : 'Attiva modalità scura');
  button.title = isDark ? 'Attiva modalità chiara' : 'Attiva modalità scura';

  const icon = button.querySelector('.btn-theme__icon');
  const label = button.querySelector('[data-theme-label]');

  if (icon) {
    icon.textContent = isDark ? '☀️' : '🌙';
  }
  if (label) {
    label.textContent = isDark ? 'Modalità chiara' : 'Modalità scura';
  }
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch (err) {
    console.warn('[theme] impossibile leggere la preferenza tema', err);
  }
  return null;
}

function persistThemePreference(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {
    console.warn('[theme] impossibile salvare la preferenza tema', err);
  }
}
