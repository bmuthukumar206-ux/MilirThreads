/* ============================================================
   ui.js — scroll reveal, nav behaviour, sliders, search button
   ============================================================ */

/** Fade-in elements with the .reveal class as they enter the viewport. */
export function setupReveal() {
  const els = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  els.forEach(el => io.observe(el));
}

/** Sticky-nav shadow on scroll + active link based on the section in view. */
export function setupNav() {
  const nav = document.getElementById('navWrap');
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > 20) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
    lastY = y;
  });

  // Active link based on section in view
  const sections = document.querySelectorAll('section[id]');
  const links = document.querySelectorAll('.nav-link');
  const linkMap = new Map();
  links.forEach(l => {
    const href = l.getAttribute('href');
    if (href?.startsWith('#')) linkMap.set(href.slice(1), l);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const link = linkMap.get(e.target.id);
        if (link) {
          links.forEach(l => l.classList.remove('active'));
          link.classList.add('active');
        }
      }
    });
  }, { rootMargin: '-50% 0px -50% 0px' });
  sections.forEach(s => io.observe(s));
}

/** Hamburger menu open/close. */
export function setupMobileMenu() {
  const btn = document.getElementById('menuBtn');
  const menu = document.getElementById('mobileMenu');
  btn?.addEventListener('click', () => {
    btn.classList.toggle('active');
    menu.classList.toggle('active');
  });
  menu?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      btn.classList.remove('active');
      menu.classList.remove('active');
    });
  });
}

/** "New this week" product slider arrows. */
export function setupSlider() {
  const track = document.getElementById('productsTrack');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (!track) return;

  let offset = 0;
  const isDesktop = () => window.innerWidth > 1024;

  function shift(dir) {
    if (!isDesktop()) {
      // mobile: regular horizontal scroll
      track.style.transform = '';
      return;
    }
    const wrap = track.parentElement;
    const trackWidth = track.scrollWidth;
    const wrapWidth = wrap.clientWidth;
    const max = trackWidth - wrapWidth;
    const step = wrapWidth / 2;

    offset += dir * step;
    offset = Math.max(0, Math.min(offset, max));
    track.style.transform = `translateX(-${offset}px)`;
  }

  prevBtn?.addEventListener('click', () => shift(-1));
  nextBtn?.addEventListener('click', () => shift(1));
}

/** Current-offers carousel arrows. */
export function setupOfferSlider() {
  const track = document.querySelector('.offer-scroll');
  const prevBtn = document.getElementById('offerPrevBtn');
  const nextBtn = document.getElementById('offerNextBtn');
  if (!track) return;

  track.addEventListener('wheel', (e) => {
    e.preventDefault();
  }, { passive: false });

  function shift(dir) {
    const card = track.querySelector('.offer-card');
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth;

    track.scrollBy({
      left: dir * step,
      behavior: 'smooth'
    });
  }

  prevBtn?.addEventListener('click', () => shift(-1));
  nextBtn?.addEventListener('click', () => shift(1));
}

// --- Search icon → search page (runs on import) ---
document.getElementById('searchBtn')?.addEventListener('click', () => {
  window.location.href = 'search.html';
});
