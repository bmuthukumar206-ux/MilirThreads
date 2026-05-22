/* ============================================================
   cart.js — shopping bag state + cart drawer
   ============================================================ */

import { PRODUCTS } from './catalog.js';
import { showToast } from './toast.js';
import { openCartCheckout } from './checkout.js';

/** id → quantity. */
export const cart = new Map();

export function cartCount() {
  let n = 0;
  cart.forEach(qty => n += qty);
  return n;
}

export function cartSubtotal() {
  let total = 0;
  cart.forEach((qty, id) => {
    const p = PRODUCTS.find(x => x.id === id);
    if (p) total += p.price * qty;
  });
  return total;
}

export function updateCart() {
  const countEl = document.getElementById('cartCount');
  if (countEl) countEl.textContent = cartCount();
  renderCartDrawer();
}

export function renderCartDrawer() {
  const list = document.getElementById('cartItems');
  const title = document.getElementById('cartTitle');
  const total = document.getElementById('cartTotal');
  if (!list) return;

  const n = cartCount();
  if (title) title.textContent = `${n} item${n === 1 ? '' : 's'}`;
  if (total) total.textContent = `₹${cartSubtotal().toLocaleString('en-IN')}`;

  if (n === 0) {
    list.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M3 6h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 9H6"/>
          </svg>
        </div>
        <h4>Your bag is empty</h4>
        <p>Add a few handcrafted favourites to get started.</p>
      </div>`;
    return;
  }

  list.innerHTML = Array.from(cart.entries()).map(([id, qty]) => {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return '';
    return `
      <div class="cart-row" data-id="${p.id}">
        <div class="cart-thumb"><img src="${p.img}" alt="${p.name}"></div>
        <div class="cart-info">
          <div class="cart-cat">${p.category}</div>
          <div class="cart-name">${p.name}</div>
          <div class="cart-price">₹${p.price.toLocaleString('en-IN')}</div>
          <div class="qty">
            <button class="qty-btn" data-action="dec" aria-label="Decrease">−</button>
            <span class="qty-val">${qty}</span>
            <button class="qty-btn" data-action="inc" aria-label="Increase">+</button>
            <button class="cart-remove" data-action="remove" aria-label="Remove">Remove</button>
          </div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.cart-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const current = cart.get(id) || 0;
        if (action === 'inc') cart.set(id, current + 1);
        else if (action === 'dec') {
          if (current <= 1) cart.delete(id);
          else cart.set(id, current - 1);
        }
        else if (action === 'remove') cart.delete(id);
        updateCart();
      });
    });
  });
}

export function openCart() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer) return;
  renderCartDrawer();
  drawer.classList.add('active');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

export function closeCart() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer) return;
  drawer.classList.remove('active');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Exposed globally for inline onclick handlers in rendered product cards.
window.addToCart = function (id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;
  cart.set(id, (cart.get(id) || 0) + 1);
  updateCart();
  showToast(`${product.name} added to cart`, 'success');
};

// --- Cart icon buttons (run on import, before the init sequence) ---
document.getElementById('cartBtn')?.addEventListener('click', openCart);
document.getElementById('cartClose')?.addEventListener('click', closeCart);
document.getElementById('cartDrawer')?.addEventListener('click', (e) => {
  if (e.target.id === 'cartDrawer') closeCart();
});
document.getElementById('cartCheckout')?.addEventListener('click', () => {
  if (cartCount() === 0) {
    showToast('Your bag is empty', 'warn');
    return;
  }
  closeCart();
  openCartCheckout();
});
