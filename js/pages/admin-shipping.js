/* ============================================================
   pages/admin-shipping.js — Shipping queues (admin-shipping.html)
   Two columns: Ready-for-pickup (received) and Shipped (out_for_delivery).
   Buttons advance an order to the next delivery stage.
   ============================================================ */

import { CONFIG } from '../config.js';
import { currentUser, persistUser } from '../session.js';
import { showToast } from '../toast.js';
import { postAuth, fetchAllOrders } from '../api.js';
import { parseOrderProducts } from '../catalog.js';
import { loadSheetProducts } from '../sheet-products.js';

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
  const stageOf = (o) => {
    const v = (o['Delivery Status'] || 'received').toString().toLowerCase().trim();
    return ['received', 'out_for_delivery', 'delivered'].indexOf(v) >= 0 ? v : 'received';
  };

  let orders = []; // paid orders only; index used as data-idx

  async function load() {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      $('shipReadyList').innerHTML = '<p class="orders-empty">Webhook not configured.</p>';
      $('shipOutList').innerHTML = '';
      return;
    }
    showToast('Loading shipping queues…', 'info');
    try { await loadSheetProducts(); } catch (e) { /* non-fatal */ }
    const { orders: all, error } = await fetchAllOrders(currentUser);
    if (error) {
      $('shipReadyList').innerHTML = `<p class="orders-empty">${esc(error)}</p>`;
      $('shipOutList').innerHTML = '';
      showToast(error, 'error');
      return;
    }
    orders = (all || []).filter(isPaid);
    render();
    showToast('Shipping queues updated', 'success');
  }

  function cardHtml(o, idx, nextStage, nextLabel) {
    const items = parseOrderProducts(o['Which Product']);
    const thumbs = items.slice(0, 3).map(it => {
      if (it.product && it.product.img) {
        return `<img src="${esc(it.product.img)}" alt="${esc(it.name)}">`;
      }
      const initial = (it.name.trim()[0] || '?').toUpperCase();
      return `<span class="kanban-thumb-ph">${esc(initial)}</span>`;
    }).join('');
    const more = items.length > 3 ? `<span class="kanban-thumb-more">+${items.length - 3}</span>` : '';
    const title = items.length
      ? items.map(it => esc(it.name) + (it.qty > 1 ? ` ×${it.qty}` : '')).join(', ')
      : esc(o['Which Product'] || '—');

    return `
      <article class="ship-card" data-idx="${idx}">
        <div class="ship-card-thumbs">${thumbs || '<span class="kanban-thumb-ph">?</span>'}${more}</div>
        <div class="ship-card-body">
          <strong class="ship-card-title">${title}</strong>
          <div class="ship-card-meta">
            <span>${esc(o['Name'] || '—')}</span>
            <span class="ship-card-amt">${fmt(o['Received Amount'])}</span>
          </div>
          <div class="ship-card-addr">${esc(o['Shipping Address'] || 'No shipping address')}</div>
          <div class="ship-card-foot">
            <span class="ship-card-date">${esc(o['Date'] || '')}</span>
            <button type="button" class="btn btn-primary ship-card-btn"
                    data-idx="${idx}" data-stage="${nextStage}">${esc(nextLabel)}</button>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const buckets = { received: [], out_for_delivery: [], delivered: [] };
    orders.forEach((o, idx) => buckets[stageOf(o)].push(idx));

    $('shipReadyCount').textContent = buckets.received.length;
    $('shipOutCount').textContent = buckets.out_for_delivery.length;
    $('shipDeliveredCount').textContent = buckets.delivered.length;
    $('shipReadyBadge').textContent = buckets.received.length;
    $('shipOutBadge').textContent = buckets.out_for_delivery.length;

    const readyList = $('shipReadyList');
    if (!buckets.received.length) {
      readyList.innerHTML = '<p class="orders-empty">Nothing to dispatch right now.</p>';
    } else {
      readyList.innerHTML = buckets.received
        .map(idx => cardHtml(orders[idx], idx, 'out_for_delivery', 'Mark shipped →'))
        .join('');
    }

    const outList = $('shipOutList');
    if (!buckets.out_for_delivery.length) {
      outList.innerHTML = '<p class="orders-empty">Nothing in transit.</p>';
    } else {
      outList.innerHTML = buckets.out_for_delivery
        .map(idx => cardHtml(orders[idx], idx, 'delivered', 'Mark delivered ✓'))
        .join('');
    }

    document.querySelectorAll('.ship-card-btn').forEach(btn => {
      btn.addEventListener('click', () => moveOrder(Number(btn.dataset.idx), btn.dataset.stage));
    });
  }

  async function moveOrder(idx, newStage) {
    const o = orders[idx];
    if (!o) return;
    const oldStage = stageOf(o);
    o['Delivery Status'] = newStage;
    render();
    const r = await postAuth({
      type: 'delivery_status',
      admin_email: currentUser.email,
      payment_id: o['Payment ID'] || '',
      order_date: o['Date'] || '',
      order_email: o['Email'] || '',
      delivery_status: newStage
    });
    if (r && r.status === 'ok') {
      showToast(newStage === 'out_for_delivery' ? 'Marked as shipped' : 'Marked as delivered', 'success');
    } else {
      o['Delivery Status'] = oldStage;
      render();
      showToast((r && r.error) || 'Could not update order', 'error');
    }
  }

  $('refreshBtn').addEventListener('click', load);
  $('adminLogout').addEventListener('click', () => {
    persistUser(null);
    location.replace('index.html');
  });

  load();
})();
