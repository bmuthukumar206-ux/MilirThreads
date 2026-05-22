/* ============================================================
   toast.js — bottom-screen toast notifications
   ============================================================ */

let toastTimer = null;

/**
 * Show a toast. variant: 'info' | 'success' | 'warn' | 'error'.
 * Legacy boolean values are mapped: true → success, false → warn.
 */
export function showToast(msg, variant = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  if (variant === true) variant = 'success';
  else if (variant === false) variant = 'warn';
  t.textContent = msg;
  t.className = `toast show toast-${variant}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
