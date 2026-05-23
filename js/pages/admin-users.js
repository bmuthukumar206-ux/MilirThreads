/* ============================================================
   pages/admin-users.js — Users list (admin-users.html)
   Fetches every account via ?action=users and renders a table.
   ============================================================ */

import { CONFIG } from '../config.js';
import { currentUser, persistUser } from '../session.js';
import { showToast } from '../toast.js';

(function () {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Admins only. Please sign in with an admin account.');
    location.replace('index.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  let allUsers = [];
  let query = '';

  async function load() {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      $('usrTableBody').innerHTML = '<tr><td colspan="6" class="orders-empty">Webhook not configured.</td></tr>';
      return;
    }
    showToast('Loading users…', 'info');
    try {
      const url = `${CONFIG.SHEETS_WEBHOOK}?action=users&email=${encodeURIComponent(currentUser.email)}&_t=${Date.now()}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.status === 'ok' && Array.isArray(data.users)) {
        allUsers = data.users;
        render();
        showToast('Users updated', 'success');
      } else if (data && data.status === 'error') {
        showFail(data.error || 'Could not load users');
      } else {
        // Old deployment — endpoint not present.
        showFail('The Apps Script needs redeploying so the Users endpoint is live (Deploy → Manage deployments → ✎ Edit → New version → Deploy).');
      }
    } catch (err) {
      showFail('Network error: ' + err.message);
    }
  }

  function showFail(message) {
    $('usrTableBody').innerHTML = `<tr><td colspan="6" class="orders-empty">${esc(message)}</td></tr>`;
    showToast(message, 'error');
  }

  function render() {
    const total = allUsers.length;
    const admins = allUsers.filter(u => (u.role || '').toLowerCase() === 'admin').length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newCount = allUsers.filter(u => {
      const t = Date.parse((u.dateJoined || '').toString().replace(' ', 'T'));
      return !isNaN(t) && t >= weekAgo;
    }).length;

    $('usrCount').textContent = total;
    $('usrCountSub').textContent = `${total - admins} customer${total - admins === 1 ? '' : 's'}`;
    $('usrAdmins').textContent = admins;
    $('usrNew').textContent = newCount;

    const q = query.trim().toLowerCase();
    const filtered = q
      ? allUsers.filter(u =>
          (u.name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.phone || '').toString().toLowerCase().includes(q))
      : allUsers;

    $('usrShown').textContent = filtered.length;

    const body = $('usrTableBody');
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="6" class="orders-empty">No matching users.</td></tr>';
      return;
    }
    body.innerHTML = filtered.map(u => `
      <tr>
        <td class="cell-date">${esc(u.dateJoined || '')}</td>
        <td><strong>${esc(u.name || '—')}</strong></td>
        <td>${esc(u.email || '')}</td>
        <td>${esc(u.phone || '—')}</td>
        <td><span class="role-pill role-${esc(u.role || 'user')}">${esc(u.role || 'user')}</span></td>
        <td class="cell-date">${esc(u.lastLogin || '—')}${u.lastMethod ? ` <span class="cell-sub">via ${esc(u.lastMethod)}</span>` : ''}</td>
      </tr>`).join('');
  }

  $('refreshBtn').addEventListener('click', load);
  $('adminLogout').addEventListener('click', () => {
    persistUser(null);
    location.replace('index.html');
  });
  $('usrSearch').addEventListener('input', (e) => {
    query = e.target.value || '';
    render();
  });

  load();
})();
