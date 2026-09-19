// Shared helpers for admin pages: auth guard + logout wiring.
async function requireAdminAuth() {
  try {
    const res = await fetch('/api/admin/session');
    const data = await res.json();
    if (!data.authenticated) {
      location.href = '/admin/login.html';
      return null;
    }
    return data;
  } catch {
    location.href = '/admin/login.html';
    return null;
  }
}

function wireLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.href = '/admin/login.html';
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatNaira(amount) {
  const n = Math.round(Number(amount) || 0);
  return '₦' + n.toLocaleString('en-NG');
}

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 401) {
    location.href = '/admin/login.html';
    throw new Error('Not authenticated');
  }
  return res;
}
