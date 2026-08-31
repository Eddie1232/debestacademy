/**
 * Shared admin client helpers for Debest Academy.
 * Used by login page and role dashboards (LAN multi-PC safe).
 */
(function (global) {
  const JWT_STORAGE_KEY = 'debest_admin_token_v1';

  const ROLE_DASHBOARD = {
    Secretary: '/admin/secretary.html',
    Manager: '/admin/manager.html',
    Headmaster: '/admin/headmaster.html',
    SuperAdmin: '/admin/superadmin.html',
  };

  function getApiBase() {
    try {
      const o = localStorage.getItem('debest_admin_api_base');
      if (o && (o.startsWith('http://') || o.startsWith('https://'))) return o;
    } catch (e) {
      /* ignore */
    }
    if (
      typeof location !== 'undefined' &&
      location.protocol &&
      location.protocol.startsWith('http') &&
      location.host
    ) {
      return location.origin;
    }
    return 'http://127.0.0.1:5501';
  }

  function getToken() {
    try {
      return localStorage.getItem(JWT_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(JWT_STORAGE_KEY, token);
      else localStorage.removeItem(JWT_STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function getDeviceId() {
    const key = 'debest_office_device_id_v1';
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function clearSession() {
    setToken('');
  }

  function b64UrlDecode(input) {
    let s = String(input).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try {
      return decodeURIComponent(escape(window.atob(s)));
    } catch (e) {
      try {
        return window.atob(s);
      } catch (e2) {
        return null;
      }
    }
  }

  function parseJwt(token) {
    if (!token) return null;
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    try {
      const json = b64UrlDecode(parts[1]);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      return null;
    }
  }

  function getSession() {
    const token = getToken();
    if (!token) return null;
    const payload = parseJwt(token);
    if (!payload) {
      clearSession();
      return null;
    }
    // exp is seconds since epoch
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      clearSession();
      return null;
    }
    return {
      token,
      username: payload.username || payload.user || '',
      role: payload.role || '',
      sub: payload.sub,
    };
  }

  function dashboardForRole(role) {
    // Prefer absolute paths so redirect works from any /admin/* page depth
    const relative = ROLE_DASHBOARD[role];
    if (!relative) return './login.html';
    if (relative.startsWith('/')) return relative;
    // Resolve against /admin/ so login from nested paths still works
    try {
      return new URL(relative, (typeof location !== 'undefined' ? location.origin : '') + '/admin/')
        .pathname;
    } catch (e) {
      return relative;
    }
  }

  function loginUrl() {
    return './login.html';
  }

  /**
   * Gate a role dashboard. Redirects to login or correct dashboard if needed.
   * @param {string} expectedRole Secretary | Manager | Headmaster
   * @returns {object|null} session when allowed
   */
  function requireAuth(expectedRole) {
    const session = getSession();
    if (!session || !session.token) {
      window.location.replace(loginUrl());
      return null;
    }
    if (expectedRole && session.role && session.role !== expectedRole) {
      window.location.replace(dashboardForRole(session.role));
      return null;
    }
    return session;
  }

  /**
   * If already logged in on the login page, send them to their dashboard.
   */
  function redirectIfLoggedIn() {
    const session = getSession();
    if (session && session.role) {
      window.location.replace(dashboardForRole(session.role));
      return true;
    }
    return false;
  }

  async function login(username, password) {
    const API_BASE = getApiBase();
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, deviceId: getDeviceId() }),
    });
    const rawText = await res.text().catch(() => '');
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (_) {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data.error || rawText || `Login failed (HTTP ${res.status})`);
    }
    if (!data.token) throw new Error('Login succeeded but token was missing.');
    setToken(data.token);
    const role = data.role || (parseJwt(data.token) || {}).role || '';
    return {
      token: data.token,
      role,
      username: data.username || username,
      dashboard: data.dashboard || dashboardForRole(role),
    };
  }

  function logout(redirectToLogin) {
    clearSession();
    if (redirectToLogin !== false) {
      window.location.replace(loginUrl());
    }
  }

  async function checkServer(timeout = 2000) {
    const API_BASE = getApiBase();
    const result = {
      ok: false,
      endpoint: '/health',
      status: '',
      message: 'Server unreachable',
    };

    async function fetchEndpoint(path) {
      const ctl = new AbortController();
      const id = setTimeout(() => ctl.abort(), timeout);
      try {
        const res = await fetch(`${API_BASE}${path}`, { method: 'GET', signal: ctl.signal });
        clearTimeout(id);
        return res;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    }

    try {
      const health = await fetchEndpoint('/health');
      if (!health.ok) {
        result.endpoint = '/health';
        result.status = `${health.status}`;
        result.message = 'Health endpoint returned an error.';
        return result;
      }

      const calendar = await fetchEndpoint('/api/terms-calendar');
      if (!calendar.ok) {
        result.endpoint = '/api/terms-calendar';
        result.status = `${calendar.status}`;
        result.message = 'Calendar endpoint returned an error.';
        return result;
      }

      result.ok = true;
      result.endpoint = '/health and /api/terms-calendar';
      result.message = 'Backend is reachable.';
      return result;
    } catch (e) {
      result.message = e.name === 'AbortError' ? 'Request timed out.' : e.message || result.message;
      return result;
    }
  }

  global.DebestAdmin = {
    JWT_STORAGE_KEY,
    ROLE_DASHBOARD,
    getApiBase,
    getToken,
    getDeviceId,
    setToken,
    clearSession,
    parseJwt,
    getSession,
    dashboardForRole,
    loginUrl,
    requireAuth,
    redirectIfLoggedIn,
    login,
    logout,
    checkServer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
