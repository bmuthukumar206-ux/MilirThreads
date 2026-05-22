/* ============================================================
   enquiry.js — enquiry form submission (enquiry.html)
   ============================================================ */

import { CONFIG } from './config.js';
import { showToast } from './toast.js';

const enquiryForm = document.getElementById('enquiryForm');
const formNote = document.getElementById('formNote');

enquiryForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  formNote.textContent = 'Sending...';
  formNote.className = 'form-note';

  const data = new FormData(enquiryForm);
  const payload = {
    type: 'lead',
    timestamp: new Date().toISOString(),
    name: data.get('name'),
    phone: data.get('phone'),
    email: data.get('email'),
    interest: data.get('interest'),
    message: data.get('message')
  };

  // If webhook isn't configured yet, just show success (demo mode)
  if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
    setTimeout(() => {
      formNote.textContent = '✓ Thanks! (Demo mode — wire up Google Sheets to save real entries.)';
      formNote.className = 'form-note success';
      enquiryForm.reset();
      showToast('Enquiry sent', 'success');
    }, 600);
    return;
  }

  try {
    await fetch(CONFIG.SHEETS_WEBHOOK, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    formNote.textContent = '✓ Thanks! We\'ll be in touch within a few hours.';
    formNote.className = 'form-note success';
    enquiryForm.reset();
    showToast('Enquiry sent', 'success');
  } catch (err) {
    formNote.textContent = 'Something went wrong. Please WhatsApp us instead.';
    formNote.className = 'form-note error';
    showToast('Something went wrong', 'error');
  }
});
