/* ============================================================
   api.js — communication with the Google Apps Script webhook
   ============================================================ */

import { CONFIG } from './config.js';

/** POST a JSON payload and return the parsed JSON response. */
export async function postAuth(payload) {
  if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
    return { status: 'error', error: 'Webhook not configured' };
  }
  try {
    const res = await fetch(CONFIG.SHEETS_WEBHOOK, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    return { status: 'error', error: 'Network error: ' + err.message };
  }
}

/** Fetch the orders that belong to a single signed-in customer. */
export async function fetchOrders(user) {
  if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) return { orders: [], error: null };
  if (!user || !user.email) return { orders: [], error: 'Not signed in' };
  const params = new URLSearchParams({
    action: 'orders',
    email: user.email,
    phone: user.phone || '',
    name: user.name || ''
  });
  try {
    const res = await fetch(`${CONFIG.SHEETS_WEBHOOK}?${params.toString()}`);
    const data = await res.json();
    if (data.status !== 'ok') return { orders: [], error: data.error || 'Could not load orders' };
    return { orders: Array.isArray(data.orders) ? data.orders : [], error: null };
  } catch (err) {
    return { orders: [], error: 'Network error: ' + err.message };
  }
}

/** Fetch all customer reviews for a single product. */
export async function fetchReviews(productId) {
  if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) return { reviews: [], error: null };
  try {
    const params = new URLSearchParams({ action: 'reviews', id: productId || '', _t: Date.now() });
    const res = await fetch(`${CONFIG.SHEETS_WEBHOOK}?${params.toString()}`);
    const data = await res.json();
    if (data.status !== 'ok') return { reviews: [], error: data.error || 'Could not load reviews' };
    return { reviews: Array.isArray(data.reviews) ? data.reviews : [], error: null };
  } catch (err) {
    return { reviews: [], error: 'Network error: ' + err.message };
  }
}

/** Submit a new customer review. Returns the parsed webhook response. */
export async function postReview(review) {
  return postAuth({ type: 'review_add', ...review });
}

/** Fetch every order across all customers — admin only. */
export async function fetchAllOrders(adminUser) {
  if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) return { orders: [], error: null };
  if (!adminUser || adminUser.role !== 'admin') return { orders: [], error: 'Admin only' };
  const params = new URLSearchParams({
    action: 'orders',
    email: adminUser.email,
    all: '1'
  });
  try {
    const res = await fetch(`${CONFIG.SHEETS_WEBHOOK}?${params.toString()}`);
    const data = await res.json();
    if (data.status !== 'ok') return { orders: [], error: data.error || 'Not authorized' };
    return { orders: Array.isArray(data.orders) ? data.orders : [], error: null };
  } catch (err) {
    return { orders: [], error: 'Network error: ' + err.message };
  }
}
