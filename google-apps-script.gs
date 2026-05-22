/**
 * ============================================================
 * MilirThreads — Google Apps Script Webhook
 * Sheets:
 *   - "Purchase Details" — orders (Date, Name, Phone, Email, Which Product,
 *                          Amount, Received Amount, Discount, ...)
 *   - "Leads"            — enquiry-form submissions
 *   - "Users"            — signups (Date Joined, Name, Email, Phone,
 *                          Password Hash, Role)
 *
 * Endpoints:
 *   POST  type: 'lead'    → append to Leads
 *   POST  type: 'payment' → append to Purchase Details
 *   POST  type: 'signup'  → create user (rejects duplicate email)
 *   POST  type: 'login'   → verify credentials, return user
  *   GET   action: 'orders' email=<email> → all orders for that email
 *
 * Re-deploy as a new version every time you change this file.
 * ============================================================
 */

const PURCHASE_SHEET = 'Purchase Details';
const LEADS_SHEET = 'Leads';
const USERS_SHEET = 'Users';
const PRODUCTS_SHEET = 'Products';
const REVIEWS_SHEET = 'Reviews';
const OTP_LOG_SHEET = 'OTP Login';
const PRODUCTS_FOLDER = 'MilirThreads Product Images';
const TZ = 'Asia/Kolkata';

const OTP_LOG_HEADERS = [
  'Date Sent', 'Email', 'Phone', 'OTP', 'Expires At', 'Status', 'Used At'
];

// Set to true ONLY for local testing. When true, the OTP is also returned in
// the response so you can see it without an SMS provider configured.
// Set to false the moment you integrate a real SMS service.
const OTP_DEV_MODE = true;

// ─── SMS provider ──────────────────────────────────────────────────────────
// Fast2SMS (https://www.fast2sms.com) — free OTP route for India.
//   1. Sign up at fast2sms.com (no credit card needed for the OTP route)
//   2. Dashboard → Dev API → copy your API key
//   3. Paste it below.
// Leave blank to keep the dev-mode fallback (OTP logged to Executions).
const FAST2SMS_API_KEY = 'WnsjIvEBUgiLYtCPN42z89GM3HFlRfcxmydSAq0prJkw7OeTX5ZUoyDcFOqrlWYnMg8Td6P37JaCXHwk';

// Admin convention: any email containing ".admin" before the @ is treated as admin.
//   e.g.   owner.admin@gmail.com   → admin role
//          dinesh.admin@anything   → admin role
//          regular@gmail.com       → user role
// The signup form auto-assigns role based on this rule.
function isAdminEmail(email) {
  const local = (email || '').split('@')[0].toLowerCase();
  return local.indexOf('.admin') !== -1;
}

// OTP for password reset (kept in PropertiesService, 10-minute expiry)
const OTP_TTL_MS = 10 * 60 * 1000;
const FROM_NAME = 'MilirThreads';

const PURCHASE_HEADERS = [
  'Date', 'Name', 'Phone', 'Email', 'Which Product',
  'Amount', 'Received Amount', 'Discount', 'Promo Code',
  'Payment ID', 'Status', 'Shipping Address'
];

const LEADS_HEADERS = [
  'Date', 'Name', 'Phone', 'Email', 'Interest', 'Message', 'Qualified'
];

const USERS_HEADERS = [
  'Date Joined', 'Name', 'Email', 'Phone', 'Password Hash', 'Role', 'Last Login', 'Last Method', 'Favorites'
];

const PRODUCTS_HEADERS = [
  'Date Added', 'Code', 'Name', 'Section', 'Sub Category', 'Price', 'Description', 'Image URL', 'Added By'
];

const REVIEWS_HEADERS = [
  'Date', 'Product ID', 'Product Name', 'Customer Name', 'Email', 'Rating', 'Review'
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    let result;
    switch (data.type) {
      case 'lead':            logLead(ss, data); result = { status: 'ok' }; break;
      case 'payment':         logPayment(ss, data); result = { status: 'ok' }; break;
      case 'signup':          result = signupUser(ss, data); break;
      case 'login':           result = loginUser(ss, data); break;
      case 'forgot_request':  result = requestPasswordReset(ss, data); break;
      case 'forgot_confirm':  result = confirmPasswordReset(ss, data); break;
      case 'otp_request':     result = requestLoginOtp(ss, data); break;
      case 'otp_confirm':     result = confirmLoginOtp(ss, data); break;
      case 'google_login':    result = googleLogin(ss, data); break;
      case 'lead_qualify':    result = setLeadQualified(ss, data); break;
      case 'order_status':    result = setOrderStatus(ss, data); break;
            case 'product_add':     result = addProduct(ss, data); break;
      case 'product_delete':  result = deleteProduct(ss, data); break;
      case 'favorite_toggle': result = toggleFavorite(ss, data); break;
      case 'review_add':      result = addReview(ss, data); break;
      default: throw new Error('Unknown payload type: ' + data.type);
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.toString() });
  }
}

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : null;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const p = e.parameter || {};

    if (action === 'orders') {
      return jsonResponse(getOrdersForRequester(ss, {
        email: p.email, phone: p.phone, name: p.name, wantsAll: p.all === '1'
      }));
    }
    if (action === 'adminStats') {
      return jsonResponse(getAdminStats(ss, p.email));
    }
    if (action === 'products') {
      return jsonResponse(getProducts(ss));
    }
    if (action === 'favorites') {
      return jsonResponse(getFavorites(ss, p.email));
    }
    if (action === 'reviews') {
      return jsonResponse(getReviews(ss, p.id));
    }
    return jsonResponse({ status: 'ok', service: 'MilirThreads webhook' });
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sha256Hex(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text || '', Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function getOrCreateSheet(ss, name, headers, headerColor) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground(headerColor || '#1f4944')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function logPayment(ss, data) {
  const sheet = getOrCreateSheet(ss, PURCHASE_SHEET, PURCHASE_HEADERS, '#1f4944');
    const when = data.timestamp ? new Date(data.timestamp) : new Date();
  sheet.appendRow([
Utilities.formatDate(when, TZ, 'yyyy-MM-dd HH:mm:ss'),
data.customer_name || '',
data.customer_phone || '',
data.customer_email || '',
data.products || (data.items ? data.items.map(function (i) { return i.qty > 1 ? (i.name + ' x' + i.qty) : i.name; }).join(', ') : ''),
Number(data.amount) || 0,
Number(data.received_amount) || 0,
Number(data.discount) || 0,
data.promo_code || '',
data.payment_id || '',
    data.status || 'success',
data.shipping_address || ''
  ]);
}

// Auto-add the Qualified column to old Leads sheets that pre-date the feature.
// Idempotent and safe to call before any Lead read/write.
function ensureLeadsQualifiedColumn(sheet) {
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('Qualified') >= 0) return;
  const newCol = lastCol + 1;
  sheet.getRange(1, newCol)
    .setValue('Qualified')
    .setFontWeight('bold').setBackground('#3a322a').setFontColor('#ffffff');
  const rows = sheet.getLastRow() - 1;
  if (rows > 0) {
    const fill = [];
    for (let i = 0; i < rows; i++) fill.push(['pending']);
    sheet.getRange(2, newCol, rows, 1).setValues(fill);
  }
}

