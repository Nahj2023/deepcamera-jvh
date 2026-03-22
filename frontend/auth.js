/**
 * JWT Authentication Utils
 * Maneja token en sessionStorage: 'dc_token'
 */

const TOKEN_KEY = 'dc_token';
const USER_KEY = 'dc_user';

/**
 * Guarda token y datos de usuario
 */
export function saveToken(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Obtiene token
 */
export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Obtiene datos de usuario
 */
export function getUser() {
  const user = sessionStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

/**
 * Elimina sesión
 */
export function removeToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

/**
 * Verifica si hay sesión activa
 */
export function isAuthenticated() {
  return !!getToken();
}

/**
 * Realiza login
 */
export async function login(username, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await res.json();
    saveToken(data.token, data.user);
    return data.user;
  } catch (err) {
    throw err;
  }
}

/**
 * Realiza logout
 */
export function logout() {
  removeToken();
  window.location.href = '/login.html';
}

/**
 * Verifica autenticación y redirige si no está autenticado
 */
export function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

/**
 * Cliente HTTP con inyección de JWT
 */
export async function apiRequest(url, options = {}) {
  const token = getToken();

  if (!token) {
    logout();
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

    // Si 401, logout y redirige
    if (res.status === 401) {
      logout();
      return null;
    }

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error('API error:', err);
    throw err;
  }
}

/**
 * GET request
 */
export async function apiGet(url) {
  return apiRequest(url, { method: 'GET' });
}

/**
 * POST request
 */
export async function apiPost(url, data) {
  return apiRequest(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

/**
 * PUT request
 */
export async function apiPut(url, data) {
  return apiRequest(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

/**
 * DELETE request
 */
export async function apiDelete(url) {
  return apiRequest(url, { method: 'DELETE' });
}

/**
 * Inicializa módulo: verifica auth y carga user info en página
 */
export function initAuth() {
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
    return;
  }

  const user = getUser();
  if (!user) return;

  // Actualizar displays de usuario en la página
  const userNameEl = document.querySelector('[data-user-name]');
  const userRoleEl = document.querySelector('[data-user-role]');

  if (userNameEl) userNameEl.textContent = user.username;
  if (userRoleEl) userRoleEl.textContent = user.role;
}
