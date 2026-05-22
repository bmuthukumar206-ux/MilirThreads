/* ============================================================
   pages/search.js — full catalog search (search.html)
   ============================================================ */

import { PRODUCTS, SHOP_SECTIONS } from '../catalog.js';
import { favorites } from '../favorites.js';

(function () {
  const $ = (id) => document.getElementById(id);
  const grid = $('searchResults');
  const countEl = $('searchCount');
  const searchInput = $('searchInput');
  const clearBtn = $('searchClear');
  const sectionFilters = $('sectionFilters');
  const priceFilters = $('priceFilters');
  const sortSelect = $('searchSort');
  if (!grid) return;

  let query = '';
  let activeSection = 'all';
  let activePrice = 'all';
  let activeSort = 'popular';

  const escape = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // Build section filter pills from SHOP_SECTIONS (rebuilt after the sheet
  // products load, since they can add new sections).
  function buildSectionFilters() {
    const names = ['all'].concat(SHOP_SECTIONS.map(s => s.name));
    sectionFilters.innerHTML = names.map(n => `
      <button class="filter-pill ${n === activeSection ? 'active' : ''}" data-section="${escape(n)}">
        ${n === 'all' ? 'All' : escape(n)}
      </button>
    `).join('');
    sectionFilters.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeSection = btn.dataset.section;
        sectionFilters.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p === btn));
        render();
      });
    });
  }

  function priceMatches(price) {
    switch (activePrice) {
      case 'under1000':  return price < 1000;
      case '1000-2500':  return price >= 1000 && price <= 2500;
      case 'above2500':  return price > 2500;
      default:           return true;
    }
  }

  function render() {
    let items = PRODUCTS.slice();

    // Text search across name, category, description
    if (query) {
      const q = query.toLowerCase();
      items = items.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.section || '').toLowerCase().includes(q) ||
        (p.shopCategory || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    // Section filter
    if (activeSection !== 'all') {
      items = items.filter(p => p.section === activeSection);
    }
    // Price filter
    items = items.filter(p => priceMatches(Number(p.price) || 0));

    // Sort
    switch (activeSort) {
      case 'price-asc':  items.sort((a, b) => a.price - b.price); break;
      case 'price-desc': items.sort((a, b) => b.price - a.price); break;
      case 'discount':   items.sort((a, b) => ((b.mrp || b.price) - b.price) - ((a.mrp || a.price) - a.price)); break;
      case 'new':        items.sort((a, b) => (b.badge === 'New') - (a.badge === 'New')); break;
    }

    countEl.textContent = `${items.length} product${items.length === 1 ? '' : 's'}`
      + (query ? ` for "${query}"` : '');

    if (!items.length) {
      grid.innerHTML = '<p class="empty-products">No products match your search.</p>';
      return;
    }

    grid.innerHTML = items.map(p => {
      const href = `product.html?id=${encodeURIComponent(p.id)}`;
      return `
      <article class="product-card" data-id="${escape(p.id)}">
        <div class="product-img">
          <a class="product-img-link" href="${href}"><img src="${escape(p.img)}" alt="${escape(p.name)}" loading="lazy"></a>
          ${p.badge ? `<span class="product-badge">${escape(p.badge)}</span>` : ''}
          <button class="product-fav ${favorites.has(p.id) ? 'active' : ''}" aria-label="Save" onclick="toggleFav(event, '${escape(p.id)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>
            </svg>
          </button>
          <div class="product-overlay">
            <button class="quick-btn" onclick="openBuyModal('${escape(p.id)}')">Quick buy</button>
          </div>
        </div>
        <div class="product-cat">${escape(p.category || '')}</div>
        <h3 class="product-name"><a href="${href}">${escape(p.name)}</a></h3>
        <div class="product-price">
          <strong>₹${Number(p.price).toLocaleString('en-IN')}</strong>
          ${p.mrp && p.mrp > p.price ? `<s>₹${Number(p.mrp).toLocaleString('en-IN')}</s>` : ''}
        </div>
        <button class="add-cart-btn" onclick="addToCart('${escape(p.id)}')">Add to cart</button>
      </article>
    `;
    }).join('');
  }

  // Wire controls
  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim();
    clearBtn.hidden = !query;
    render();
  });
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    query = '';
    clearBtn.hidden = true;
    render();
    searchInput.focus();
  });
  priceFilters.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activePrice = btn.dataset.price;
      priceFilters.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p === btn));
      render();
    });
  });
  sortSelect.addEventListener('change', () => {
    activeSort = sortSelect.value;
    render();
  });

  // Pre-fill from ?q= in the URL (so the nav search can deep-link)
  const urlQuery = new URLSearchParams(location.search).get('q');
  if (urlQuery) {
    searchInput.value = urlQuery;
    query = urlQuery.trim();
    clearBtn.hidden = !query;
  }

  // Initial render with whatever PRODUCTS holds now, then again once the
  // sheet-loaded products have merged in (loadSheetProducts is async).
  buildSectionFilters();
  render();
  setTimeout(() => { buildSectionFilters(); render(); }, 1000);
})();