function logLead(ss, data) {
  const sheet = getOrCreateSheet(ss, LEADS_SHEET, LEADS_HEADERS, '#3a322a');
  ensureLeadsQualifiedColumn(sheet);
  const when = data.timestamp ? new Date(data.timestamp) : new Date();
  sheet.appendRow([
    Utilities.formatDate(when, TZ, 'yyyy-MM-dd HH:mm:ss'),
    data.name || '',
    data.phone || '',
    data.email || '',
    data.interest || '',
    data.message || '',
    'pending' // qualified column: pending | qualified | unqualified
  ]);
}

// Auto-add Last Login / Last Method / Favorites columns to old Users sheets.
function ensureUsersColumns(sheet) {
  if (!sheet) return;
  const needed = ['Last Login', 'Last Method', 'Favorites'];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  needed.forEach(name => {
    if (headers.indexOf(name) === -1) {
      const newCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newCol)
        .setValue(name)
        .setFontWeight('bold').setBackground('#4a3a2c').setFontColor('#ffffff');
    }
  });
}

function recordLogin(sheet, rowIndex, method) {
  ensureUsersColumns(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const loginCol = headers.indexOf('Last Login');
  const methodCol = headers.indexOf('Last Method');
  if (loginCol >= 0) sheet.getRange(rowIndex, loginCol + 1).setValue(
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss')
  );
  if (methodCol >= 0) sheet.getRange(rowIndex, methodCol + 1).setValue(method);
}

function findUserRow(sheet, email) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if ((values[i][2] || '').toString().toLowerCase() === email) {
      return { rowIndex: i + 1, row: values[i] }; // 1-indexed for sheet ops
    }
  }
  return null;
}

function signupUser(ss, data) {
  const sheet = getOrCreateSheet(ss, USERS_SHEET, USERS_HEADERS, '#4a3a2c');
  const email = (data.email || '').toLowerCase().trim();
  if (!email || !data.password_hash || !data.name) {
    return { status: 'error', error: 'Missing required fields' };
  }
  // Reject duplicate
  if (findUserRow(sheet, email)) {
    return { status: 'error', error: 'Account with this email already exists' };
  }
  const role = isAdminEmail(email) ? 'admin' : 'user';
  sheet.appendRow([
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'),
    data.name,
    email,
    data.phone || '',
    data.password_hash,
    role
  ]);
  return { status: 'ok', user: { name: data.name, email: email, phone: data.phone || '', role: role } };
}

function loginUser(ss, data) {
  const email = (data.email || '').toLowerCase().trim();
  const hash = data.password_hash || '';
  if (!email || !hash) return { status: 'error', error: 'Email and password required' };

  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return { status: 'error', error: 'No accounts found' };
  const found = findUserRow(sheet, email);
  if (!found) return { status: 'error', error: 'No account with this email' };
  if ((found.row[4] || '') !== hash) return { status: 'error', error: 'Invalid password' };

  ensureUsersColumns(sheet);
  recordLogin(sheet, found.rowIndex, 'password');

  return {
    status: 'ok',
    user: {
      name: found.row[1],
      email: email,
      phone: found.row[3] || '',
      role: found.row[5] || 'user'
    }
  };
}

/* ---------- FORGOT PASSWORD ---------- */
function otpKey(email) { return 'OTP::' + email.toLowerCase(); }

function requestPasswordReset(ss, data) {
  const email = (data.email || '').toLowerCase().trim();
  if (!email) return { status: 'error', error: 'Email required' };
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return { status: 'error', error: 'No accounts found' };
  const found = findUserRow(sheet, email);
  if (!found) return { status: 'error', error: 'No account with this email' };

  const otp = ('' + Math.floor(100000 + Math.random() * 900000));
  const cache = PropertiesService.getScriptProperties();
  cache.setProperty(otpKey(email), JSON.stringify({ otp: otp, expires: Date.now() + OTP_TTL_MS }));

  try {
    MailApp.sendEmail({
      to: email,
      name: FROM_NAME,
      subject: 'Your MilirThreads password reset code',
      htmlBody:
        '<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#05070b">' +
          '<h2 style="font-family:Georgia,serif;font-weight:400;margin:0 0 12px">Password reset</h2>' +
          '<p>Hello ' + (found.row[1] || '') + ', use the code below to reset your MilirThreads password.</p>' +
          '<div style="background:#f2f6fb;border-radius:8px;padding:18px;text-align:center;margin:18px 0">' +
            '<div style="font-size:30px;font-weight:700;letter-spacing:0.4em">' + otp + '</div>' +
          '</div>' +
          '<p style="font-size:12px;color:#738197">This code expires in 10 minutes. If you didn\'t request a reset, ignore this email.</p>' +
        '</div>'
    });
  } catch (err) {
    return { status: 'error', error: 'Could not send email: ' + err.toString() };
  }

  return { status: 'ok' };
}

