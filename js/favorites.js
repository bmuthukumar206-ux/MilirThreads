/* ============================================================
   favorites.js — saved products (localStorage + server sync)
   ============================================================ */

import { CONFIG } from './config.js';
import { currentUser } from './session.js';
import { showToast } from './toast.js';

const FAVES_KEY = 'milir_faves';

/** The set of saved product ids. Live binding — importers read it directly. */
export let favorites = new Set();

try {
  const raw = localStorage.getItem(FAVES_KEY);
  if (raw) favorites = new Set(JSON.parse(raw));
} catch (e) { /* ignore */ }

export function saveFavorites() {
  try { localStorage.setItem(FAVES_KEY, JSON.stringify([...favorites])); } catch (e) {}
}

/**
 * Pull favorites from the server right after sign-in so they follow the
 * user across devices. Falls back to localStorage on error.
 */
export async function syncFavoritesFromServer() {
  if (!currentUser || CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) return;
  try {
    const res = await fetch(`${CONFIG.SHEETS_WEBHOOK}?action=favorites&email=${encodeURIComponent(currentUser.email)}`);
    const data = await res.json();
    if (data.status === 'ok' && Array.isArray(data.favorites)) {
      // Merge server + local so anything saved while signed out also persists.
      data.favorites.forEach(id => favorites.add(id));
      saveFavorites();
      // Push the merged set back to the server so both sides stay in sync.
      data.favorites.length !== favorites.size && pushFavoritesToServer();
    }
  } catch (e) { /* ignore */ }
}

export async function pushFavoriteChange(productId, action) {
  if (!currentUser || CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) return;
  try {
    await fetch(CONFIG.SHEETS_WEBHOOK, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        type: 'favorite_toggle',
        email: currentUser.email,
        product_code: productId,
        action: action // 'add' or 'remove'
      })
    });
  } catch (e) { /* best-effort */ }
}

export async function pushFavoritesToServer() {
  // Fire all favorites as add calls; the backend is idempotent on toggle/add.
  if (!currentUser) return;
  for (const id of favorites) {
    pushFavoriteChange(id, 'add');
  }
}

// Exposed globally for inline onclick handlers in rendered product cards.
window.toggleFav = function (e, id) {
  e.stopPropagation();
  const btn = e.currentTarget;
  let action;
  if (favorites.has(id)) {
    favorites.delete(id);
    btn.classList.remove('active');
    showToast('Removed from saved products', 'warn');
    action = 'remove';
  } else {
    favorites.add(id);
    btn.classList.add('active');
    showToast('Saved for later', 'success');
    action = 'add';
  }
  saveFavorites();
  pushFavoriteChange(id, action);
};
