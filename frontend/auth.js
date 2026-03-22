/**
 * JWT Authentication Utils
 * Maneja token en sessionStorage: 'dc_token'
 */

const TOKEN_KEY = 'dc_token';
const USER_KEY = 'dc_user';

// Detectar base URL dinámicamente
function getBaseURL() {
  const path = window.location.pathname;
  // Si estamos en /deepcamera/login.html -> base es /deepcamera/
  const idx = path.lastIndexOf('/');
  return path.substring(0, idx + 1);
}

export function saveToken(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const user = sessionStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

export function removeToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

export async function login(username, password) {
  const base = getBaseURL();
  const res = await fetch(base + 'api/auth/login', {
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
}

export function logout() {
  removeToken();
  window.location.href = getBaseURL() + 'login.html';
}

export function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = getBaseURL() + 'login.html';
    return false;
  }
  return true;
}

export async function apiRequest(url, options = {}) {
  const token = getToken();

  if (!token) {
    logout();
    return;
  }

  // Asegurar que la URL sea relativa al base
  const base = getBaseURL();
  const fullUrl = url.startsWith('/') ? base + url.substring(1) : url.startsWith('http') ? url : base + url;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  const res = await fetch(fullUrl, { ...options, headers });

  if (res.status === 401) {
    logout();
    return null;
  }

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return await res.json();
}

export async function apiGet(url) {
  return apiRequest(url, { method: 'GET' });
}

export async function apiPost(url, data) {
  return apiRequest(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function apiPut(url, data) {
  return apiRequest(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export async function apiDelete(url) {
  return apiRequest(url, { method: 'DELETE' });
}

export function initAuth() {
  if (!isAuthenticated()) {
    window.location.href = getBaseURL() + 'login.html';
    return;
  }

  const user = getUser();
  if (!user) return;

  const userNameEl = document.querySelector('[data-user-name]');
  const userRoleEl = document.querySelector('[data-user-role]');

  if (userNameEl) userNameEl.textContent = user.username;
  if (userRoleEl) userRoleEl.textContent = user.role;
}