function confirmPasswordReset(ss, data) {
  const email = (data.email || '').toLowerCase().trim();
  const otp = (data.otp || '').toString().trim();
  const newHash = data.new_password_hash || '';
  if (!email || !otp || !newHash) return { status: 'error', error: 'Missing fields' };

  const cache = PropertiesService.getScriptProperties();
  const raw = cache.getProperty(otpKey(email));
  if (!raw) return { status: 'error', error: 'No active reset request' };
  const record = JSON.parse(raw);
  if (Date.now() > record.expires) {
    cache.deleteProperty(otpKey(email));
    return { status: 'error', error: 'Code expired' };
  }
  if (record.otp !== otp) return { status: 'error', error: 'Invalid code' };

  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return { status: 'error', error: 'No accounts found' };
  const found = findUserRow(sheet, email);
  if (!found) return { status: 'error', error: 'No account with this email' };

  // Update Password Hash column (col 5, 1-indexed)
  sheet.getRange(found.rowIndex, 5).setValue(newHash);
  cache.deleteProperty(otpKey(email));

  return {
    status: 'ok',
    user: {
      name: found.row[1],
      email: email,
      phone: found.row[3] || '',
      role: found.row[5] || 'user'
    }
  };
}

/* ---------- OTP LOGIN (passwordless) ---------- */
function loginOtpKey(identifier) { return 'LOGIN_OTP::' + identifier.toLowerCase(); }

// Look up a user by email OR phone. Returns { rowIndex, row, email } or null.
function findUserByEmailOrPhone(sheet, identifier) {
  if (!sheet || !identifier) return null;
  const v = identifier.toString().trim().toLowerCase();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const email = (values[i][2] || '').toString().toLowerCase();
    const phone = (values[i][3] || '').toString().replace(/\D/g, '');
    const search = v.replace(/\D/g, '');
    if (email === v) return { rowIndex: i + 1, row: values[i], email: values[i][2] };
    if (search && phone && phone.endsWith(search.slice(-10))) {
      return { rowIndex: i + 1, row: values[i], email: values[i][2] };
    }
  }
  return null;
}

// Normalise a phone number to digits-only, dropping country-code variants and
// the leading 0 so different inputs match (e.g. "+91 98765 43210", "9876543210",
// "098765 43210" all collapse to "9876543210").
function normalisePhone(raw) {
  const digits = (raw || '').toString().replace(/\D/g, '');
  if (!digits) return '';
  // Keep the last 10 digits (works for IN); for international, also store full.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Auto-add the Email column to existing OTP Login sheets that pre-date the
// email-OTP flow (idempotent).
function ensureOtpLoginColumns(sheet) {
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('Email') === -1) {
    // Insert "Email" column right after "Date Sent" (column 2).
    sheet.insertColumnAfter(1);
    sheet.getRange(1, 2)
      .setValue('Email')
      .setFontWeight('bold').setBackground('#854d0e').setFontColor('#ffffff');
  }
}

