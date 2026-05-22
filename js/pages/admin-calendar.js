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
    location.replace('Index.html');
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

  // ----- date helpers (all local time) -----
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  function prettyDay(s) {
    const d = parseYmd(s);
    if (!d) return s || '';
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
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

  // ----- load -----
  async function load() {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      $('calTimeline').innerHTML = '<p class="cal-empty-day">Webhook not configured in js/config.js.</p>';
      renderCalendar();
      return;
    }
    try {
      const res = await fetch(`${CONFIG.SHEETS_WEBHOOK}?action=calendar&_t=${Date.now()}`);
      const data = await res.json();
      if (data.status === 'ok' && Array.isArray(data.entries)) {
        entries = data.entries;
      } else {
        showToast(data.error || 'Could not load calendar', 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
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
    const title = $('calDayTitle');
    title.textContent = selectedDate === todayStr ? `Today · ${prettyDay(selectedDate)}` : prettyDay(selectedDate);

    const list = entries
      .filter(e => e.date === selectedDate)
      .sort((a, b) => (a.time || '~').localeCompare(b.time || '~'));

    const wrap = $('calTimeline');
    if (!list.length) {
      wrap.innerHTML = '<p class="cal-empty-day">Nothing scheduled for this day.<br>Use <strong>+ Add</strong> to plan something.</p>';
      return;
    }
    wrap.innerHTML = list.map(e => {
      const cat = CATEGORIES.indexOf(e.category) >= 0 ? e.category : 'event';
      return `
        <article class="cal-event cat-${cat}">
          <span class="cal-event-time">${e.time ? esc(fmtTime(e.time)) : 'All day'}</span>
          <div class="cal-event-body">
            <span class="cal-event-cat">${esc(catLabel(cat))}</span>
            <strong>${esc(e.title)}</strong>
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
      note.textContent = (r && r.error) || 'Could not save entry';
      note.className = 'form-note error';
      showToast((r && r.error) || 'Save failed', 'error');
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
      showToast((r && r.error) || 'Could not delete entry', 'error');
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
    location.replace('Index.html');
  });

  // ----- boot -----
  renderCalendar();
  load();
})();
