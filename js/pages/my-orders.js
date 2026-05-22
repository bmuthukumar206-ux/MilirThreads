/* ============================================================
   pages/my-orders.js — customer order history (my-orders.html)
   Each order shows its product image(s) and opens a detail page.
   ============================================================ */

import { CONFIG } from '../config.js';
import { currentUser } from '../session.js';
import { fetchOrders } from '../api.js';
import { parseOrderProducts } from '../catalog.js';

(function () {
  if (!currentUser) {
    // Not signed in → send them home with a prompt
    alert('Please sign in to view your orders.');
    location.replace('index.html');
    return;
  }

  const list = document.getElementById('myOrdersList');
  const sub = document.getElementById('myOrdersSub');
  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  sub.textContent = `Hello ${currentUser.name} — your purchase history.`;

  let orders = [];
  load();

  async function load() {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      list.innerHTML = '<div class="orders-empty">Webhook not configured yet.</div>';
      return;
    }

    const result = await fetchOrders(currentUser);
    orders = result.orders;

    if (result.error) {
      list.innerHTML = `<div class="orders-empty">${esc(result.error)}</div>`;
      return;
    }
    if (!orders.length) {
      list.innerHTML = `
        <div class="orders-empty">
          <p>No orders yet.</p>
          <p><a href="shop.html" class="link-arrow">Browse the shop &rarr;</a></p>
        </div>`;
      return;
    }

    render();
  }

  function render() {
    list.innerHTML = orders.map((o, idx) => {
      const status = (o['Status'] || 'success').toString();
      const items = parseOrderProducts(o['Which Product']);
      const count = items.reduce((t, it) => t + (it.qty || 1), 0);

      // Up to 3 product thumbnails; matched products use the catalog image.
      const thumbs = items.slice(0, 3).map(it => {
        if (it.product && it.product.img) {
          return `<img src="${esc(it.product.img)}" alt="${esc(it.name)}">`;
        }
        const initial = (it.name.trim()[0] || '?').toUpperCase();
        return `<span class="order-thumb-ph">${esc(initial)}</span>`;
      }).join('');
      const moreThumb = items.length > 3 ? `<span class="order-thumb-more">+${items.length - 3}</span>` : '';

      const title = items.length
        ? items.map(it => esc(it.name) + (it.qty > 1 ? ` ×${it.qty}` : '')).join(', ')
        : esc(o['Which Product'] || '—');

      return `
        <article class="order-card" data-idx="${idx}" tabindex="0" role="button"
                 aria-label="View order details">
          <div class="order-card-thumbs">${thumbs}${moreThumb}</div>
          <div class="order-card-body">
            <div class="order-card-line">
              <strong class="order-card-title">${title}</strong>
              <span class="order-status status-${esc(status)}">${esc(status)}</span>
            </div>
            <div class="order-card-meta">
              <span>${esc(o['Date'] || '')}</span>
              <span class="order-card-dot">&middot;</span>
              <span>${count} item${count === 1 ? '' : 's'}</span>
            </div>
            <div class="order-card-foot">
              <span class="order-card-paid">${fmt(o['Received Amount'])} paid</span>
              <span class="order-card-link">View details &rarr;</span>
            </div>
          </div>
        </article>`;
    }).join('');

    list.querySelectorAll('.order-card').forEach(card => {
      const open = () => openOrder(orders[Number(card.dataset.idx)]);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  function openOrder(order) {
    if (!order) return;
    sessionStorage.setItem('milir_order', JSON.stringify(order));
    location.href = 'order.html';
  }
})();
