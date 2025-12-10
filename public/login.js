const THEME_STORAGE_KEY = 'voti-dashboard-theme';
const state = {
  theme: 'light',
  manualTheme: false
};
let themeMediaQuery = null;
let toastRegion = null;

document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupLoginForm();
});

function setupTheme() {
  const storedTheme = readStoredTheme();
  state.manualTheme = Boolean(storedTheme);

  if (window.matchMedia) {
    try {
      themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      themeMediaQuery.addEventListener('change', handleSystemThemeChange);
    } catch (err) {
      themeMediaQuery = null;
    }
  }

  const initialTheme = storedTheme || (themeMediaQuery && themeMediaQuery.matches ? 'dark' : 'light');
  applyTheme(initialTheme, { persist: Boolean(storedTheme), announce: false });

  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      const next = state.theme === 'dark' ? 'light' : 'dark';
      state.manualTheme = true;
      applyTheme(next, { persist: true, announce: true });
    });
  }
}

function handleSystemThemeChange(event) {
  if (state.manualTheme) return;
  applyTheme(event.matches ? 'dark' : 'light', { persist: false, announce: true });
}

function applyTheme(theme, { persist = true, announce = false } = {}) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  const isDark = state.theme === 'dark';
  document.body.classList.toggle('theme-dark', isDark);
  document.body.dataset.theme = state.theme;

  if (persist) {
    persistThemePreference(state.theme);
  }

  updateThemeToggle();

  if (announce) {
    showMessage(isDark ? 'Modalità scura attivata' : 'Modalità chiara attivata', 'info');
  }
}

function updateThemeToggle() {
  const button = document.querySelector('[data-theme-toggle]');
  if (!button) return;
  const isDark = state.theme === 'dark';
  button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  button.setAttribute('aria-label', isDark ? 'Attiva modalità chiara' : 'Attiva modalità scura');
  button.title = isDark ? 'Attiva modalità chiara' : 'Attiva modalità scura';
  const icon = button.querySelector('.btn-theme__icon');
  const label = button.querySelector('[data-theme-label]');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  if (label) label.textContent = isDark ? 'Modalità chiara' : 'Modalità scura';
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (err) {
    console.warn('[login] impossibile leggere tema salvato', err);
  }
  return null;
}

function persistThemePreference(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {
    console.warn('[login] impossibile salvare tema', err);
  }
}

function setupLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  const errorEl = form.querySelector('[data-error]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError(errorEl);

    const username = form.username.value.trim();
    const password = form.password.value;

    if (!username || !password) {
      showError(errorEl, 'Inserisci username e password');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Credenziali non valide' }));
        throw new Error(data.error || 'Credenziali non valide');
      }

      window.location.href = '/';
    } catch (err) {
      showError(errorEl, err.message || 'Accesso non riuscito');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute('aria-busy');
      }
    }
  });
}

function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function hideError(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}

function showMessage(message, type = 'info') {
  if (!message) return;
  const container = ensureToastRegion();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${type === 'error' ? '⚠' : type === 'success' ? '✔' : 'ℹ'}</span>
    <div class="toast__content">
      <strong class="toast__title">Tema</strong>
      <span class="toast__message">${message}</span>
    </div>
  `;
  toast.setAttribute('role', 'status');
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });
  setTimeout(() => {
    toast.classList.add('toast--exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 2600);
}

function ensureToastRegion() {
  if (toastRegion && toastRegion.isConnected) return toastRegion;
  const region = document.createElement('div');
  region.className = 'toast-container';
  region.setAttribute('role', 'region');
  region.setAttribute('aria-live', 'polite');
  document.body.appendChild(region);
  toastRegion = region;
  return region;
}
