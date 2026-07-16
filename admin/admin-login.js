/**
 * Staff login page controller.
 * Kept as an external file so it always runs under CSP script-src 'self'.
 */
(function () {
  const authMsg = document.getElementById('authMsg');
  const retryBtn = document.getElementById('retryBtn');
  const loginBtn = document.getElementById('loginBtn');
  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  function showError(message) {
    if (!authMsg) return;
    authMsg.textContent = message || 'Login failed';
    authMsg.className = 'danger';
  }

  function showSuccess(message) {
    if (!authMsg) return;
    authMsg.textContent = message || 'OK';
    authMsg.className = 'success';
  }

  function clearMessage() {
    if (!authMsg) return;
    authMsg.textContent = '';
    authMsg.className = '';
  }

  if (!window.DebestAdmin) {
    showError('Login helper failed to load (admin-shared.js). Hard-refresh the page.');
    if (loginBtn) loginBtn.disabled = true;
    return;
  }

  // Already signed in → go to role dashboard
  if (DebestAdmin.redirectIfLoggedIn()) return;

  async function ensureServer() {
    const up = await DebestAdmin.checkServer(3000);
    if (!up) {
      const base = DebestAdmin.getApiBase();
      showError(
        'Admin server is not reachable at ' +
          base +
          '. On the host PC run: npm start — then open this page via that host URL (not Live Server alone).'
      );
      if (retryBtn) retryBtn.style.display = 'block';
      if (loginBtn) loginBtn.disabled = true;
      return false;
    }
    clearMessage();
    if (retryBtn) retryBtn.style.display = 'none';
    if (loginBtn) loginBtn.disabled = false;
    return true;
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      ensureServer();
    });
  }

  ensureServer();

  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    e.stopPropagation();

    clearMessage();
    if (loginBtn) loginBtn.disabled = true;

    const username = (usernameInput && usernameInput.value ? usernameInput.value : '').trim();
    const password = passwordInput && passwordInput.value ? passwordInput.value : '';

    if (!username || !password) {
      showError('Enter both username and password.');
      if (loginBtn) loginBtn.disabled = false;
      return false;
    }

    try {
      const up = await ensureServer();
      if (!up) {
        // ensureServer already disabled the button and showed a message
        return false;
      }

      const result = await DebestAdmin.login(username, password);
      showSuccess('Login successful. Redirecting…');

      // Prefer absolute path from API when present; fall back to relative role map
      const path =
        result.dashboard ||
        DebestAdmin.dashboardForRole(result.role) ||
        './login.html';

      window.location.replace(path);
    } catch (err) {
      const msg = err && err.message ? err.message : 'Login failed';
      const friendly =
        /fetch|Failed to fetch|NetworkError|Load failed/i.test(msg)
          ? 'Unable to reach the admin server. Start it with npm start on the host PC, then try again.'
          : msg;
      showError(friendly);
      if (loginBtn) loginBtn.disabled = false;
      if (passwordInput) {
        passwordInput.focus();
        passwordInput.select();
      }
    }

    return false;
  });
})();