// Append an OTP row to the OTP Login sheet so every send is auditable.
function logOtpSend(ss, email, phone, otp, expires) {
  const sheet = getOrCreateSheet(ss, OTP_LOG_SHEET, OTP_LOG_HEADERS, '#854d0e');
  ensureOtpLoginColumns(sheet);
  // Build row by header positions to survive schema migrations.
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = new Array(headers.length).fill('');
  const set = (h, v) => { const i = headers.indexOf(h); if (i >= 0) row[i] = v; };
  set('Date Sent', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'));
  set('Email', email);
  set('Phone', phone);
  set('OTP', otp);
  set('Expires At', Utilities.formatDate(new Date(expires), TZ, 'yyyy-MM-dd HH:mm:ss'));
  set('Status', 'sent');
  sheet.appendRow(row);
}

// Find the most recent unused, unexpired OTP row for this email.
function findLatestOtpRow(ss, email) {
  const sheet = ss.getSheetByName(OTP_LOG_SHEET);
  if (!sheet) return null;
  ensureOtpLoginColumns(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0];
  const emailCol = headers.indexOf('Email');
  const otpCol = headers.indexOf('OTP');
  const expCol = headers.indexOf('Expires At');
  const statCol = headers.indexOf('Status');
  const phoneCol = headers.indexOf('Phone');
  const target = (email || '').toLowerCase();
  for (let i = values.length - 1; i >= 1; i--) {
    if ((values[i][emailCol] || '').toString().toLowerCase() !== target) continue;
    return {
      rowIndex: i + 1,
      otp: (values[i][otpCol] || '').toString(),
      expiresAt: new Date(values[i][expCol]).getTime(),
      status: (values[i][statCol] || '').toString(),
      phone: (phoneCol >= 0 ? (values[i][phoneCol] || '').toString() : '')
    };
  }
  return null;
}

// Delete an OTP row outright (used OR expired) so the sheet stays clean and
// the code can't be replayed even if someone reverses status manually.
function deleteOtpRow(ss, rowIndex) {
  const sheet = ss.getSheetByName(OTP_LOG_SHEET);
  if (!sheet || rowIndex < 2) return;
  try { sheet.deleteRow(rowIndex); } catch (e) { /* row may have shifted */ }
}

// Sweep any stale rows for this email before we send a new code, so the
// "most-recent" lookup always lands on the fresh one.
function purgeOldOtpsForEmail(ss, email) {
  const sheet = ss.getSheetByName(OTP_LOG_SHEET);
  if (!sheet) return;
  ensureOtpLoginColumns(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0];
  const emailCol = headers.indexOf('Email');
  const target = (email || '').toLowerCase();
  for (let i = values.length - 1; i >= 1; i--) {
    if ((values[i][emailCol] || '').toString().toLowerCase() === target) sheet.deleteRow(i + 1);
  }
}

// Sends an SMS via Fast2SMS using their OTP route (free, no DLT registration
// required for OTP messages). Returns true if the SMS was accepted by the API.
//
// Fast2SMS OTP route docs: https://docs.fast2sms.com/#otp-message
// The number must be a 10-digit Indian mobile (no +91 prefix).
// The "variables_values" field is the OTP itself — Fast2SMS appends it to
// a templated message like "Your OTP verification code is XXXXXX".
// Returns { sent: boolean, detail: string } so the caller can surface why
// an SMS attempt failed during testing.
function sendSms(phone, otp) {
  if (!FAST2SMS_API_KEY) return { sent: false, detail: 'No SMS API key configured' };

  const digits = phone.toString().replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return { sent: false, detail: 'Not a 10-digit number' };

  try {
    const url = 'https://www.fast2sms.com/dev/bulkV2'
      + '?authorization=' + encodeURIComponent(FAST2SMS_API_KEY)
      + '&route=otp'
      + '&variables_values=' + encodeURIComponent(otp)
      + '&numbers=' + encodeURIComponent(digits);
    const res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    const code = res.getResponseCode();
    const body = res.getContentText();
    Logger.log('Fast2SMS HTTP ' + code + ' → ' + body);

    if (code !== 200) return { sent: false, detail: 'HTTP ' + code + ' — ' + body.slice(0, 200) };
    const parsed = JSON.parse(body);
    if (parsed.return === true) return { sent: true, detail: 'ok' };
    return { sent: false, detail: parsed.message || JSON.stringify(parsed) };
  } catch (err) {
    Logger.log('Fast2SMS error: ' + err);
    return { sent: false, detail: err.toString() };
  }
}

function requestLoginOtp(ss, data) {
  const email = (data.email || data.identifier || '').toString().trim().toLowerCase();
  const phoneRaw = (data.phone || '').toString().trim();

  if (!email) return { status: 'error', error: 'Email required' };
  if (!/\S+@\S+\.\S+/.test(email)) return { status: 'error', error: 'Please enter a valid email address.' };
  // Phone is optional — only required if provided.
  const phone = phoneRaw ? normalisePhone(phoneRaw) : '';
  if (phoneRaw && phone.length < 10) {
    return { status: 'error', error: 'Please enter a valid 10-digit phone number.' };
  }

  const otp = ('' + Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + OTP_TTL_MS;

  // Purge any prior OTPs for this email, then log the new one.
  purgeOldOtpsForEmail(ss, email);
  logOtpSend(ss, email, phone, otp, expires);

  // Stash in PropertiesService for fast lookup in confirm.
  const cache = PropertiesService.getScriptProperties();
  cache.setProperty(loginOtpKey(email), JSON.stringify({
    otp: otp, email: email, phone: phone, expires: expires
  }));

  // Deliver via email using the existing MailApp permission.
  try {
    MailApp.sendEmail({
      to: email,
      name: FROM_NAME,
      subject: 'Your MilirThreads login code',
      htmlBody:
        '<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#05070b">' +
          '<h2 style="font-family:Georgia,serif;font-weight:400;margin:0 0 12px">Login code</h2>' +
          '<p>Use the code below to sign in to MilirThreads.</p>' +
          '<div style="background:#f2f6fb;border-radius:8px;padding:18px;text-align:center;margin:18px 0">' +
            '<div style="font-size:30px;font-weight:700;letter-spacing:0.4em">' + otp + '</div>' +
          '</div>' +
          '<p style="font-size:12px;color:#738197">This code expires in 10 minutes. If you didn\'t request this, ignore this email.</p>' +
        '</div>'
    });
  } catch (err) {
    return { status: 'error', error: 'Could not send email: ' + err.toString() };
  }

  return { status: 'ok', sentTo: email, expires: expires };
}

function confirmLoginOtp(ss, data) {
  const email = (data.email || data.identifier || '').toString().trim().toLowerCase();
  const otp = (data.otp || '').toString().trim();
  if (!email || !otp) return { status: 'error', error: 'Missing fields' };
  if (!/\S+@\S+\.\S+/.test(email)) return { status: 'error', error: 'Please enter a valid email address.' };

  // Validate against the MOST RECENT OTP row in the OTP Login sheet.
  const latest = findLatestOtpRow(ss, email);
  if (!latest) return { status: 'error', error: 'No OTP requested for this email.' };

  if (Date.now() > latest.expiresAt) {
    deleteOtpRow(ss, latest.rowIndex);
    return { status: 'error', error: 'Code expired. Tap Resend OTP.', expired: true };
  }
  if (latest.otp !== otp) return { status: 'error', error: 'Invalid code' };

  const phone = latest.phone || '';

  // Single-use: delete the OTP row outright.
  deleteOtpRow(ss, latest.rowIndex);
  PropertiesService.getScriptProperties().deleteProperty(loginOtpKey(email));

  // Look up or create the user by email (auto-create if first-time).
  const usersSheet = getOrCreateSheet(ss, USERS_SHEET, USERS_HEADERS, '#4a3a2c');
  ensureUsersColumns(usersSheet);
  let found = findUserRow(usersSheet, email);

  if (!found) {
    const refreshedHeaders = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    const row = new Array(refreshedHeaders.length).fill('');
    const set = (h, v) => { const i = refreshedHeaders.indexOf(h); if (i >= 0) row[i] = v; };
    set('Date Joined', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'));
    set('Name', email.split('@')[0]);
    set('Email', email);
    set('Phone', phone);
    set('Password Hash', 'otp-only');
    set('Role', isAdminEmail(email) ? 'admin' : 'user');
    usersSheet.appendRow(row);
    found = findUserRow(usersSheet, email);
  } else if (phone && !(found.row[3] || '').toString().trim()) {
    // Backfill phone if we collected it this time and the existing row was blank.
    usersSheet.getRange(found.rowIndex, 4).setValue(phone);
    found.row[3] = phone;
  }

  recordLogin(usersSheet, found.rowIndex, 'otp');

  return {
    status: 'ok',
    user: {
      name: found.row[1] || email.split('@')[0],
      email: found.row[2] || email,
      phone: found.row[3] || phone || '',
      role: found.row[5] || 'user'
    }
  };
}

/* ---------- GOOGLE LOGIN ---------- */
// The frontend uses Google Identity Services (GSI) which gives us a JWT ID
// token. We don't strictly verify the signature here (that would require the
// JWK roundtrip) — for an MVP we accept the claims the front-end sends.
// For production hardening, fetch https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=<TOKEN>
// and check the `aud` matches your Client ID.
function googleLogin(ss, data) {
  const email = (data.email || '').toLowerCase().trim();
  const name = (data.name || '').trim();
  if (!email) return { status: 'error', error: 'Google profile missing email' };

  const sheet = getOrCreateSheet(ss, USERS_SHEET, USERS_HEADERS, '#4a3a2c');
  let found = findUserRow(sheet, email);
  if (!found) {
    // Auto-create the account on first Google sign-in.
    const role = isAdminEmail(email) ? 'admin' : 'user';
    sheet.appendRow([
      Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'),
      name || email.split('@')[0],
      email,
      '', // phone
      'google-oauth', // password hash placeholder
      role
    ]);
    found = findUserRow(sheet, email);
  }
  ensureUsersColumns(sheet);
  recordLogin(sheet, found.rowIndex, 'google');
  return {
    status: 'ok',
    user: {
      name: found.row[1],
      email: email,
      phone: found.row[3] || '',
      role: found.row[5] || 'user'
    }
  };
}

function lookupUserRole(ss, email) {
  if (!email) return 'guest';
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return 'guest';
  const found = findUserRow(sheet, email);
  return found ? (found.row[5] || 'user') : 'guest';
}

function rowToOrder(headers, row) {
  const order = {};
  headers.forEach(function (h, j) {
    const v = row[j];
    order[h] = (v instanceof Date) ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss') : v;
  });
  return order;
}

function getOrdersForRequester(ss, opts) {
  const email = (opts.email || '').toLowerCase().trim();
  const phone = (opts.phone || '').toString().trim();
  const name = (opts.name || '').toString().trim().toLowerCase();
  const wantsAll = !!opts.wantsAll;

  if (!email) return { status: 'error', error: 'Missing email' };

  const role = lookupUserRole(ss, email);

  // Admin "all" view is gated by role
  if (wantsAll && role !== 'admin') {
    return { status: 'error', error: 'Not authorized' };
  }

  const sheet = ss.getSheetByName(PURCHASE_SHEET);
  if (!sheet) return { status: 'ok', orders: [], role: role };
    const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { status: 'ok', orders: [], role: role };

  const headers = values[0];
  const emailCol = headers.indexOf('Email');
  const phoneCol = headers.indexOf('Phone');
  const nameCol  = headers.indexOf('Name');

  const orders = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (wantsAll) {
      orders.push(rowToOrder(headers, row));
      continue;
    }
    // Non-admin: require email + phone + name to ALL match (when those fields exist on row)
    const rowEmail = emailCol >= 0 ? (row[emailCol] || '').toString().toLowerCase().trim() : '';
    const rowPhone = phoneCol >= 0 ? (row[phoneCol] || '').toString().trim() : '';
    const rowName  = nameCol  >= 0 ? (row[nameCol]  || '').toString().toLowerCase().trim() : '';

    if (rowEmail !== email) continue;
    if (phone && rowPhone && rowPhone !== phone) continue;
    if (name && rowName && rowName !== name) continue;
    orders.push(rowToOrder(headers, row));
  }
  orders.reverse(); // newest first
  return { status: 'ok', orders: orders, role: role };
}

/* ---------- ADMIN: STATS / QUALIFY / APPROVE ---------- */
function requireAdmin(ss, email) {
  const role = lookupUserRole(ss, (email || '').toLowerCase().trim());
  return role === 'admin';
}

function getAdminStats(ss, requesterEmail) {
  if (!requireAdmin(ss, requesterEmail)) return { status: 'error', error: 'Not authorized' };

  const stats = {
    status: 'ok',
    leads: { total: 0, qualified: 0, unqualified: 0, pending: 0, byInterest: {} },
    sales: { totalReceived: 0, totalDiscount: 0, orderCount: 0, byCategory: {}, byStatus: {} },
    users: { total: 0, admins: 0, newThisWeek: 0 },
    approvals: { count: 0, items: [] },
    recent: { leads: [], orders: [], users: [] }
  };

  // ---- Leads
  const leadsSheet = ss.getSheetByName(LEADS_SHEET);
  if (leadsSheet) {
    ensureLeadsQualifiedColumn(leadsSheet);
    const values = leadsSheet.getDataRange().getValues();
    if (values.length > 1) {
      const headers = values[0];
      const intCol = headers.indexOf('Interest');
      const qCol = headers.indexOf('Qualified');
      stats.leads.total = values.length - 1;
      for (let i = 1; i < values.length; i++) {
        const intr = (values[i][intCol] || 'Unknown').toString();
        stats.leads.byInterest[intr] = (stats.leads.byInterest[intr] || 0) + 1;
        const q = (values[i][qCol] || 'pending').toString().toLowerCase();
        if (q === 'qualified') stats.leads.qualified++;
        else if (q === 'unqualified') stats.leads.unqualified++;
        else stats.leads.pending++;
      }
      // Recent 5 newest
      const recent = values.slice(1).slice(-5).reverse();
      stats.recent.leads = recent.map(function (row) { return rowToOrder(headers, row); });
    }
  }

  // ---- Sales (Purchase Details)
  const psheet = ss.getSheetByName(PURCHASE_SHEET);
  if (psheet) {
    const values = psheet.getDataRange().getValues();
    if (values.length > 1) {
      const headers = values[0];
      const productCol = headers.indexOf('Which Product');
      const receivedCol = headers.indexOf('Received Amount');
      const discountCol = headers.indexOf('Discount');
      const statusCol = headers.indexOf('Status');

      for (let i = 1; i < values.length; i++) {
        const status = (values[i][statusCol] || 'success').toString().toLowerCase();
        stats.sales.byStatus[status] = (stats.sales.byStatus[status] || 0) + 1;
        if (status === 'success' || status === 'approved' || status === 'demo') {
          stats.sales.orderCount++;
          stats.sales.totalReceived += Number(values[i][receivedCol]) || 0;
          stats.sales.totalDiscount += Number(values[i][discountCol]) || 0;
          // Category = first product's category proxy (we don't have category column; use first word of "Which Product")
          const product = (values[i][productCol] || '').toString();
          const cat = categorize(product);
          if (!stats.sales.byCategory[cat]) stats.sales.byCategory[cat] = { count: 0, revenue: 0 };
          stats.sales.byCategory[cat].count += 1;
          stats.sales.byCategory[cat].revenue += Number(values[i][receivedCol]) || 0;
        }
        if (status === 'pending') {
          stats.approvals.count++;
          stats.approvals.items.push(rowToOrder(headers, values[i]));
        }
      }
      const recent = values.slice(1).slice(-8).reverse();
      stats.recent.orders = recent.map(function (row) { return rowToOrder(headers, row); });
    }
  }

  // ---- Users
  const usheet = ss.getSheetByName(USERS_SHEET);
  if (usheet) {
    const values = usheet.getDataRange().getValues();
    if (values.length > 1) {
      const headers = values[0];
      stats.users.total = values.length - 1;
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (let i = 1; i < values.length; i++) {
        if ((values[i][5] || '').toString() === 'admin') stats.users.admins++;
        const joined = new Date(values[i][0]).getTime();
        if (!isNaN(joined) && joined > oneWeekAgo) stats.users.newThisWeek++;
      }
      const recent = values.slice(1).slice(-5).reverse();
      stats.recent.users = recent.map(function (row) {
        return { date: row[0], name: row[1], email: row[2], phone: row[3], role: row[5] };
      });
    }
  }

  return stats;
}

// Heuristic: map product name to a category bucket based on keywords
function categorize(productLabel) {
  const s = (productLabel || '').toLowerCase();
  if (/kurta|dress|dupatta|saree|blouse/.test(s)) return "Women's Clothing";
  if (/earring|pendant|necklace|jewell/.test(s)) return 'Jewellery';
  if (/candle|home|decor|wall/.test(s)) return 'Home Decor';
  if (/gift|hamper|bundle/.test(s)) return 'Handcrafted Gifts';
  if (/bag|tote|sling/.test(s)) return 'Bags';
  if (/kid|frock|child/.test(s)) return 'Kids';
  if (/3d|name plate|miniature/.test(s)) return '3D Product';
  return 'Other';
}

function normaliseDateCell(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
  return (v == null ? '' : v.toString()).trim();
}

function setLeadQualified(ss, data) {
  if (!requireAdmin(ss, data.admin_email)) return { status: 'error', error: 'Not authorized' };
  const sheet = ss.getSheetByName(LEADS_SHEET);
  if (!sheet) return { status: 'error', error: 'Leads sheet missing' };
  ensureLeadsQualifiedColumn(sheet);
  const email = (data.lead_email || '').toLowerCase().trim();
  const dateStr = (data.lead_date || '').toString().trim();
  const newState = (data.qualified || 'pending').toLowerCase(); // qualified | unqualified | pending
  if (!email || !dateStr) return { status: 'error', error: 'Missing lead identifier' };

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const dateCol = headers.indexOf('Date');
  const emailCol = headers.indexOf('Email');
  const qCol = headers.indexOf('Qualified');
  if (qCol < 0) return { status: 'error', error: 'Qualified column could not be added' };

  // Match preferentially on email + date; fall back to last lead with that email
  // when the date doesn't line up (e.g. cell was re-typed / locale changes).
  let lastEmailMatch = -1;
  for (let i = 1; i < values.length; i++) {
    const rowEmail = (values[i][emailCol] || '').toString().toLowerCase().trim();
    if (rowEmail !== email) continue;
    lastEmailMatch = i;
    if (normaliseDateCell(values[i][dateCol]) === dateStr) {
      sheet.getRange(i + 1, qCol + 1).setValue(newState);
      return { status: 'ok', matchedOn: 'email+date' };
    }
  }
  if (lastEmailMatch >= 0) {
    sheet.getRange(lastEmailMatch + 1, qCol + 1).setValue(newState);
    return { status: 'ok', matchedOn: 'email-only' };
  }
  return { status: 'error', error: 'Lead not found' };
}

function setOrderStatus(ss, data) {
  if (!requireAdmin(ss, data.admin_email)) return { status: 'error', error: 'Not authorized' };
  const sheet = ss.getSheetByName(PURCHASE_SHEET);
  if (!sheet) return { status: 'error', error: 'Purchase sheet missing' };
  const paymentId = (data.payment_id || '').toString();
  const newStatus = (data.new_status || '').toLowerCase();
  if (!paymentId || !newStatus) return { status: 'error', error: 'Missing fields' };

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const payCol = headers.indexOf('Payment ID');
  const statusCol = headers.indexOf('Status');
  if (payCol < 0 || statusCol < 0) return { status: 'error', error: 'Sheet columns mismatch' };
  for (let i = 1; i < values.length; i++) {
    if ((values[i][payCol] || '').toString() === paymentId) {
      sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
      return { status: 'ok' };
    }
  }
  return { status: 'error', error: 'Order not found' };
}

/* ---------- PRODUCTS (admin only) ---------- */
function getOrCreateProductsFolder() {
  const it = DriveApp.getFoldersByName(PRODUCTS_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PRODUCTS_FOLDER);
}

function saveProductImage(base64DataUrl, baseName) {
  if (!base64DataUrl) return '';
  const m = base64DataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid image data');
  const mimeType = m[1];
    const ext = mimeType.split('/')[1]    .replace('jpeg', 'jpg');
  const bytes = Utilities.base64Decode(m[2]);
  const cleanName = (baseName || 'product').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const blob = Utilities.newBlob(bytes, mimeType, cleanName + '.' + ext);
  const folder = getOrCreateProductsFolder();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // Drive's `uc?export=view` redirects through a virus-scan page, and the
  // `drive.google.com/thumbnail` endpoint breaks when embedded from non-Google
  // origins. The `lh3.googleusercontent.com/d/<id>` CDN URL is what Google's
  // own products use for anonymous image embedding and works in <img src>.
  return 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w1000';
}

// Migrate an existing Products sheet to the new schema:
//   - Rename 'Category' header → 'Section'
//   - Insert a 'Sub Category' column right after Section if missing
function ensureProductsColumns(sheet) {
  if (!sheet) return;
const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  // Rename Category → Section
  const oldCatIdx = headers.indexOf('Category');
  const sectionIdx = headers.indexOf('Section');
  if (oldCatIdx >= 0 && sectionIdx < 0) {
    sheet.getRange(1, oldCatIdx + 1).setValue('Section');
  }
  // Add Sub Category column if missing
  const refreshed = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (refreshed.indexOf('Sub Category') < 0) {
    const newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol)
      .setValue('Sub Category')
      .setFontWeight('bold').setBackground('#054a3a').setFontColor('#ffffff');
  }
}

function getProducts(ss) {
  const sheet = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sheet) return { status: 'ok', products: [] };
  ensureProductsColumns(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { status: 'ok', products: [] };
  const headers = values[0];
    const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = rowToOrder(headers, values[i]);
        out.push({
      code: row['Code'] || '',
      name: row['Name'] || '',
      section: row['Section'] || row['Category'] || '',
      subCategory: row['Sub Category'] || '',
      price: Number(row['Price']) || 0,
            description: row['Description'] || '',
      image: row['Image URL'] || '',
      dateAdded: row['Date Added'] || ''
    });
  }
  return { status: 'ok', products: out.reverse() };
}

