/* ============================================================
   pages/order.js — single order detail page (order.html)
   Reads the order chosen on my-orders.html from sessionStorage.
   ============================================================ */

import { parseOrderProducts } from '../catalog.js';

(function () {
  const root = document.getElementById('orderRoot');
  if (!root) return;

  let order = null;
  try { order = JSON.parse(sessionStorage.getItem('milir_order') || 'null'); }
  catch (e) { order = null; }

  if (!order) {
    root.innerHTML = `
      <div class="pd-notfound">
        <h1>No order selected</h1>
        <p>Open an order from your orders list to see its full details.</p>
        <a class="btn btn-primary" href="my-orders.html"><span>Go to My Orders</span></a>
      </div>`;
    return;
  }

  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  render();
  // Sheet-added products load asynchronously — re-resolve once so they link too.
  setTimeout(render, 1300);

  function itemHtml(it) {
    const qty = it.qty > 1 ? `<span class="order-item-qty">Qty: ${it.qty}</span>` : '';
    if (it.product) {
      const p = it.product;
      return `
        <a class="order-item" href="product.html?id=${encodeURIComponent(p.id)}">
          <div class="order-item-thumb"><img src="${esc(p.img)}" alt="${esc(p.name)}"></div>
          <div class="order-item-info">
            <strong>${esc(p.name)}</strong>
            <div class="order-item-meta">
              ${qty}
              <span class="order-item-price">${inr(p.price)}</span>
            </div>
          </div>
          <span class="order-item-arrow">View product &rarr;</span>
        </a>`;
    }
    const initial = (it.name.trim()[0] || '?').toUpperCase();
    return `
      <div class="order-item order-item-static">
        <div class="order-item-thumb"><span class="order-thumb-ph">${esc(initial)}</span></div>
        <div class="order-item-info">
          <strong>${esc(it.name)}</strong>
          <div class="order-item-meta">${qty}</div>
        </div>
      </div>`;
  }

  function render() {
    const status = (order['Status'] || 'success').toString();
    const items = parseOrderProducts(order['Which Product']);
    const discount = Number(order['Discount']) || 0;
    const promo = (order['Promo Code'] || '').toString().trim();

    root.innerHTML = `
      <div class="order-detail">
        <div class="order-detail-head">
          <div>
            <span class="modal-eyebrow">Order</span>
            <h1 class="order-detail-title">Order summary</h1>
            <p class="order-detail-date">Placed on ${esc(order['Date'] || '—')}</p>
          </div>
          <span class="order-status status-${esc(status)}">${esc(status)}</span>
        </div>

        <section class="order-detail-section">
          <h2>Items in this order</h2>
          <div class="order-items">
            ${items.length ? items.map(itemHtml).join('')
              : `<p class="order-detail-empty">${esc(order['Which Product'] || 'No items recorded')}</p>`}
          </div>
        </section>

        <div class="order-detail-cols">
          <section class="order-detail-section">
            <h2>Payment</h2>
            <div class="order-summary-box">
              <div class="summary-row"><span>Amount</span><strong>${inr(order['Amount'])}</strong></div>
              ${discount > 0 ? `<div class="summary-row order-summary-offer">
                <span>Offer${promo ? ' (' + esc(promo) + ')' : ''}</span>
                <strong>&minus;${inr(discount)}</strong>
              </div>` : ''}
              <div class="summary-row summary-total"><span>Total paid</span><strong>${inr(order['Received Amount'])}</strong></div>
              <div class="summary-row"><span>Payment ID</span><strong>${esc(order['Payment ID'] || '—')}</strong></div>
            </div>
          </section>

          <section class="order-detail-section">
            <h2>Delivery</h2>
            <div class="order-info-box">
              <div><span>Name</span><p>${esc(order['Name'] || '—')}</p></div>
              <div><span>Phone</span><p>${esc(order['Phone'] || '—')}</p></div>
              <div><span>Email</span><p>${esc(order['Email'] || '—')}</p></div>
              <div><span>Shipping address</span><p>${esc(order['Shipping Address'] || '—')}</p></div>
            </div>
          </section>
        </div>

        <a class="link-arrow" href="my-orders.html">&larr; Back to all orders</a>
      </div>`;
  }
})();
