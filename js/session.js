/* ============================================================
   session.js — signed-in user state, persistence, admin guard
   ============================================================ */

const AUTH_KEY = 'milir_user';

/** The currently signed-in user (or null). Live binding — importers see updates. */
export let currentUser = null;

try {
  const raw = localStorage.getItem(AUTH_KEY);
  if (raw) currentUser = JSON.parse(raw);
} catch (e) { /* ignore */ }

// Admins are confined to admin-* pages. If a signed-in admin lands on any
// storefront page, send them to admin.html.
(function adminLandingGuard() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const path = (location.pathname || '').toLowerCase();
  const file = path.split('/').pop() || '';
  // Admin pages, plus order.html (so admins can open an order from the
  // calendar / orders board to see its full pricing & bill).
  if (file === 'admin.html' || file.startsWith('admin-') || file === 'order.html') return;
  location.replace('admin.html');
})();

/** SHA-256 hex digest (used to hash passwords before they leave the browser). */
export async function sha256Hex(text) {
  if (!window.crypto?.subtle) {
    // Fallback (very weak) — only happens on ancient browsers
    return 'plain:' + text;
  }
  const buf = new TextEncoder().encode(text || '');
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Save (or clear) the current user and refresh any account UI on the page. */
export function persistUser(user) {
  currentUser = user;
  if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_KEY);
  refreshAccountUi();
}

/** Sync the nav account dot, account drawer text and checkout prefill. */
export function refreshAccountUi() {
  const dot = document.getElementById('accountDot');
  if (dot) dot.hidden = !currentUser;
  const isAdmin = !!(currentUser && currentUser.role === 'admin');
  const adminBtn = document.getElementById('adminPanelBtn');
  if (adminBtn) adminBtn.hidden = !isAdmin;
  // Admins do not have a customer-facing "My orders" view
  const ordersBtn = document.getElementById('viewOrdersBtn');
  if (ordersBtn) ordersBtn.hidden = isAdmin;
  const nameEl = document.getElementById('accountName');
  const metaEl = document.getElementById('accountMeta');
  if (nameEl && currentUser) {
    nameEl.textContent = `Hi, ${currentUser.name}`;
    metaEl.textContent = `${currentUser.email}${isAdmin ? ' · Admin' : ''}`;
  }
  // Prefill checkout if logged in
  const buyForm = document.getElementById('buyForm');
  if (currentUser && buyForm) {
    const nameInput = buyForm.querySelector('input[name="name"]');
    const emailInput = buyForm.querySelector('input[name="email"]');
    const phoneInput = buyForm.querySelector('input[name="phone"]');
    if (nameInput && !nameInput.value) nameInput.value = currentUser.name;
    if (emailInput && !emailInput.value) emailInput.value = currentUser.email;
    if (phoneInput && !phoneInput.value && currentUser.phone) phoneInput.value = currentUser.phone;
  }
}
