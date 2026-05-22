/* ============================================================
   checkout.js — buy modal, promo codes, Razorpay payment
   ============================================================ */

import { CONFIG } from './config.js';
import { PRODUCTS } from './catalog.js';
import { cart, cartCount, cartSubtotal, updateCart } from './cart.js';
import { showToast } from './toast.js';

const modal = document.getElementById('buyModal');
const modalProduct = document.getElementById('modalProduct');
const modalAmount = document.getElementById('modalAmount');
const modalClose = document.getElementById('modalClose');
const buyForm = document.getElementById('buyForm');

let selectedProduct = null;
let checkoutMode = 'single';
let appliedPromo = null;

const PROMO_CODES = {
  MILIR10: { percent: 10, label: '10% off (MILIR10)' }
};

function getBaseAmount() {
  if (checkoutMode === 'cart') return cartSubtotal();
  return selectedProduct ? selectedProduct.price : 0;
}

function refreshSummary() {
  const sumAmountEl = document.getElementById('sumAmount');
  const sumDiscountEl = document.getElementById('sumDiscount');
  const sumDiscountRow = document.getElementById('sumDiscountRow');
  const sumReceivedEl = document.getElementById('sumReceived');
  if (!sumAmountEl) return;

  const amount = getBaseAmount();
  const discount = appliedPromo ? Math.round(amount * appliedPromo.percent / 100) : 0;
  const received = amount - discount;

  const fmt = (n) => `₹${n.toLocaleString('en-IN')}`;
  sumAmountEl.textContent = fmt(amount);
  sumDiscountEl.textContent = `−${fmt(discount)}`;
  sumDiscountRow.hidden = discount === 0;
  sumReceivedEl.textContent = fmt(received);
  modalAmount.textContent = fmt(received);
}

