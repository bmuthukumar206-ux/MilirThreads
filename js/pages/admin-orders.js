/* ============================================================
   pages/admin-orders.js — order tracking Kanban board
   (admin-orders.html)
   Drag order cards between New / Out for delivery / Delivered.
   ============================================================ */

import { CONFIG } from '../config.js';
import { currentUser, persistUser } from '../session.js';
import { showToast } from '../toast.js';
import { postAuth, fetchAllOrders } from '../api.js';
import { parseOrderProducts } from '../catalog.js';
import { loadSheetProducts } from '../sheet-products.js';

(function () {
  // Auth gate — must be admin
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

  // Kanban stages, in order. listEl / countEl filled at init.
  const STAGES = [
    { id: 'received',         label: 'New orders',       listId: 'colReceived', countId: 'colCountReceived' },
    { id: 'out_for_delivery', label: 'Out for delivery', listId: 'colOut',      countId: 'colCountOut' },
    { id: 'delivered',        label: 'Delivered',        listId: 'colDelivered', countId: 'colCountDelivered' }
  ];
  const STAGE_IDS = STAGES.map(s => s.id);
  const stageLabel = (id) => (STAGES.find(s => s.id === id) || {}).label || id;

  // Only paid orders enter the delivery pipeline.
  const isPaid = (o) => /^(success|approved|demo)$/i.test((o['Status'] || 'success').toString());
  // Normalise a row's delivery stage; blank/unknown defaults to the first column.
  const stageOf = (o) => {
    const v = (o['Delivery Status'] || 'received').toString().toLowerCase().trim();
    return STAGE_IDS.indexOf(v) >= 0 ? v : 'received';
  };

  let orders = [];          // board orders (paid only); index = card data-idx
  let draggedIdx = null;

  // -------------------- LOAD --------------------
  async function load() {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      $('boardState').hidden = false;
      $('boardState').textContent = 'Webhook URL not set in js/config.js → CONFIG.SHEETS_WEBHOOK.';
      return;
    }
    $('boardState').hidden = false;
    $('boardState').textContent = 'Loading orders…';
    showToast('Loading orders…', 'info');

    // Merge admin-added products so order cards can show their images.
    try { await loadSheetProducts(); } catch (e) { /* non-fatal */ }

    const { orders: all, error } = await fetchAllOrders(currentUser);
    if (error) {
      $('boardState').hidden = false;
      $('boardState').textContent = error;
      showToast(error, 'error');
      return;
    }
    // fetchAllOrders already returns rows newest-first.
    orders = (all || []).filter(isPaid);
    renderBoard();
    showToast('Board updated', 'success');
  }

  // -------------------- RENDER --------------------
  function cardHtml(o, idx) {
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

    const payStatus = (o['Status'] || 'success').toString();
    const stage = stageOf(o);
    const sIdx = STAGE_IDS.indexOf(stage);
    const prev = STAGES[sIdx - 1];
    const next = STAGES[sIdx + 1];

    return `
      <article class="kanban-card" draggable="true" data-idx="${idx}">
        <div class="kanban-card-thumbs">${thumbs || '<span class="kanban-thumb-ph">?</span>'}${more}</div>
        <div class="kanban-card-body">
          <strong class="kanban-card-title">${title}</strong>
          <div class="kanban-card-meta">
            <span class="kanban-card-cust">${esc(o['Name'] || '—')}</span>
            <span class="kanban-card-amt">${fmt(o['Received Amount'])}</span>
          </div>
          <div class="kanban-card-sub">
            <span>${esc(o['Date'] || '')}</span>
            <span class="order-status status-${esc(payStatus)}">${esc(payStatus)}</span>
          </div>
          <div class="kanban-card-id">${esc(o['Payment ID'] || 'No payment id')}</div>
          <div class="kanban-card-move">
            ${prev ? `<button type="button" class="kanban-move-btn" data-idx="${idx}" data-stage="${prev.id}">&lsaquo; ${esc(prev.label)}</button>` : '<span></span>'}
            ${next ? `<button type="button" class="kanban-move-btn next" data-idx="${idx}" data-stage="${next.id}">${esc(next.label)} &rsaquo;</button>` : '<span></span>'}
          </div>
        </div>
      </article>`;
  }

  function renderBoard() {
    const buckets = { received: [], out_for_delivery: [], delivered: [] };
    orders.forEach((o, idx) => buckets[stageOf(o)].push(idx));

    STAGES.forEach(s => {
      const list = $(s.listId);
      const idxs = buckets[s.id];
      list.innerHTML = idxs.length
        ? idxs.map(idx => cardHtml(orders[idx], idx)).join('')
        : '<p class="kanban-empty">Drop orders here</p>';
      $(s.countId).textContent = idxs.length;
    });

    // Stat cards
    $('countReceived').textContent = buckets.received.length;
    $('countOut').textContent = buckets.out_for_delivery.length;
    $('countDelivered').textContent = buckets.delivered.length;
    $('countTotal').textContent = orders.length;

    const state = $('boardState');
    if (!orders.length) {
      state.hidden = false;
      state.textContent = 'No paid orders yet.';
    } else {
      state.hidden = true;
    }

    wireCards();
  }

  // -------------------- MOVE --------------------
  async function moveOrder(idx, newStage) {
    const o = orders[idx];
    if (!o || STAGE_IDS.indexOf(newStage) < 0) return;
    const oldStage = stageOf(o);
    if (oldStage === newStage) return;

    // Optimistic update
    o['Delivery Status'] = newStage;
    renderBoard();

    const r = await postAuth({
      type: 'delivery_status',
      admin_email: currentUser.email,
      payment_id: o['Payment ID'] || '',
      order_date: o['Date'] || '',
      order_email: o['Email'] || '',
      delivery_status: newStage
    });

    if (r && r.status === 'ok') {
      showToast(`Moved to “${stageLabel(newStage)}”`, 'success');
    } else {
      // Revert on failure
      o['Delivery Status'] = oldStage;
      renderBoard();
      showToast((r && r.error) || 'Could not update order', 'error');
    }
  }

  // -------------------- DRAG & DROP --------------------
  function wireCards() {
    document.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        draggedIdx = Number(card.dataset.idx);
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', card.dataset.idx); } catch (err) { /* IE */ }
      });
      card.addEventListener('dragend', () => {
        draggedIdx = null;
        card.classList.remove('dragging');
        document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
      });
    });

    document.querySelectorAll('.kanban-move-btn').forEach(btn => {
      btn.addEventListener('click', () => moveOrder(Number(btn.dataset.idx), btn.dataset.stage));
    });
  }

  function wireColumns() {
    document.querySelectorAll('.kanban-col').forEach(col => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave', (e) => {
        if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
      });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const idx = draggedIdx != null ? draggedIdx : Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isNaN(idx)) moveOrder(idx, col.dataset.stage);
      });
    });
  }

  // -------------------- WIRE UP --------------------
  $('refreshBtn').addEventListener('click', load);
  $('adminLogout').addEventListener('click', () => {
    persistUser(null);
    location.replace('index.html');
  });

  wireColumns();
  load();
})();
