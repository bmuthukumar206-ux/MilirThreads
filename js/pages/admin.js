/* ============================================================
   pages/admin.js — admin dashboard (admin.html)
   ============================================================ */

import { CONFIG } from '../config.js';
import { currentUser, persistUser } from '../session.js';
import { showToast } from '../toast.js';
import { postAuth } from '../api.js';

(function () {
  // Auth gate — must be admin
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Admins only. Please sign in with an admin account.');
    location.replace('Index.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const escape = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  $('adminGreeting').textContent = `Hi, ${currentUser.name} — here’s your store today`;

  // -------------------- FETCH STATS --------------------
  async function loadStats() {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      showFatal('Webhook URL not set in script.js → CONFIG.SHEETS_WEBHOOK.');
      return;
    }
    showToast('Loading dashboard…', 'info');
    try {
      const url = `${CONFIG.SHEETS_WEBHOOK}?action=adminStats&email=${encodeURIComponent(currentUser.email)}`;
      const res = await fetch(url);
      const data = await res.json();
      console.log('[admin] adminStats response:', data);

      if (data.status === 'error') {
        showFatal(data.error || 'Server returned an error');
        return;
      }
      // The OLD deployed Apps Script returns `{status:'ok', service:'MilirThreads webhook'}`
      // when it doesn't know the action — detect that and tell the user clearly.
      if (!data.leads || !data.sales || !data.users) {
        showFatal(
          'The deployed Apps Script is missing the adminStats endpoint. ' +
          'Open Apps Script → Deploy → Manage deployments → ✏️ Edit → Version: NEW VERSION → Deploy. ' +
          'Then refresh this page.'
        );
        return;
      }
      render(data);
      showToast('Dashboard updated', 'success');
    } catch (err) {
      showFatal('Network error: ' + err.message);
    }
  }

  function showFatal(message) {
    showToast(message, 'error');
    const placeholders = ['recentOrders', 'recentLeads', 'recentUsers'];
    placeholders.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="orders-empty">${message}</div>`;
    });
    ['statLeads', 'statQualified', 'statRevenue', 'statUsers'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
  }

  // -------------------- RENDER --------------------
  function render(stats) {
    // Stat cards
    $('statLeads').textContent = stats.leads.total;
    $('statLeadsSub').textContent = `${stats.leads.pending} pending review`;
    $('statQualified').textContent = stats.leads.qualified;
    const conv = stats.leads.total ? Math.round((stats.leads.qualified / stats.leads.total) * 100) : 0;
    $('statQualifiedSub').textContent = `${conv}% qualified · ${stats.leads.unqualified} unqualified`;
    $('statRevenue').textContent = fmt(stats.sales.totalReceived);
    $('statRevenueSub').textContent = `${stats.sales.orderCount} orders · discounts ${fmt(stats.sales.totalDiscount)}`;
    $('statUsers').textContent = stats.users.total;
    $('statUsersSub').textContent = `+${stats.users.newThisWeek} this week · ${stats.users.admins} admin`;

    drawCharts(stats);

    renderApprovals(stats.approvals);
    renderOrders(stats.recent.orders);
    renderLeads(stats.recent.leads);
    renderUsers(stats.recent.users);
  }

  // -------------------- CHARTS --------------------
  const chartInstances = {};
  const palette = ['#0f62fe', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

  function destroyChart(id) {
    if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
  }

  function makeChart(id, type, labels, data, options) {
    const el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    destroyChart(id);
    chartInstances[id] = new Chart(el.getContext('2d'), {
      type,
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: palette.slice(0, data.length),
          borderRadius: type === 'bar' ? 8 : 0,
          borderWidth: 0
        }]
      },
      options: Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: type !== 'bar' } }
      }, options || {})
    });
  }

  function drawCharts(stats) {
    // Leads by interest — horizontal bar
    const interestEntries = Object.entries(stats.leads.byInterest || {});
    if (interestEntries.length) {
      makeChart('interestChart', 'bar',
        interestEntries.map(([k]) => k),
        interestEntries.map(([, v]) => v),
        { indexAxis: 'y', plugins: { legend: { display: false } },
          scales: { x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { precision: 0 } }, y: { grid: { display: false } } } }
      );
    }

    // Sales by category — pie / doughnut (revenue mix)
    const catEntries = Object.entries(stats.sales.byCategory || {});
    if (catEntries.length) {
      makeChart('categoryChart', 'doughnut',
        catEntries.map(([k]) => k),
        catEntries.map(([, v]) => v.revenue || 0),
        { cutout: '60%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
      );
    }

    // Lead qualification breakdown
    const q = stats.leads || {};
    const qualLabels = ['Qualified', 'Unqualified', 'Pending'];
    const qualData = [q.qualified || 0, q.unqualified || 0, q.pending || 0];
    if (qualData.some(v => v > 0)) {
      makeChart('qualificationChart', 'doughnut', qualLabels, qualData,
        { cutout: '65%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
      );
    }

    // Order status counts
    const statusEntries = Object.entries(stats.sales.byStatus || {});
    if (statusEntries.length) {
      makeChart('statusChart', 'bar',
        statusEntries.map(([k]) => k),
        statusEntries.map(([, v]) => v),
        { plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } } }
      );
    }
  }

  function renderApprovals(approvals) {
    const card = $('approvalsCard');
    const list = $('approvalsList');
    const badge = $('approvalsBadge');
    if (!approvals.count) { card.hidden = true; return; }
    card.hidden = false;
    badge.textContent = approvals.count;
    list.innerHTML = approvals.items.map(o => `
      <article class="approval-row" data-payment="${escape(o['Payment ID'])}">
        <div>
          <strong>${escape(o['Which Product'] || '—')}</strong>
          <span>${escape(o['Name'] || '')} · ${escape(o['Email'] || '')}</span>
          <span class="approval-meta">${escape(o['Date'] || '')} · ${fmt(o['Received Amount'])}</span>
        </div>
        <div class="approval-actions">
          <button class="btn btn-ghost" data-action="reject" type="button">Reject</button>
          <button class="btn btn-primary" data-action="approve" type="button">Approve</button>
        </div>
      </article>
    `).join('');
    list.querySelectorAll('.approval-row').forEach(row => {
      const id = row.dataset.payment;
      row.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => updateOrderStatus(id, btn.dataset.action === 'approve' ? 'approved' : 'rejected', row));
      });
    });
  }

  function renderOrders(orders) {
    const el = $('recentOrders');
    if (!orders || !orders.length) {
      el.innerHTML = '<div class="orders-empty">No orders yet.</div>';
      return;
    }
    el.innerHTML = orders.map(o => {
      const status = (o['Status'] || 'success').toString();
      return `
        <article class="order-row order-${status}">
          <header>
            <div>
              <strong>${escape(o['Which Product'] || '—')}</strong>
              <span>${escape(o['Date'] || '')}</span>
            </div>
            <span class="order-status status-${status}">${escape(status)}</span>
          </header>
          <div class="order-grid">
            <div><span>Customer</span><strong>${escape(o['Name'] || '')}</strong></div>
            <div><span>Email</span><strong>${escape(o['Email'] || '')}</strong></div>
            <div><span>Paid</span><strong>${fmt(o['Received Amount'])}</strong></div>
            <div><span>Payment ID</span><strong>${escape(o['Payment ID'] || '—')}</strong></div>
          </div>
        </article>`;
    }).join('');
  }

  function renderLeads(leads) {
    const el = $('recentLeads');
    if (!leads || !leads.length) {
      el.innerHTML = '<div class="orders-empty">No leads yet.</div>';
      return;
    }
    el.innerHTML = leads.map(l => {
      const q = (l['Qualified'] || 'pending').toLowerCase();
      return `
        <article class="lead-row q-${q}" data-email="${escape(l['Email'])}" data-date="${escape(l['Date'])}">
          <header>
            <div>
              <strong>${escape(l['Name'] || '—')}</strong>
              <span>${escape(l['Interest'] || '')} · ${escape(l['Date'] || '')}</span>
            </div>
            <span class="order-status status-${q === 'qualified' ? 'success' : q === 'unqualified' ? 'failed' : 'demo'}">${q}</span>
          </header>
          <p class="lead-message">${escape(l['Message'] || '')}</p>
          <div class="lead-meta">
            <span>${escape(l['Email'] || '')}</span>
            <span>${escape(l['Phone'] || '')}</span>
          </div>
          <div class="lead-actions">
            <button class="btn btn-ghost" data-state="unqualified" type="button">Unqualified</button>
            <button class="btn btn-ghost" data-state="pending" type="button">Reset</button>
            <button class="btn btn-primary" data-state="qualified" type="button">Mark qualified</button>
          </div>
        </article>`;
    }).join('');
    el.querySelectorAll('.lead-row').forEach(row => {
      const email = row.dataset.email;
      const date = row.dataset.date;
      row.querySelectorAll('[data-state]').forEach(btn => {
        btn.addEventListener('click', () => qualifyLead(email, date, btn.dataset.state, row));
      });
    });
  }

  function renderUsers(users) {
    const el = $('recentUsers');
    if (!users || !users.length) {
      el.innerHTML = '<div class="orders-empty">No signups yet.</div>';
      return;
    }
    el.innerHTML = `
      <table class="users-table">
        <thead>
          <tr><th>Date</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th></tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${escape(u.date || '')}</td>
              <td>${escape(u.name || '')}</td>
              <td>${escape(u.email || '')}</td>
              <td>${escape(u.phone || '')}</td>
              <td><span class="role-pill role-${u.role || 'user'}">${escape(u.role || 'user')}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  // -------------------- ACTIONS --------------------
  async function qualifyLead(email, date, state, row) {
    row.style.opacity = 0.6;
    const r = await postAuth({
      type: 'lead_qualify',
      admin_email: currentUser.email,
      lead_email: email,
      lead_date: date,
      qualified: state
    });
    row.style.opacity = 1;
    if (r.status === 'ok') {
      showToast(`Marked ${state}`, 'success');
      loadStats();
    } else {
      showToast(r.error || 'Could not update lead', 'error');
    }
  }

  async function updateOrderStatus(paymentId, newStatus, row) {
    row.style.opacity = 0.6;
    const r = await postAuth({
      type: 'order_status',
      admin_email: currentUser.email,
      payment_id: paymentId,
      new_status: newStatus
    });
    row.style.opacity = 1;
    if (r.status === 'ok') {
      showToast(`Order ${newStatus}`, newStatus === 'approved' ? 'success' : 'warn');
      loadStats();
    } else {
      showToast(r.error || 'Could not update order', 'error');
    }
  }

  // -------------------- WIRE UP --------------------
  $('refreshBtn')?.addEventListener('click', loadStats);
  $('adminLogout')?.addEventListener('click', () => {
    persistUser(null);
    location.replace('Index.html');
  });

  loadStats();
})();