// Exposed globally for inline onclick handlers in rendered product cards.
window.openBuyModal = function (productId) {
  selectedProduct = PRODUCTS.find(p => p.id === productId);
  if (!selectedProduct) return;
  checkoutMode = 'single';
  appliedPromo = null;
  resetPromoUi();
  modalProduct.textContent = `${selectedProduct.name} · ₹${selectedProduct.price.toLocaleString('en-IN')}`;
  refreshSummary();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

/** Open the buy modal in "whole cart" checkout mode. */
export function openCartCheckout() {
  const n = cartCount();
  if (n === 0) return;
  checkoutMode = 'cart';
  selectedProduct = null;
  appliedPromo = null;
  resetPromoUi();
  const names = Array.from(cart.entries()).map(([id, qty]) => {
    const p = PRODUCTS.find(x => x.id === id);
    return p ? `${p.name}${qty > 1 ? ` ×${qty}` : ''}` : '';
  }).filter(Boolean).join(', ');
  modalProduct.textContent = `${n} item${n === 1 ? '' : 's'} · ${names}`;
  refreshSummary();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function resetPromoUi() {
  const promoInput = document.getElementById('promoInput');
  const promoNote = document.getElementById('promoNote');
  const promoApply = document.getElementById('promoApply');
  if (promoInput) {
    promoInput.value = '';
    promoInput.disabled = false;
  }
  if (promoNote) {
    promoNote.textContent = '';
    promoNote.className = 'promo-note';
  }
  if (promoApply) {
    promoApply.textContent = 'Apply';
    promoApply.disabled = false;
  }
}

document.getElementById('promoApply')?.addEventListener('click', () => {
  const input = document.getElementById('promoInput');
  const note = document.getElementById('promoNote');
  const applyBtn = document.getElementById('promoApply');
  if (!input) return;

  if (appliedPromo) {
    appliedPromo = null;
    resetPromoUi();
    refreshSummary();
    return;
  }

  const code = input.value.trim().toUpperCase();
  if (!code) {
    note.textContent = 'Enter a code first.';
    note.className = 'promo-note warn';
    return;
  }
  const promo = PROMO_CODES[code];
  if (!promo) {
    note.textContent = 'Invalid code.';
    note.className = 'promo-note error';
    showToast('Invalid promo code', 'error');
    return;
  }
  appliedPromo = { code, ...promo };
  note.textContent = `✓ ${promo.label} applied`;
  note.className = 'promo-note success';
  input.disabled = true;
  applyBtn.textContent = 'Remove';
  refreshSummary();
  showToast('Promo applied', 'success');
});

function closeModal() {
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

modalClose?.addEventListener('click', closeModal);
modal?.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

buyForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (checkoutMode === 'single' && !selectedProduct) return;
  if (checkoutMode === 'cart' && cartCount() === 0) return;

  const data = new FormData(buyForm);
  const customer = {
    name: data.get('name'),
    phone: data.get('phone'),
    email: data.get('email'),
    address: data.get('address')
  };

  const isCart = checkoutMode === 'cart';
  const amount = getBaseAmount();
  const discount = appliedPromo ? Math.round(amount * appliedPromo.percent / 100) : 0;
  const received = amount - discount;

  const cartItems = isCart
    ? Array.from(cart.entries()).map(([id, qty]) => {
        const p = PRODUCTS.find(x => x.id === id);
        return { id, name: p?.name, qty, price: p?.price };
      })
    : [{ id: selectedProduct.id, name: selectedProduct.name, qty: 1, price: selectedProduct.price }];

  const productsLabel = cartItems.map(it => it.qty > 1 ? `${it.name} ×${it.qty}` : it.name).join(', ');
  const description = isCart ? `${cartCount()} items from ${CONFIG.BUSINESS.name}` : selectedProduct.name;

  const buildPayload = (paymentId, status) => ({
    type: 'payment',
    timestamp: new Date().toISOString(),
    payment_id: paymentId,
    mode: checkoutMode,
    products: productsLabel,
    items: cartItems,
    amount,
    discount,
    received_amount: received,
    promo_code: appliedPromo?.code || '',
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
    shipping_address: customer.address,
    status
  });

  const postToSheet = async (payload) => {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) return;
    try {
      await fetch(CONFIG.SHEETS_WEBHOOK, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } catch (err) { console.error('Sheet logging failed', err); }
  };

  const finishOrder = () => {
    closeModal();
    buyForm.reset();
    if (isCart) cart.clear();
    else cart.set(selectedProduct.id, (cart.get(selectedProduct.id) || 0) + 1);
    appliedPromo = null;
    resetPromoUi();
    updateCart();
  };

  // Demo mode if Razorpay key isn't set
  if (CONFIG.RAZORPAY_KEY.includes('XXXXXXXX')) {
    postToSheet(buildPayload(`demo_${Date.now()}`, 'demo'));
    showToast(`Order placed (demo) · ₹${received.toLocaleString('en-IN')}`, 'success');
    finishOrder();
    return;
  }

  const options = {
    key: CONFIG.RAZORPAY_KEY,
    amount: received * 100,
    currency: 'INR',
    name: CONFIG.BUSINESS.name,
    description,
    prefill: {
      name: customer.name,
      email: customer.email,
      contact: customer.phone
    },
    notes: {
      address: customer.address,
      products: productsLabel,
      promo: appliedPromo?.code || '',
      mode: checkoutMode
    },
    theme: { color: CONFIG.BUSINESS.color },
    handler: async function (response) {
      await postToSheet(buildPayload(response.razorpay_payment_id, 'success'));
      showToast(`Payment successful! ID: ${response.razorpay_payment_id.slice(-8)}`, 'success');
      finishOrder();
    },
    modal: {
      ondismiss: function () {
        showToast('Payment cancelled', 'warn');
      }
    }
  };

  const rzp = new Razorpay(options);
  rzp.on('payment.failed', async function (resp) {
    await postToSheet({
      ...buildPayload(resp.error?.metadata?.payment_id || '', 'failed'),
      error_code: resp.error?.code,
      error_description: resp.error?.description
    });
    showToast(`Payment failed: ${resp.error?.description || 'try again'}`, 'error');
  });
  rzp.open();
});