function addProduct(ss, data) {
  if (!requireAdmin(ss, data.admin_email)) return { status: 'error', error: 'Not authorized' };

  const code = (data.code || '').toString().trim();
  const name = (data.name || '').toString().trim();
  // Accept either the new section/sub_category fields or the legacy category field.
  const section = (data.section || data.category || '').toString().trim();
  const subCategory = (data.sub_category || '').toString().trim();
  const price = Number(data.price) || 0;
  const description = (data.description || '').toString().trim();
  if (!code || !name || !section || !subCategory || !price) {
    return { status: 'error', error: 'Code, name, section, sub-category and price are required' };
  }

  const sheet = getOrCreateSheet(ss, PRODUCTS_SHEET, PRODUCTS_HEADERS, '#054a3a');
  ensureProductsColumns(sheet);

  // Reject duplicate code
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const codeCol = headers.indexOf('Code');
  for (let i = 1; i < values.length; i++) {
    if ((values[i][codeCol] || '').toString().toLowerCase() === code.toLowerCase()) {
      return { status: 'error', error: 'A product with this code already exists' };
    }
  }

  let imageUrl = '';
  if (data.image_data) {
    try {
      imageUrl = saveProductImage(data.image_data, code + '_' + (data.image_name || 'image'));
  } catch (err) {
    const msg = err && err.message ? err.message : err.toString();
    if (/permission|authoriz/i.test(msg)) {
      return { status: 'error', error: 'Drive access not authorized. In Apps Script, run `authorizeDriveOnce` once from the editor, then redeploy.' };
    }
    return { status: 'error', error: 'Image upload failed: ' + msg };
}
  }

  // Build row using header positions so the migration above is honored.
  const refreshedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = new Array(refreshedHeaders.length).fill('');
  const set = (h, v) => { const i = refreshedHeaders.indexOf(h); if (i >= 0) row[i] = v; };
  set('Date Added', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'));
  set('Code', code);
  set('Name', name);
  set('Section', section);
  set('Sub Category', subCategory);
    set('Price', price);
  set('Description', description);
  set('Image URL', imageUrl);
  set('Added By', data.admin_email || '');
  sheet.appendRow(row);

  return {     status: 'ok',     product: {       code: code, name: name, section: section, subCategory: subCategory, image: imageUrl } };
}

// Best-effort Drive file delete based on the embed URL we stored.
//   https://lh3.googleusercontent.com/d/<FILE_ID>=w1000
//   https://drive.google.com/uc?...&id=<FILE_ID>
//   https://drive.google.com/thumbnail?id=<FILE_ID>...
function tryDeleteDriveFile(imageUrl) {
  if (!imageUrl) return;
  const patterns = [
    /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_\-]+)/,
        /[?&]id=([a-zA-Z0-9_\-]+)/
  ];
  let fileId = null;
  for (let i = 0; i < patterns.length; i++) {
    const m = imageUrl.match(patterns[i]);
    if (m) { fileId = m[1]; break; }
  }
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (err) {
    // Don't break the delete just because the file is already gone
    // or because Drive permissions weren't granted. The sheet row still
    // gets removed below.
    Logger.log('Drive file delete failed for ' + fileId + ': ' + err);
  }
}

