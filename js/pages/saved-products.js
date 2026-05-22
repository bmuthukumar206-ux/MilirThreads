/* ============================================================
   pages/saved-products.js — saved products grid (saved-products.html)
   Reads the favorites Set (persisted in localStorage as `milir_faves`).
   ============================================================ */

import { PRODUCTS } from '../catalog.js';
import { favorites } from '../favorites.js';

(function () {
  const track = document.getElementById('savedProductsTrack');
  const sub = document.getElementById('savedSub');
  if (!track) return;

  function render() {
    const ids = [...favorites];
    if (!ids.length) {
      sub.textContent = 'No saved products yet — tap the heart on any product to save it.';
      track.innerHTML = `
        <div class="orders-empty" style="grid-column:1/-1; padding:40px 16px;">
          <p>You haven't saved anything yet.</p>
          <p><a href="shop.html" class="link-arrow">Browse the shop &rarr;</a></p>
        </div>`;
      return;
    }

    const items = ids.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
    sub.textContent = `${items.length} item${items.length === 1 ? '' : 's'} bookmarked.`;

    track.innerHTML = items.map(p => `
      <article class="product-card" data-id="${p.id}">
        <div class="product-img">
          <img src="${p.img}" alt="${p.name}" loading="lazy">
          ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
          <button class="product-fav active" aria-label="Remove" onclick="toggleFav(event, '${p.id}'); setTimeout(window.refreshSavedPage, 0)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>
            </svg>
          </button>
          <div class="product-overlay">
            <button class="quick-btn" onclick="openBuyModal('${p.id}')">Quick buy</button>
          </div>
        </div>
        <div class="product-cat">${p.category || ''}</div>
        <h3 class="product-name">${p.name}</h3>
        <div class="product-price">
          <strong>₹${Number(p.price).toLocaleString('en-IN')}</strong>
          ${p.mrp && p.mrp > p.price ? `<s>₹${Number(p.mrp).toLocaleString('en-IN')}</s>` : ''}
        </div>
        <button class="add-cart-btn" onclick="addToCart('${p.id}')">Add to cart</button>
      </article>
    `).join('');
  }

  window.refreshSavedPage = render;

  // Wait briefly for loadSheetProducts to merge sheet products in, then render.
  render();
  setTimeout(render, 800);
})();
