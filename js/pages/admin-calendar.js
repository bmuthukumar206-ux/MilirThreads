/* ============================================================
   pages/admin-calendar.js — schedule board (admin-calendar.html)
   Month grid + day timeline for orders / events / launches.
   ============================================================ */

import { CONFIG } from '../config.js';
import { currentUser, persistUser } from '../session.js';
import { showToast } from '../toast.js';
import { postAuth } from '../api.js';

(function () {
  // Auth gate — admin only
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Admins only. Please sign in with an admin account.');
    location.replace('index.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const CATEGORIES = ['order', 'event', 'launch'];
  const catLabel = (c) => ({ order: 'Order', event: 'Event', launch: 'Launch' }[c] || 'Event');

  // Small inline icons per category (reference-image style).
  const CAT_ICONS = {
    order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    event: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    launch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/></svg>'
  };

  // Turn a raw webhook error into a clear instruction for the admin.
  function friendlyError(err) {
    const e = (err || '').toString();
    if (!e || /unknown payload type/i.test(e)) {
      return 'Calendar saving isn’t live yet — redeploy the Apps Script: Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy, then reload this page.';
    }
    return e;
  }

  // ----- date helpers (all local time) -----
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  function fmtTime(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
    if (!m) return '';
    let h = Number(m[1]);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
  }

  // ----- state -----
  const today = new Date();
  const todayStr = ymd(today);
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();   // 0-11
  let selectedDate = todayStr;
  let entries = [];                   // [{id,date,time,title,category,notes}]
  let backendReady = true;            // false → webhook can't serve the calendar yet

  // ----- load -----
  // Always renders the calendar; never throws. If the webhook can't serve
  // calendar data yet, the page still works and shows a calm inline hint.
  async function load() {
    backendReady = true;
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      backendReady = false;
      renderCalendar();
      renderDay();
      return;
    }
    try {
      const res = await fetch(`${CONFIG.SHEETS_WEBHOOK}?action=calendar&_t=${Date.now()}`);
      const data = await res.json();
      if (data && data.status === 'ok' && Array.isArray(data.entries)) {
        entries = data.entries;
      } else {
        // Reached the webhook, but this deployment doesn't know the
        // 'calendar' action — it needs to be redeployed as a new version.
        backendReady = false;
      }
    } catch (err) {
      backendReady = false;
    }
    renderCalendar();
    renderDay();
  }

  // ----- render: month grid -----
  function entriesByDate() {
    const map = {};
    entries.forEach(e => {
      if (!e.date) return;
      (map[e.date] = map[e.date] || []).push(e);
    });
    return map;
  }

  function renderCalendar() {
    $('calMonthLabel').textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    const byDate = entriesByDate();

    // First cell = Monday on/just before the 1st of the month.
    const first = new Date(viewYear, viewMonth, 1);
    const offset = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
    const start = new Date(viewYear, viewMonth, 1 - offset);

    let html = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const ds = ymd(d);
      const inMonth = d.getMonth() === viewMonth;
      const dayEntries = byDate[ds] || [];

      let dots = '';
      if (dayEntries.length) {
        const shown = dayEntries.slice(0, 5);
        dots = shown.map(e => `<span class="cal-dot ${'cat-' + (CATEGORIES.indexOf(e.category) >= 0 ? e.category : 'event')}"></span>`).join('');
        if (dayEntries.length > 5) dots += `<span class="cal-cell-more">+${dayEntries.length - 5}</span>`;
      }

      const cls = ['cal-cell'];
      if (!inMonth) cls.push('muted');
      if (ds === todayStr) cls.push('today');
      if (ds === selectedDate && inMonth) cls.push('selected');

      html += `
        <div class="${cls.join(' ')}" data-date="${ds}"${inMonth ? '' : ' data-muted="1"'}>
          <span class="cal-cell-num">${d.getDate()}</span>
          <span class="cal-cell-dots">${dots}</span>
        </div>`;
    }
    $('calGrid').innerHTML = html;
  }

  // ----- render: day timeline -----
  function renderDay() {
    const list = entries
      .filter(e => e.date === selectedDate)
      .sort((a, b) => (a.time || '~').localeCompare(b.time || '~'));

    // Heading — "Today · Friday 6 Feb" style.
    const d = parseYmd(selectedDate);
    const longOpts = { weekday: 'long', day: 'numeric', month: 'short' };
    const dayText = d ? d.toLocaleDateString('en-IN', longOpts) : (selectedDate || '');
    $('calDayTitle').textContent = selectedDate === todayStr ? `Today · ${dayText}` : dayText;
    $('calDayCount').textContent = !backendReady ? ''
      : (list.length ? `${list.length} scheduled` : 'Nothing scheduled');

    const wrap = $('calTimeline');

    if (!backendReady) {
      wrap.innerHTML = `
        <div class="cal-hint">
          <strong>Calendar storage isn’t connected yet</strong>
          <span>Redeploy the Apps Script — <em>Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy</em> — then reload. The calendar still works for browsing in the meantime.</span>
        </div>`;
      return;
    }
    if (!list.length) {
      wrap.innerHTML = '<p class="cal-empty-day">Nothing scheduled for this day.<br>Use <strong>+ Add</strong> to plan something.</p>';
      return;
    }
    wrap.innerHTML = list.map(e => {
      const cat = CATEGORIES.indexOf(e.category) >= 0 ? e.category : 'event';
      return `
        <article class="cal-event cat-${cat}">
          <span class="cal-event-icon">${CAT_ICONS[cat]}</span>
          <div class="cal-event-body">
            <div class="cal-event-top">
              <strong>${esc(e.title)}</strong>
              <span class="cal-event-time">${e.time ? esc(fmtTime(e.time)) : 'All day'}</span>
            </div>
            <span class="cal-event-cat">${esc(catLabel(cat))}</span>
            ${e.notes ? `<p>${esc(e.notes)}</p>` : ''}
          </div>
          <button class="cal-event-del" type="button" data-id="${esc(e.id)}" aria-label="Delete">&times;</button>
        </article>`;
    }).join('');

    wrap.querySelectorAll('.cal-event-del').forEach(btn => {
      btn.addEventListener('click', () => deleteEntry(btn.dataset.id));
    });
  }

  // ----- month navigation -----
  function shiftMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar();
  }

  // ----- modal -----
  const modal = $('entryModal');
  const form = $('entryForm');
  const note = $('entryNote');

  function openModal(dateStr) {
    form.reset();
    note.textContent = '';
    note.className = 'form-note';
    form.elements.date.value = dateStr || selectedDate || todayStr;
    form.elements.category.value = 'event';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => form.elements.title.focus(), 60);
  }
  function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  // ----- add -----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      type: 'calendar_add',
      admin_email: currentUser.email,
      date: (fd.get('date') || '').toString(),
      time: (fd.get('time') || '').toString(),
      title: (fd.get('title') || '').toString().trim(),
      category: (fd.get('category') || 'event').toString(),
      notes: (fd.get('notes') || '').toString().trim()
    };
    if (!payload.date || !payload.title) {
      note.textContent = 'Pick a date and enter a title.';
      note.className = 'form-note error';
      return;
    }

    const submitBtn = $('entrySubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    note.textContent = 'Saving…';
    note.className = 'form-note';

    const r = await postAuth(payload);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Save entry';

    if (r && r.status === 'ok') {
      backendReady = true;
      entries.push(r.entry || {
        id: 'tmp_' + Date.now(), date: payload.date, time: payload.time,
        title: payload.title, category: payload.category, notes: payload.notes
      });
      // Jump the view to the scheduled month and select that day.
      const d = parseYmd(payload.date);
      if (d) { viewYear = d.getFullYear(); viewMonth = d.getMonth(); }
      selectedDate = payload.date;
      renderCalendar();
      renderDay();
      closeModal();
      showToast('Entry scheduled', 'success');
    } else {
      note.textContent = friendlyError(r && r.error);
      note.className = 'form-note error';
      showToast('Could not save the entry', 'error');
    }
  });

  // ----- delete -----
  async function deleteEntry(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    if (!window.confirm(`Delete "${entry.title}"?`)) return;

    const r = await postAuth({
      type: 'calendar_delete',
      admin_email: currentUser.email,
      id: id
    });
    if (r && r.status === 'ok') {
      entries = entries.filter(e => e.id !== id);
      renderCalendar();
      renderDay();
      showToast('Entry removed', 'success');
    } else {
      showToast(friendlyError(r && r.error), 'error');
    }
  }

  // ----- wire up -----
  $('calPrev').addEventListener('click', () => shiftMonth(-1));
  $('calNext').addEventListener('click', () => shiftMonth(1));
  $('calToday').addEventListener('click', () => {
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    selectedDate = todayStr;
    renderCalendar();
    renderDay();
  });
  $('calGrid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-cell');
    if (!cell || cell.dataset.muted) return;
    selectedDate = cell.dataset.date;
    renderCalendar();
    renderDay();
  });
  $('newEntryBtn').addEventListener('click', () => openModal(selectedDate));
  $('calDayAdd').addEventListener('click', () => openModal(selectedDate));
  $('entryClose').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
  });
  $('refreshBtn').addEventListener('click', load);
  $('adminLogout').addEventListener('click', () => {
    persistUser(null);
    location.replace('index.html');
  });

  // ----- boot -----
  renderCalendar();
  load();
})();