function deleteProduct(ss, data) {
  if (!requireAdmin(ss, data.admin_email)) return { status: 'error', error: 'Not authorized' };
  const code = (data.code || '').toString().trim();
  if (!code) return { status: 'error', error: 'Product code required' };

  const sheet = ss.getSheetByName(PRODUCTS_SHEET);
  if (!sheet) return { status: 'error', error: 'Products sheet missing' };

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { status: 'error', error: 'Product not found' };
  const headers = values[0];
  const codeCol = headers.indexOf('Code');
  const imgCol = headers.indexOf('Image URL');
    if (codeCol < 0) return { status: 'error', error: 'Code column missing' };

  for (let i = 1; i < values.length; i++) {
    if ((values[i][codeCol] || '').toString().toLowerCase() === code.toLowerCase()) {
      const imageUrl = imgCol >= 0 ? (values[i][imgCol] || '').toString() : '';
            sheet.deleteRow(i + 1);
      if (imageUrl)       tryDeleteDriveFile(imageUrl);
      return { status: 'ok', deleted: code };
    }
  }
  return { status: 'error', error: 'Product not found' };
}

/* ---------- FAVORITES (per-user, stored as a comma-joined list in Users sheet) ---------- */
function readUserFavorites(row, headers) {
  const favCol = headers.indexOf('Favorites');
  if (favCol < 0) return [];
  const raw = (row[favCol] || '').toString().trim();
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function writeUserFavorites(sheet, rowIndex, headers, favList) {
  const favCol = headers.indexOf('Favorites');
  if (favCol < 0) return;
  sheet.getRange(rowIndex, favCol + 1).setValue(favList.join(','));
}

function toggleFavorite(ss, data) {
  const email = (data.email || '').toLowerCase().trim();
  const code = (data.product_code || '').toString().trim();
  const action = (data.action || 'toggle').toString();
  if (!email || !code) return { status: 'error', error: 'Missing fields' };

  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return { status: 'error', error: 'No accounts found' };
  ensureUsersColumns(sheet);
  const found = findUserRow(sheet, email);
  if (!found) return { status: 'error', error: 'Account not found' };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const fav = readUserFavorites(found.row, headers);
  const idx = fav.indexOf(code);
  if (action === 'add' || (action === 'toggle' && idx < 0)) {
    if (idx < 0) fav.push(code);
  } else if (action === 'remove' || (action === 'toggle' && idx >= 0)) {
    if (idx >= 0) fav.splice(idx, 1);
  }
  writeUserFavorites(sheet, found.rowIndex, headers, fav);
  return { status: 'ok', favorites: fav };
}

function getFavorites(ss, email) {
  const e = (email || '').toLowerCase().trim();
  if (!e) return { status: 'ok', favorites: [] };
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return { status: 'ok', favorites: [] };
  ensureUsersColumns(sheet);
  const found = findUserRow(sheet, e);
  if (!found) return { status: 'ok', favorites: [] };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return { status: 'ok', favorites: readUserFavorites(found.row, headers) };
}

/* ---------- PRODUCT REVIEWS ---------- */
function addReview(ss, data) {
  var productId = (data.product_id || '').toString().trim();
  var rating = Math.round(Number(data.rating) || 0);
  rating = Math.max(1, Math.min(5, rating));
  var text = (data.review || '').toString().trim();
  var name = (data.customer_name || '').toString().trim() || 'Anonymous';
  if (!productId || !text) {
    return { status: 'error', error: 'Product and review text are required' };
  }
  var sheet = getOrCreateSheet(ss, REVIEWS_SHEET, REVIEWS_HEADERS, '#5b3a86');
  sheet.appendRow([
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'),
    productId,
    (data.product_name || '').toString(),
    name,
    (data.email || '').toString(),
    rating,
    text
  ]);
  return { status: 'ok' };
}

function getReviews(ss, productId) {
  var id = (productId || '').toString().trim();
  var sheet = ss.getSheetByName(REVIEWS_SHEET);
  if (!sheet) return { status: 'ok', reviews: [] };
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { status: 'ok', reviews: [] };
  var headers = values[0];
  var col = function (h) { return headers.indexOf(h); };
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (id && (row[col('Product ID')] || '').toString().trim() !== id) continue;
    var dateCell = row[col('Date')];
    var dateStr = (dateCell instanceof Date)
      ? Utilities.formatDate(dateCell, TZ, 'yyyy-MM-dd')
      : (dateCell || '').toString().slice(0, 10);
    out.push({
      date: dateStr,
      name: (row[col('Customer Name')] || 'Anonymous').toString(),
      rating: Number(row[col('Rating')]) || 0,
      text: (row[col('Review')] || '').toString()
    });
  }
  out.reverse(); // newest first
  return { status: 'ok', reviews: out };
}

