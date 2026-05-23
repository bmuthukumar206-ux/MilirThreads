/* ============================================================
   pages/admin-transactions.js — Transactions list (admin-transactions.html)
   Pulls every order via fetchAllOrders and shows them in a table.
   ============================================================ */

import { CONFIG } from '../config.js';
import { currentUser, persistUser } from '../session.js';
import { showToast } from '../toast.js';
import { fetchAllOrders } from '../api.js';

(function () {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Admins only. Please sign in with an admin account.');
    location.replace('index.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const isPaid = (o) => /^(success|approved|demo)$/i.test((o['Status'] || 'success').toString());

  async function load() {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      $('txTableBody').innerHTML = '<tr><td colspan="6" class="orders-empty">Webhook not configured.</td></tr>';
      return;
    }
    showToast('Loading transactions…', 'info');
    const { orders, error } = await fetchAllOrders(currentUser);
    if (error) {
      $('txTableBody').innerHTML = `<tr><td colspan="6" class="orders-empty">${esc(error)}</td></tr>`;
      showToast(error, 'error');
      return;
    }
    render(orders || []);
    showToast('Transactions updated', 'success');
  }

  function render(orders) {
    const paid = orders.filter(isPaid);
    const totalReceived = paid.reduce((t, o) => t + (Number(o['Received Amount']) || 0), 0);
    const totalDiscount = paid.reduce((t, o) => t + (Number(o['Discount']) || 0), 0);
    const failed = orders.length - paid.length;

    $('txTotalReceived').textContent = fmt(totalReceived);
    $('txTotalReceivedSub').textContent = `${paid.length} successful payments`;
    $('txCount').textContent = orders.length;
    $('txCountSub').textContent = failed ? `${failed} failed / cancelled` : 'All successful';
    $('txDiscount').textContent = fmt(totalDiscount);
    $('txListCount').textContent = orders.length;

    const body = $('txTableBody');
    if (!orders.length) {
      body.innerHTML = '<tr><td colspan="6" class="orders-empty">No transactions yet.</td></tr>';
      return;
    }
    body.innerHTML = orders.map(o => {
      const status = (o['Status'] || 'success').toString();
      return `
        <tr>
          <td class="cell-date">${esc(o['Date'] || '')}</td>
          <td>
            <strong>${esc(o['Name'] || '—')}</strong>
            <span class="cell-sub">${esc(o['Email'] || '')}</span>
          </td>
          <td class="cell-products">${esc(o['Which Product'] || '—')}</td>
          <td class="num"><strong>${fmt(o['Received Amount'])}</strong></td>
          <td class="cell-pid">${esc(o['Payment ID'] || '—')}</td>
          <td><span class="order-status status-${esc(status)}">${esc(status)}</span></td>
        </tr>`;
    }).join('');
  }

  $('refreshBtn').addEventListener('click', load);
  $('adminLogout').addEventListener('click', () => {
    persistUser(null);
    location.replace('index.html');
  });

  load();
})();
