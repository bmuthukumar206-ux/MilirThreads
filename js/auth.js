/* ============================================================
   auth.js — auth modal, OTP login, Google sign-in, account panel
   ============================================================ */

import { postAuth, fetchOrders, fetchAllOrders } from './api.js';
import { currentUser, persistUser, sha256Hex, refreshAccountUi } from './session.js';
import { showToast } from './toast.js';
import { syncFavoritesFromServer } from './favorites.js';

/* ---------- AUTH MODAL ---------- */
export function openAuthModal(tab) {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  switchAuthTab(tab || 'login');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
  ['loginNote', 'signupNote', 'adminNote'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.className = 'form-note'; }
  });
}

function switchAuthTab(tab) {
  const googleWrap = document.getElementById('googleSigninWrap');
  const otpForm = document.getElementById('otpForm');
  const divider = document.querySelector('.auth-divider');
  const secondaryTabs = document.querySelector('.auth-tabs-secondary');

  // OTP + Google + divider + secondary tabs stay visible EXCEPT in the
  // forgot view, which takes over the modal.
  const isForgot = (tab === 'forgot');
  if (googleWrap)    googleWrap.style.display    = isForgot ? 'none' : '';
  if (otpForm)       otpForm.style.display       = isForgot ? 'none' : '';
  if (divider)       divider.style.display       = isForgot ? 'none' : '';
  if (secondaryTabs) secondaryTabs.style.display = isForgot ? 'none' : '';

  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

  // Only toggle the SECONDARY forms (login/signup/forgot). OTP form is kept
  // active at all times so Google + OTP remain visible above whichever
  // secondary form is open.
  ['loginForm', 'signupForm', 'forgotForm'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  if (tab === 'login')  document.getElementById('loginForm')?.classList.add('active');
  if (tab === 'signup') document.getElementById('signupForm')?.classList.add('active');
  if (tab === 'forgot') document.getElementById('forgotForm')?.classList.add('active');
  if (!isForgot) document.getElementById('otpForm')?.classList.add('active');

  const titleMap = {
    otp:    ['Sign in', 'Welcome', 'Phone OTP, Google, or use password below.'],
    login:  ['Sign in', 'Welcome back', 'Log in with email + password.'],
    signup: ['Create account', 'Join MilirThreads', 'Save addresses and track every order.'],
    forgot: ['Reset', 'Forgot password?', 'Enter your email — we\'ll send a 6-digit code.']
  };
  const [eyebrow, title, sub] = titleMap[tab] || titleMap.otp;
  document.getElementById('authEyebrow').textContent = eyebrow;
  document.getElementById('authTitle').textContent = title;
  document.getElementById('authSub').textContent = sub;

  if (tab === 'forgot') showForgotStep('email');
  if (tab === 'otp') showOtpStep('request');
}

function showForgotStep(step) {
  const form = document.getElementById('forgotForm');
  if (!form) return;
  form.querySelectorAll('.forgot-step').forEach(s => {
    s.hidden = s.dataset.step !== step;
  });
  setNote('forgotNote', '');
  if (step === 'reset') {
    document.getElementById('authSub').textContent = 'Enter the 6-digit code from your email and a new password.';
  }
}

/* ---------- ACCOUNT PANEL ---------- */
export function openAccountPanel() {
  if (!currentUser) { openAuthModal('login'); return; }
  const panel = document.getElementById('accountPanel');
  if (!panel) return;
  panel.classList.add('active');
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeAccountPanel() {
  const panel = document.getElementById('accountPanel');
  if (!panel) return;
  panel.classList.remove('active');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function setNote(id, msg, kind) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'form-note' + (kind ? ' ' + kind : '');
}

/* ---------- GOOGLE SIGN-IN ---------- */
// Decodes a Google ID token's payload (no signature verification here —
// see the Apps Script side for the production hardening notes).
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch (e) { return null; }
}

// Exposed globally for the Google Identity Services `data-callback`.
window.handleGoogleSignIn = async function (response) {
  const payload = decodeJwtPayload(response.credential);
  if (!payload || !payload.email) {
    showToast('Google sign-in failed', 'error');
    return;
  }
  setNote('otpNote', 'Signing you in via Google…');
  const r = await postAuth({
    type: 'google_login',
    email: payload.email,
    name: payload.name || payload.given_name || '',
    sub: payload.sub
  });
  if (r.status === 'ok') {
    persistUser(r.user);
    syncFavoritesFromServer();
    const isAdmin = r.user.role === 'admin';
    showToast(`Welcome, ${r.user.name}${isAdmin ? ' (admin)' : ''}`, 'success');
    if (isAdmin) {
      setTimeout(() => location.replace('admin.html'), 300);
    } else {
      setTimeout(() => { closeAuthModal(); openAccountPanel(); }, 300);
    }
  } else {
    showToast(r.error || 'Google sign-in failed', 'error');
  }
};

/* ---------- OTP LOGIN ---------- */
let pendingOtpIdentifier = null;
let otpCountdownTimer = null;
let otpExpiresAt = 0;

function showOtpStep(step) {
  const form = document.getElementById('otpForm');
  if (!form) return;
  form.querySelectorAll('.otp-step').forEach(s => { s.hidden = s.dataset.step !== step; });
  setNote('otpNote', '');
  if (step === 'request') stopOtpCountdown();
}

function stopOtpCountdown() {
  if (otpCountdownTimer) { clearInterval(otpCountdownTimer); otpCountdownTimer = null; }
  const cd = document.getElementById('otpCountdown');
  if (cd) cd.textContent = '';
}

function startOtpCountdown(expiresAt) {
  otpExpiresAt = expiresAt || (Date.now() + 10 * 60 * 1000);
  stopOtpCountdown();
  const cd = document.getElementById('otpCountdown');
  const resend = document.getElementById('otpResendBtn');
  if (resend) resend.disabled = true;

  const tick = () => {
    const remaining = Math.max(0, otpExpiresAt - Date.now());
    if (remaining <= 0) {
      stopOtpCountdown();
      if (cd) cd.textContent = 'Code expired';
      if (cd) cd.classList.add('expired');
      if (resend) resend.disabled = false;
      return;
    }
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    if (cd) {
      cd.classList.remove('expired');
      cd.textContent = `Expires in ${m}:${s.toString().padStart(2, '0')}`;
    }
    // Allow resend in the last 8 minutes (i.e. 2 min after sending)
    if (resend && remaining < 8 * 60 * 1000) resend.disabled = false;
  };
  tick();
  otpCountdownTimer = setInterval(tick, 1000);
}

function maskedDestination(addr) {
  if (!addr) return 'your email';
  if (addr.includes('@')) return addr.replace(/(.).+(@.+)/, '$1•••$2');
  return addr.replace(/.(?=.{4})/g, '•');
}

async function sendLoginOtp() {
  const emailInput = document.querySelector('#otpForm input[name="otp_email"]');
  const phoneInput = document.querySelector('#otpForm input[name="otp_phone"]');
  const email = (emailInput?.value || '').trim().toLowerCase();
  const phone = (phoneInput?.value || '').trim();

  if (!email) {
    setNote('otpNote', 'Enter your email', 'error');
    return;
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    setNote('otpNote', 'Please enter a valid email', 'error');
    return;
  }

  setNote('otpNote', 'Sending code to your email…');
  const r = await postAuth({ type: 'otp_request', email, phone });
  if (r.status === 'ok') {
    pendingOtpIdentifier = email; // confirm step uses the same email
    showOtpStep('verify');
    const sentToEl = document.getElementById('otpSentTo');
    if (sentToEl) sentToEl.textContent = `Code sent to ${maskedDestination(r.sentTo || email)}. Check your inbox.`;
    setNote('otpNote', '');
    showToast('OTP sent to your email', 'success');
    startOtpCountdown(r.expires || Date.now() + 10 * 60 * 1000);
  } else {
    setNote('otpNote', r.error || 'Could not send code', 'error');
    showToast(r.error || 'OTP request failed', 'error');
  }
}

async function resendLoginOtp() {
  if (!pendingOtpIdentifier) {
    showOtpStep('request');
    return;
  }
  const phoneInput = document.querySelector('#otpForm input[name="otp_phone"]');
  const phone = (phoneInput?.value || '').trim();
  setNote('otpNote', 'Resending…');
  const r = await postAuth({ type: 'otp_request', email: pendingOtpIdentifier, phone });
  if (r.status === 'ok') {
    showToast('New code sent', 'success');
    setNote('otpNote', '');
    startOtpCountdown(r.expires || Date.now() + 10 * 60 * 1000);
  } else {
    setNote('otpNote', r.error || 'Could not resend', 'error');
  }
}

async function verifyLoginOtp(e) {
  e.preventDefault();
  if (!pendingOtpIdentifier) { setNote('otpNote', 'Send a code first', 'error'); return; }
  const fd = new FormData(e.target);
  const otp = (fd.get('otp') || '').toString().trim();
  setNote('otpNote', 'Verifying…');
  const r = await postAuth({ type: 'otp_confirm', email: pendingOtpIdentifier, otp });
  if (r.status === 'ok') {
    stopOtpCountdown();
    persistUser(r.user);
    syncFavoritesFromServer();
    pendingOtpIdentifier = null;
    const isAdmin = r.user.role === 'admin';
    setNote('otpNote', `✓ Welcome, ${r.user.name}`, 'success');
    showToast(`Welcome, ${r.user.name}${isAdmin ? ' (admin)' : ''}`, 'success');
    if (isAdmin) setTimeout(() => location.replace('admin.html'), 300);
    else setTimeout(() => { closeAuthModal(); openAccountPanel(); }, 300);
  } else {
    setNote('otpNote', r.error || 'Verification failed', 'error');
    showToast(r.error || 'Invalid OTP', 'error');
    if (r.expired) {
      // Surface the resend button immediately when the server tells us it expired.
      const resend = document.getElementById('otpResendBtn');
      if (resend) resend.disabled = false;
    }
  }
}

/* ---------- ORDERS MODAL (legacy in-page view) ---------- */
async function openOrders(asAdmin) {
  const modal = document.getElementById('ordersModal');
  const list = document.getElementById('ordersList');
  const title = document.getElementById('ordersTitle');
  const sub = document.getElementById('ordersSub');
  if (!modal || !list) return;

  // Guard: only an admin may open the admin view
  if (asAdmin && (!currentUser || currentUser.role !== 'admin')) {
    showToast('Admins only', 'error');
    return;
  }
  if (!asAdmin && !currentUser) {
    openAuthModal('login');
    return;
  }

  title.textContent = asAdmin ? 'All purchases' : 'Your orders';
  sub.textContent = asAdmin
    ? 'Every order across all customers.'
    : 'Orders matched to your name, email and phone.';
  list.innerHTML = '<div class="orders-empty">Loading…</div>';
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const { orders, error } = asAdmin
    ? await fetchAllOrders(currentUser)
    : await fetchOrders(currentUser);

  if (error) {
    list.innerHTML = `<div class="orders-empty">${error}</div>`;
    return;
  }
  if (!orders.length) {
    list.innerHTML = '<div class="orders-empty">No orders yet.</div>';
    return;
  }

  list.innerHTML = orders.map(o => {
    const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
    const status = (o['Status'] || 'success').toString();
    return `
      <article class="order-row order-${status}">
        <header>
          <div>
            <strong>${o['Which Product'] || '—'}</strong>
            <span>${o['Date'] || ''}</span>
          </div>
          <span class="order-status status-${status}">${status}</span>
        </header>
        <div class="order-grid">
          ${asAdmin ? `<div><span>Customer</span><strong>${o['Name'] || ''}</strong></div>` : ''}
          ${asAdmin ? `<div><span>Email</span><strong>${o['Email'] || ''}</strong></div>` : ''}
          <div><span>Amount</span><strong>${fmt(o['Amount'])}</strong></div>
          ${Number(o['Discount']) > 0 ? `<div><span>Discount</span><strong>−${fmt(o['Discount'])} (${o['Promo Code'] || ''})</strong></div>` : ''}
          <div><span>Paid</span><strong>${fmt(o['Received Amount'])}</strong></div>
          <div><span>Payment ID</span><strong>${o['Payment ID'] || '—'}</strong></div>
        </div>
      </article>`;
  }).join('');
}

function closeOrdersModal() {
  const modal = document.getElementById('ordersModal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

/* ---------- WIRING ---------- */
export function setupAuth() {
  document.getElementById('accountBtn')?.addEventListener('click', () => {
    if (currentUser) openAccountPanel();
    else openAuthModal('otp');
  });
  document.getElementById('authClose')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'authModal') closeAuthModal();
  });
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.addEventListener('click', () => switchAuthTab(t.dataset.tab));
  });

  document.getElementById('otpSendBtn')?.addEventListener('click', sendLoginOtp);
  document.getElementById('otpForm')?.addEventListener('submit', verifyLoginOtp);
  document.getElementById('otpResendBtn')?.addEventListener('click', resendLoginOtp);
  document.getElementById('otpChangeBtn')?.addEventListener('click', () => {
    pendingOtpIdentifier = null;
    stopOtpCountdown();
    showOtpStep('request');
  });
  // Inline "Sign up with email" link inside the OTP helper text.
  document.querySelectorAll('#otpForm [data-go]').forEach(btn => {
    btn.addEventListener('click', () => switchAuthTab(btn.dataset.go));
  });

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setNote('loginNote', 'Signing in…');
    const fd = new FormData(e.target);
    const email = fd.get('email').toString().trim().toLowerCase();
    const password_hash = await sha256Hex(fd.get('password').toString());
    const r = await postAuth({ type: 'login', email, password_hash });
    if (r.status === 'ok') {
      persistUser(r.user);
      syncFavoritesFromServer();
      const isAdmin = r.user.role === 'admin';
      setNote('loginNote', '✓ Welcome back, ' + r.user.name + (isAdmin ? ' (admin)' : ''), 'success');
      showToast(`Welcome back, ${r.user.name}${isAdmin ? ' (admin)' : ''}`, 'success');
      if (isAdmin) {
        setTimeout(() => location.replace('admin.html'), 400);
      } else {
        setTimeout(() => { closeAuthModal(); openAccountPanel(); }, 400);
      }
    } else {
      setNote('loginNote', r.error || 'Login failed', 'error');
      showToast(r.error || 'Login failed', 'error');
    }
  });

  document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setNote('signupNote', 'Creating account…');
    const fd = new FormData(e.target);
    const name = fd.get('name').toString().trim();
    const email = fd.get('email').toString().trim().toLowerCase();
    const phone = fd.get('phone').toString().trim();
    const password = fd.get('password').toString();
    if (password.length < 6) {
      setNote('signupNote', 'Password must be at least 6 characters', 'error');
      showToast('Password too short', 'error');
      return;
    }
    const password_hash = await sha256Hex(password);
    const r = await postAuth({ type: 'signup', name, email, phone, password_hash });
    if (r.status === 'ok') {
      persistUser(r.user);
      setNote('signupNote', '✓ Account created', 'success');
      showToast('Account created. Welcome!', 'success');
      if (r.user.role === 'admin') {
        setTimeout(() => location.replace('admin.html'), 400);
      } else {
        setTimeout(() => { closeAuthModal(); openAccountPanel(); }, 400);
      }
    } else {
      setNote('signupNote', r.error || 'Signup failed', 'error');
      showToast(r.error || 'Signup failed', 'error');
    }
  });

  // Forgot password — step 1: send OTP
  document.getElementById('forgotLink')?.addEventListener('click', () => switchAuthTab('forgot'));
  document.getElementById('backToLoginLink')?.addEventListener('click', () => switchAuthTab('login'));

  let pendingResetEmail = null;
  document.getElementById('forgotSendBtn')?.addEventListener('click', async () => {
    const emailInput = document.querySelector('#forgotForm input[name="email"]');
    const email = (emailInput?.value || '').trim().toLowerCase();
    if (!email) {
      setNote('forgotNote', 'Enter your email first', 'error');
      return;
    }
    setNote('forgotNote', 'Sending code to ' + email + '…');
    const r = await postAuth({ type: 'forgot_request', email });
    if (r.status === 'ok') {
      pendingResetEmail = email;
      showForgotStep('reset');
      setNote('forgotNote', '✓ Code sent. Check your inbox.', 'success');
      showToast('Reset code sent', 'success');
    } else {
      setNote('forgotNote', r.error || 'Could not send code', 'error');
      showToast(r.error || 'Reset request failed', 'error');
    }
  });

  // Forgot password — step 2: confirm
  document.getElementById('forgotForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingResetEmail) {
      setNote('forgotNote', 'Send a code first', 'error');
      return;
    }
    setNote('forgotNote', 'Verifying…');
    const fd = new FormData(e.target);
    const otp = (fd.get('otp') || '').toString().trim();
    const newPassword = (fd.get('new_password') || '').toString();
    if (newPassword.length < 6) {
      setNote('forgotNote', 'Password must be at least 6 characters', 'error');
      return;
    }
    const new_password_hash = await sha256Hex(newPassword);
    const r = await postAuth({
      type: 'forgot_confirm',
      email: pendingResetEmail,
      otp,
      new_password_hash
    });
    if (r.status === 'ok') {
      persistUser(r.user);
      setNote('forgotNote', '✓ Password updated. Signed in.', 'success');
      showToast('Password reset successful', 'success');
      pendingResetEmail = null;
      if (r.user.role === 'admin') {
        setTimeout(() => location.replace('admin.html'), 500);
      } else {
        setTimeout(() => { closeAuthModal(); openAccountPanel(); }, 500);
      }
    } else {
      setNote('forgotNote', r.error || 'Reset failed', 'error');
      showToast(r.error || 'Reset failed', 'error');
    }
  });

  document.getElementById('accountClose')?.addEventListener('click', closeAccountPanel);
  document.getElementById('accountPanel')?.addEventListener('click', (e) => {
    if (e.target.id === 'accountPanel') closeAccountPanel();
  });
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    persistUser(null);
    closeAccountPanel();
    showToast('Signed out', 'info');
  });

  document.getElementById('viewOrdersBtn')?.addEventListener('click', () => {
    if (!currentUser) { openAuthModal('otp'); return; }
    window.location.href = 'my-orders.html';
  });
  document.getElementById('savedProductsBtn')?.addEventListener('click', () => {
    window.location.href = 'saved-products.html';
  });
  document.getElementById('trackOrderBtn')?.addEventListener('click', () => {
    if (!currentUser) { openAuthModal('otp'); return; }
    window.location.href = 'my-orders.html#track';
  });
  document.getElementById('adminPanelBtn')?.addEventListener('click', () => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Admins only', 'error');
      return;
    }
    window.location.href = 'admin.html';
  });
  document.getElementById('ordersClose')?.addEventListener('click', closeOrdersModal);
  document.getElementById('ordersModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'ordersModal') closeOrdersModal();
  });

  refreshAccountUi();
}