/* ---------- TESTS ---------- */
/**
 * Run this ONCE manually from the Apps Script editor BEFORE deploying with
 * Drive features. Google will pop the consent screen for Drive access; click
 * "Advanced → Go to project (unsafe) → Allow". After that the web app can
 * upload images without further prompts.
 */
/**
 * Run this ONCE manually from the Apps Script editor. It calls MailApp
 * directly so Google's permission dialog includes the "Send email as you"
 * scope. Approve all listed permissions, then deploy a NEW VERSION.
 */
function authorizeMailOnce() {
  const me = Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: me || 'noreply@example.com',
    subject: 'MilirThreads — mail scope authorized',
    body: 'If you see this email, your Apps Script web app now has permission to send mail.'
  });
  Logger.log('Sent test email to ' + me);
}

function authorizeDriveOnce() {
  const folder = getOrCreateProductsFolder();
  Logger.log('Drive folder ready: ' + folder.getName() + ' (' + folder.getId() + ')');
  // Tiny 1x1 PNG payload so the upload code path runs end-to-end.
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const url = saveProductImage(tinyPng, 'auth_test');
  Logger.log('Test image uploaded: ' + url);
  return url;
}

function testProductAdd() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Replace this with your admin email before running.
  const adminEmail = 'owner.admin@gmail.com';
  Logger.log(addProduct(ss, {
    admin_email: adminEmail,
    code: 'TEST-' + Date.now(),
    name: 'Test product',
    category: 'Other',
    price: 999,
    description: 'Created from Apps Script editor',
    image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    image_name: 'test'
  }));
}

function testAdminDetect() {
  Logger.log(isAdminEmail('owner.admin@gmail.com')); // true
  Logger.log(isAdminEmail('john@gmail.com'));        // false
}

function testForgot() {
  doPost({ postData: { contents: JSON.stringify({
    type: 'forgot_request',
    email: 'testuser@example.com'
  }) } });
}

function testSignup() {
  doPost({ postData: { contents: JSON.stringify({
    type: 'signup',
    name: 'Test User',
    email: 'testuser@example.com',
    phone: '+919999999999',
    password_hash: sha256Hex('hello123')
  }) } });
}

function testLogin() {
  const r = doPost({ postData: { contents: JSON.stringify({
    type: 'login',
    email: 'testuser@example.com',
    password_hash: sha256Hex('hello123')
  }) } });
  Logger.log(r.getContent());
}

function testOrders() {
  // Own orders
  Logger.log(doGet({ parameter: {
    action: 'orders', email: 'testuser@example.com', phone: '+919999999999', name: 'Test User'
  } }).getContent());
  // Admin "all" view
  Logger.log(doGet({ parameter: {
    action: 'orders', email: 'owner.admin@gmail.com', all: '1'
  } }).getContent());
}
