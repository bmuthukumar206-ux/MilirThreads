/* ============================================================
   pages/admin.js — admin dashboard (admin.html)
   Stats (revenue / customers / orders), sales chart, recent orders,
   export-to-CSV. The calendar widget on the same page is rendered
   by js/pages/admin-calendar.js (also loaded on admin.html).
   ============================================================ */

import { CONFIG } from '../config.js';
import { currentUser, persistUser } from '../session.js';
import { showToast } from '../toast.js';
import { postAuth, fetchAllOrders } from '../api.js';

(function () {
  // Auth gate — must be admin
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Admins only. Please sign in with an admin account.');
    location.replace('index.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const escape = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  if ($('adminGreeting')) {
    $('adminGreeting').textContent = `Hi, ${currentUser.name} — here’s your store today`;
  }

  let lastOrders = []; // cached for export and chart

  // -------------------- FETCH --------------------
  async function loadStats() {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      showFatal('Webhook URL not set in js/config.js → CONFIG.SHEETS_WEBHOOK.');
      return;
    }
    showToast('Loading dashboard…', 'info');
    try {
      const url = `${CONFIG.SHEETS_WEBHOOK}?action=adminStats&email=${encodeURIComponent(currentUser.email)}`;
      const [statsRes, ordersRes] = await Promise.all([
        fetch(url).then(r => r.json()),
        fetchAllOrders(currentUser)
      ]);

      if (statsRes.status === 'error') {
        showFatal(statsRes.error || 'Server returned an error');
        return;
      }
      // Old deployments return {status:'ok',service:'...'} for unknown actions.
      if (!statsRes.leads || !statsRes.sales || !statsRes.users) {
        showFatal(
          'The Apps Script needs redeploying — Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy, then reload this page.'
        );
        return;
      }

      lastOrders = ordersRes.orders || [];
      try {
        render(statsRes, lastOrders);
      } catch (err) {
        // A bad sub-render (e.g. Chart.js hiccup) shouldn't blow up the whole page.
        console.error('Dashboard render error:', err);
        showToast('Dashboard partially loaded — ' + err.message, 'warn');
      }
      showToast('Dashboard updated', 'success');
    } catch (err) {
      showFatal('Network error: ' + err.message);
    }
  }

  function showFatal(message) {
    showToast(message, 'error');
    ['recentOrders', 'recentLeads', 'recentUsers'].forEach(id => {
      const el = $(id);
      if (el) el.innerHTML = `<div class="orders-empty">${escape(message)}</div>`;
    });
    ['statRevenue', 'statCustomers', 'statOrdersCount', 'statLeads', 'statQualified', 'statUsers'].forEach(id => {
      const el = $(id);
      if (el) el.textContent = '—';
    });
  }

  // -------------------- RENDER --------------------
  function render(stats, orders) {
    const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };

    // New dashboard stats
    setText('statRevenue', fmt(stats.sales.totalReceived));
    setText('statRevenueSub', `${stats.sales.orderCount} orders · discounts ${fmt(stats.sales.totalDiscount)}`);
    setText('statCustomers', stats.users.total);
    setText('statCustomersSub', `+${stats.users.newThisWeek} this week · ${stats.users.admins} admin`);
    setText('statOrdersCount', stats.sales.orderCount);
    setText('statOrdersSub', `${stats.sales.byStatus.pending || 0} pending review`);

    // Legacy stats (if a page still uses these ids — safe no-op otherwise)
    setText('statLeads', stats.leads.total);
    setText('statQualified', stats.leads.qualified);
    setText('statUsers', stats.users.total);

    drawSalesChart(orders);
    drawLegacyCharts(stats);

    if ($('recentOrders')) renderOrders(stats.recent.orders);
    if ($('recentLeads')) renderLeads(stats.recent.leads);
    if ($('recentUsers')) renderUsers(stats.recent.users);
    if ($('approvalsCard')) renderApprovals(stats.approvals);
  }

  // -------------------- CHARTS --------------------
  const chartInstances = {};
  const palette = ['#1f7a5c', '#16a34a', '#e0911b', '#7c5cd6', '#0891b2', '#dc2626', '#db2777', '#65a30d'];

  function destroyChart(id) {
    if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
  }

  function makeChart(id, type, labels, data, options) {
    const el = $(id);
    if (!el || typeof Chart === 'undefined') return;
    destroyChart(id);
    chartInstances[id] = new Chart(el.getContext('2d'), {
      type,
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: palette.slice(0, Math.max(1, data.length)),
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

  // Daily revenue bar chart for the last 30 days, drawn from orders.
  function drawSalesChart(orders) {
    if (!$('salesChart')) return;
    try { _drawSalesChart(orders); }
    catch (err) { console.warn('Sales chart skipped:', err); }
  }
  function _drawSalesChart(orders) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const labels = [], keys = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      keys.push(ymd(d));
      labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    }
    const buckets = Object.create(null);
    keys.forEach(k => { buckets[k] = 0; });

    (orders || []).forEach(o => {
      const status = (o['Status'] || 'success').toString().toLowerCase();
      if (!/^(success|approved|demo)$/i.test(status)) return;
      const dateStr = (o['Date'] || '').toString().slice(0, 10);
      if (buckets[dateStr] != null) {
        buckets[dateStr] += Number(o['Received Amount']) || 0;
      }
    });
    const data = keys.map(k => buckets[k]);

    makeChart('salesChart', 'bar', labels, data, {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => '₹' + c.parsed.y.toLocaleString('en-IN') } }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { callback: (v) => '₹' + Number(v).toLocaleString('en-IN') }
        },
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
        }
      }
    });
  }

  // Legacy charts — only render when their canvases exist on the page.
  function drawLegacyCharts(stats) {
    try { _drawLegacyCharts(stats); }
    catch (err) { console.warn('Legacy chart skipped:', err); }
  }
  function _drawLegacyCharts(stats) {
    const interestEntries = Object.entries(stats.leads.byInterest || {});
    if (interestEntries.length && $('interestChart')) {
      makeChart('interestChart', 'bar',
        interestEntries.map(([k]) => k),
        interestEntries.map(([, v]) => v),
        {
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: { x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { precision: 0 } }, y: { grid: { display: false } } }
        }
      );
    }
    const catEntries = Object.entries(stats.sales.byCategory || {});
    if (catEntries.length && $('categoryChart')) {
      makeChart('categoryChart', 'doughnut',
        catEntries.map(([k]) => k),
        catEntries.map(([, v]) => v.revenue || 0),
        { cutout: '60%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
      );
    }
    const q = stats.leads || {};
    if ((q.qualified || q.unqualified || q.pending) && $('qualificationChart')) {
      makeChart('qualificationChart', 'doughnut',
        ['Qualified', 'Unqualified', 'Pending'],
        [q.qualified || 0, q.unqualified || 0, q.pending || 0],
        { cutout: '65%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
      );
    }
    const statusEntries = Object.entries(stats.sales.byStatus || {});
    if (statusEntries.length && $('statusChart')) {
      makeChart('statusChart', 'bar',
        statusEntries.map(([k]) => k),
        statusEntries.map(([, v]) => v),
        {
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
        }
      );
    }
  }

  // -------------------- RECENT LISTS --------------------
  function renderApprovals(approvals) {
    const card = $('approvalsCard');
    const list = $('approvalsList');
    const badge = $('approvalsBadge');
    if (!card || !list) return;
    if (!approvals.count) { card.hidden = true; return; }
    card.hidden = false;
    if (badge) badge.textContent = approvals.count;
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
    if (!el) return;
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
    if (!el) return;
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
        </article>`;
    }).join('');
  }

  function renderUsers(users) {
    const el = $('recentUsers');
    if (!el) return;
    if (!users || !users.length) {
      el.innerHTML = '<div class="orders-empty">No signups yet.</div>';
      return;
    }
    el.innerHTML = `
      <table class="users-table">
        <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th></tr></thead>
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

  // -------------------- EXPORT --------------------
  function exportCsv() {
    if (!lastOrders.length) {
      showToast('No orders to export yet', 'warn');
      return;
    }
    const headers = ['Date', 'Name', 'Email', 'Phone', 'Which Product',
      'Amount', 'Received Amount', 'Discount', 'Promo Code',
      'Payment ID', 'Status', 'Delivery Status', 'Shipping Address'];
    const cell = (v) => {
      const s = (v == null ? '' : String(v)).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = headers.join(',') + '\n' +
      lastOrders.map(o => headers.map(h => cell(o[h])).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `milirthreads-orders-${ymd(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
    showToast(`Exported ${lastOrders.length} orders`, 'success');
  }

  // -------------------- WIRE UP --------------------
  $('refreshBtn')?.addEventListener('click', loadStats);
  $('exportBtn')?.addEventListener('click', exportCsv);
  $('adminLogout')?.addEventListener('click', () => {
    persistUser(null);
    location.replace('index.html');
  });

  loadStats();
})();
