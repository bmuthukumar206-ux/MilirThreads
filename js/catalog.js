/* ============================================================
   catalog.js — product catalog, shop sections, render + filters
   ============================================================ */

import { favorites } from './favorites.js';
import { showToast } from './toast.js';
import { closeCart } from './cart.js';

/** The in-memory product catalog. Mutated by sheet-products.js at runtime. */
export const PRODUCTS = [
  {
    id: 'p001',
    name: 'Hand-Block Mulmul Kurta',
    section: 'Women\'s',
    shopCategory: 'Kurtas',
    category: 'Women\'s Clothing',
    price: 2499, mrp: 3200,
    badge: 'New',
    img: 'https://images.unsplash.com/photo-1583846783214-7229a91b20ed?w=600&auto=format&fit=crop',
    description: 'Soft, breathable mulmul cotton kurta finished with traditional hand-block prints. A lightweight everyday piece that stays cool through Indian summers.',
    specs: { Material: 'Mulmul cotton', Fit: 'Relaxed straight', Length: 'Knee length', Care: 'Hand wash cold, dry in shade', Origin: 'Hand-crafted in Chennai' },
    rating: 4.6,
    reviews: [
      { name: 'Aishwarya R.', rating: 5, date: '2026-03-12', text: 'Beautiful print and genuinely soft fabric. Perfect for daily wear.' },
      { name: 'Meena K.', rating: 4, date: '2026-02-28', text: 'Lovely kurta, runs slightly large but the quality is great.' }
    ]
  },
  {
    id: 'p002',
    name: 'Brass Filigree Earrings',
    section: 'HandCraft',
    shopCategory: 'Jewellery',
    category: 'Accessories',
    price: 899, mrp: 1199,
    badge: 'Bestseller',
    img: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=600&auto=format&fit=crop',
    description: 'Delicate brass filigree earrings hand-shaped by skilled artisans. Lightweight enough for all-day wear with a warm antique finish.',
    specs: { Material: 'Brass', Finish: 'Antique gold', Weight: 'Featherlight (4g)', Closure: 'Hook', Care: 'Wipe with a dry cloth' },
    rating: 4.8,
    reviews: [
      { name: 'Divya S.', rating: 5, date: '2026-04-02', text: 'So light I forget I am wearing them. Gorgeous detailing.' },
      { name: 'Priya N.', rating: 5, date: '2026-03-20', text: 'Bestseller for a reason — got compliments all day.' }
    ]
  },
  {
    id: 'p003',
    name: 'Festive Gift Hamper',
    section: 'HandCraft',
    shopCategory: 'Gift Hampers',
    category: 'Handcrafted Gifts',
    price: 1899, mrp: 2400,
    badge: 'Limited',
    img: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&auto=format&fit=crop',
    description: 'A curated hamper of handcrafted treats and decor — the perfect ready-to-gift box for festivals and celebrations.',
    specs: { Contents: 'Assorted handmade items', Packaging: 'Reusable gift box', Occasion: 'Festive / celebration', Customisable: 'Yes, on request' },
    rating: 4.5,
    reviews: [
      { name: 'Karthik V.', rating: 5, date: '2026-03-30', text: 'Gifted this for Diwali — packaging looked premium.' },
      { name: 'Lakshmi G.', rating: 4, date: '2026-03-05', text: 'Good value hamper, would have liked one more item.' }
    ]
  },
  {
    id: 'p004',
    name: 'Linen Wrap Dress',
    section: 'Women\'s',
    shopCategory: 'Dresses',
    category: 'Women\'s Clothing',
    price: 3299, mrp: 3999,
    badge: 'New',
    img: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&auto=format&fit=crop',
    description: 'An easy, elegant wrap dress in pure linen. Adjustable tie waist flatters every figure and keeps you breezy all day.',
    specs: { Material: 'Pure linen', Fit: 'Adjustable wrap', Length: 'Midi', Care: 'Gentle machine wash', Origin: 'Hand-crafted in Chennai' },
    rating: 4.4,
    reviews: [
      { name: 'Sneha M.', rating: 4, date: '2026-04-10', text: 'Beautiful linen, wrinkles a bit as expected. Still love it.' },
      { name: 'Anjali T.', rating: 5, date: '2026-03-18', text: 'The wrap fit is so flattering. Great quality stitching.' }
    ]
  },
  {
    id: 'p005',
    name: 'Terracotta Pendant Set',
    section: 'HandCraft',
    shopCategory: 'Jewellery',
    category: 'Accessories',
    price: 1299, mrp: 1599,
    badge: 'New',
    img: 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=600&auto=format&fit=crop',
    description: 'Earthy hand-painted terracotta pendant with matching earrings. Each piece is moulded and painted by hand, so no two are exactly alike.',
    specs: { Material: 'Terracotta clay', Includes: 'Pendant + earrings', Finish: 'Hand-painted, sealed', Care: 'Avoid water, handle gently' },
    rating: 4.7,
    reviews: [
      { name: 'Revathi P.', rating: 5, date: '2026-04-05', text: 'Such a unique set. The hand-painted finish is stunning.' },
      { name: 'Bhavana R.', rating: 4, date: '2026-02-22', text: 'Pretty and lightweight, just handle with care.' }
    ]
  },
  {
    id: 'p006',
    name: 'Aroma Candle Trio',
    section: 'HandCraft',
    shopCategory: 'Home Decor',
    category: 'Handcrafted Gifts',
    price: 1499, mrp: 1899,
    img: 'https://images.unsplash.com/photo-1602810316693-3667c854239a?w=600&auto=format&fit=crop',
    description: 'A set of three hand-poured soy wax candles in calming scents. Clean, long-lasting burn that fills a room gently.',
    specs: { Material: 'Soy wax', Includes: '3 candles', 'Burn time': '~25 hrs each', Scents: 'Lavender, Sandalwood, Citrus' },
    rating: 4.6,
    reviews: [
      { name: 'Nithya J.', rating: 5, date: '2026-03-25', text: 'Sandalwood one is my favourite. Burns clean with no smoke.' },
      { name: 'Harini D.', rating: 4, date: '2026-03-01', text: 'Nice subtle scents, lasted a good while.' }
    ]
  },
  {
    id: 'p007',
    name: 'Banarasi Silk Dupatta',
    section: 'Women\'s',
    shopCategory: 'Dupattas',
    category: 'Women\'s Clothing',
    price: 4299, mrp: 5499,
    badge: 'Hot',
    img: 'https://images.unsplash.com/photo-1583846783214-7229a91b20ed?w=600&auto=format&fit=crop&sat=-30',
    description: 'A handwoven Banarasi silk dupatta with intricate zari work. A timeless drape that elevates any festive outfit.',
    specs: { Material: 'Banarasi silk', Work: 'Zari weave', Length: '2.5 m', Care: 'Dry clean only', Origin: 'Handwoven, Varanasi' },
    rating: 4.9,
    reviews: [
      { name: 'Gayathri S.', rating: 5, date: '2026-04-12', text: 'The zari work is exquisite. Worth every rupee.' },
      { name: 'Madhuri K.', rating: 5, date: '2026-03-15', text: 'Rich colour and beautiful drape. Felt very premium.' }
    ]
  },
  {
    id: 'p008',
    name: 'Hand-Woven Tote',
    section: 'HandCraft',
    shopCategory: 'Bags',
    category: 'Accessories',
    price: 1799, mrp: 2299,
    badge: 'New',
    img: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=600&auto=format&fit=crop&sat=-20',
    description: 'A roomy hand-woven tote built for everyday use. Sturdy natural fibre with a clean minimal look.',
    specs: { Material: 'Woven jute & cotton', Capacity: 'Fits a 14" laptop', Closure: 'Open top', Care: 'Spot clean only' },
    rating: 4.3,
    reviews: [
      { name: 'Swathi B.', rating: 4, date: '2026-04-08', text: 'Sturdy and spacious. Use it for work daily.' },
      { name: 'Deepa R.', rating: 4, date: '2026-02-18', text: 'Good size, the weave feels durable.' }
    ]
  },
  {
    id: 'p009',
    name: 'Kids Cotton Frock',
    section: 'Kids',
    shopCategory: 'Frocks',
    category: 'Kids Clothing',
    price: 1299, mrp: 1699,
    badge: 'New',
    img: 'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=600&auto=format&fit=crop',
    description: 'A soft cotton frock for little ones — gentle on skin, easy to move in, and machine-wash friendly for busy parents.',
    specs: { Material: 'Soft cotton', Sizes: '1–8 years', Care: 'Machine wash gentle', Origin: 'Hand-crafted in Chennai' },
    rating: 4.7,
    reviews: [
      { name: 'Ramya V.', rating: 5, date: '2026-04-01', text: 'My daughter loves it. Soft and the colours did not fade.' },
      { name: 'Pooja H.', rating: 4, date: '2026-03-10', text: 'Cute frock, good cotton quality.' }
    ]
  },
  {
    id: 'p010',
    name: 'Kids Block Print Shirt',
    section: 'Kids',
    shopCategory: 'Shirts',
    category: 'Kids Clothing',
    price: 999, mrp: 1399,
    img: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=600&auto=format&fit=crop',
    description: 'A breezy block-print shirt for kids in soft cotton. Playful prints made with skin-safe natural dyes.',
    specs: { Material: 'Cotton', Print: 'Hand-block, natural dye', Sizes: '2–10 years', Care: 'Machine wash gentle' },
    rating: 4.5,
    reviews: [
      { name: 'Vidya S.', rating: 5, date: '2026-03-28', text: 'Lovely print and very comfortable for my son.' },
      { name: 'Kavya M.', rating: 4, date: '2026-02-25', text: 'Good fabric for the price.' }
    ]
  },
  {
    id: 'p011',
    name: '3D Carved Name Plate',
    section: '3D Product',
    shopCategory: 'Name Plates',
    category: '3D Product',
    price: 2199, mrp: 2799,
    badge: 'Custom',
    img: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&auto=format&fit=crop',
    description: 'A personalised 3D-carved name plate for your home or workspace. Made to order with your chosen name and finish.',
    specs: { Material: 'Carved MDF / acrylic', Personalised: 'Your name & font', 'Lead time': '5–7 working days', Mounting: 'Wall-mount or stand' },
    rating: 4.8,
    reviews: [
      { name: 'Arun P.', rating: 5, date: '2026-04-09', text: 'Came out exactly as I wanted. Crisp carving.' },
      { name: 'Sandhya R.', rating: 5, date: '2026-03-14', text: 'Great gift idea — they loved the personalisation.' }
    ]
  },
  {
    id: 'p012',
    name: '3D Miniature Keepsake',
    section: '3D Product',
    shopCategory: 'Miniatures',
    category: '3D Product',
    price: 1599, mrp: 1999,
    img: 'https://images.unsplash.com/photo-1617791160588-241658c0f566?w=600&auto=format&fit=crop',
    description: 'A custom 3D miniature keepsake — turn a favourite photo or moment into a detailed printed memento.',
    specs: { Material: '3D-printed resin', Personalised: 'From your photo', 'Lead time': '7–10 working days', Size: 'Approx. 10 cm tall' },
    rating: 4.4,
    reviews: [
      { name: 'Naveen K.', rating: 4, date: '2026-03-22', text: 'Nice detail for the size. Sweet keepsake.' },
      { name: 'Shruti A.', rating: 5, date: '2026-02-20', text: 'Loved how the miniature turned out!' }
    ]
  }
];

/** Two-level shop navigation. Sections/categories grow as sheet products load. */
export const SHOP_SECTIONS = [
  {
    name: 'HandCraft',
    categories: ['Jewellery', 'Gift Hampers', 'Home Decor', 'Bags', 'Accessories']
  },
  {
    name: "Women's",
    categories: ['Kurtas', 'Dresses', 'Dupattas', 'Accessories']
  },
  {
    name: 'Kids',
    categories: ['Frocks', 'Shirts', 'Accessories']
  },
  {
    name: '3D Product',
    categories: ['Name Plates', 'Miniatures']
  }
];

// --- Active shop UI state ---
let activeShopSection = SHOP_SECTIONS[0].name;
let activeShopCategory = SHOP_SECTIONS[0].categories[0];

let activeFilters = { price: 'all', badge: 'all' };
let activeSort = 'popular';
const SORT_LABELS = {
  popular: 'Most popular',
  new: 'Newest first',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  discount: 'Biggest discount'
};

function matchesPrice(price, key) {
  switch (key) {
    case 'under1000':  return price < 1000;
    case '1000-2000':  return price >= 1000 && price <= 2000;
    case '2000-3500':  return price > 2000 && price <= 3500;
    case 'above3500':  return price > 3500;
    default:           return true;
  }
}

function applyFiltersAndSort(items) {
  let out = items.filter(p =>
    matchesPrice(p.price, activeFilters.price) &&
    (activeFilters.badge === 'all' || p.badge === activeFilters.badge)
  );
  switch (activeSort) {
    case 'price-asc':  out.sort((a, b) => a.price - b.price); break;
    case 'price-desc': out.sort((a, b) => b.price - a.price); break;
    case 'discount':   out.sort((a, b) => (b.mrp - b.price) - (a.mrp - a.price)); break;
    case 'new':        out.sort((a, b) => (b.badge === 'New') - (a.badge === 'New')); break;
  }
  return out;
}

/** Build the markup for a single product card. Shared by the home/shop grid
 *  and the "related products" strip on the product detail page. */
export function productCardHtml(p) {
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  return `
    <article class="product-card" data-id="${p.id}">
      <div class="product-img">
        <a class="product-img-link" href="${href}"><img src="${p.img}" alt="${p.name}" loading="lazy"></a>
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
        <button class="product-fav ${favorites.has(p.id) ? 'active' : ''}" aria-label="Save" onclick="toggleFav(event, '${p.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>
          </svg>
        </button>
        <div class="product-overlay">
          <button class="quick-btn" onclick="openBuyModal('${p.id}')">Quick buy</button>
        </div>
      </div>
      <div class="product-cat">${p.category}</div>
      <h3 class="product-name"><a href="${href}">${p.name}</a></h3>
      <div class="product-price">
        <strong>₹${Number(p.price).toLocaleString('en-IN')}</strong>
        ${p.mrp && p.mrp > p.price ? `<s>₹${Number(p.mrp).toLocaleString('en-IN')}</s>` : ''}
      </div>
      <button class="add-cart-btn" onclick="addToCart('${p.id}')">Add cart</button>
    </article>
  `;
}

/** Match an order's "Which Product" text back to catalog products.
 *  Orders store product names (with an optional "×N" quantity), not ids —
 *  so we split, strip the quantity, and look the name up in PRODUCTS. */
export function parseOrderProducts(label) {
  return (label || '').toString().split(',').map(part => {
    const raw = part.trim();
    if (!raw) return null;
    const m = raw.match(/^(.*?)\s*[×xX]\s*(\d+)\s*$/);
    const name = (m ? m[1] : raw).trim();
    const qty = m ? Number(m[2]) : 1;
    const product = PRODUCTS.find(p => (p.name || '').toLowerCase() === name.toLowerCase()) || null;
    return { name, qty, product };
  }).filter(Boolean);
}

/** Render the product grid into #productsTrack (home slice / shop filtered). */
export function renderProducts() {
  const track = document.getElementById('productsTrack');
  if (!track) return;

  let items = document.body.classList.contains('home-page') ? PRODUCTS.slice(0, 2) : PRODUCTS;
  if (document.body.classList.contains('shop-page')) {
    items = PRODUCTS.filter(p => p.section === activeShopSection && p.shopCategory === activeShopCategory);
    items = applyFiltersAndSort(items);
  }

  track.innerHTML = items.map(productCardHtml).join('')
    || '<p class="empty-products">No products found in this category yet.</p>';
}

/** Build the shop-page section + sub-category tabs (shop.html only). */
export function setupShopFilters() {
  if (!document.body.classList.contains('shop-page')) return;

  const tabs = document.getElementById('shopTabs');
  const subtabs = document.getElementById('shopSubtabs');
  const note = document.getElementById('shopFilterNote');
  if (!tabs || !subtabs) return;

  function renderSubtabs() {
    const section = SHOP_SECTIONS.find(s => s.name === activeShopSection);
    if (!section) return;
    if (!section.categories.includes(activeShopCategory)) activeShopCategory = section.categories[0];

    subtabs.innerHTML = section.categories.map(category => `
      <button class="filter-chip ${category === activeShopCategory ? 'active' : ''}" data-category="${category}">
        ${category}
      </button>
    `).join('');

    subtabs.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        activeShopCategory = btn.dataset.category;
        renderSubtabs();
        renderProducts();
        updateShopNote();
      });
    });
  }

  function updateShopNote() {
    if (note) note.textContent = `${activeShopSection} / ${activeShopCategory}`;
  }

  tabs.innerHTML = SHOP_SECTIONS.map(section => `
    <button class="filter-tab ${section.name === activeShopSection ? 'active' : ''}" data-section="${section.name}">
      ${section.name}
    </button>
  `).join('');

  tabs.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      activeShopSection = btn.dataset.section;
      activeShopCategory = SHOP_SECTIONS.find(s => s.name === activeShopSection).categories[0];
      tabs.querySelectorAll('button').forEach(tab => tab.classList.toggle('active', tab === btn));
      renderSubtabs();
      renderProducts();
      updateShopNote();
    });
  });

  renderSubtabs();
  updateShopNote();
}

/** Wire the shop-page Filters + Sort modals. */
export function setupShopModals() {
  const filterModal = document.getElementById('filterModal');
  const sortModal = document.getElementById('sortModal');
  const filtersBtn = document.getElementById('filtersBtn');
  const sortBtn = document.getElementById('sortBtn');
  const sortLabel = document.getElementById('sortLabel');

  const openModal = (m) => {
    if (!m) return;
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
  };
  const closeModal = (m) => {
    if (!m) return;
    m.classList.remove('active');
    document.body.style.overflow = '';
  };

  filtersBtn?.addEventListener('click', () => openModal(filterModal));
  sortBtn?.addEventListener('click', () => openModal(sortModal));
  document.getElementById('filterClose')?.addEventListener('click', () => closeModal(filterModal));
  document.getElementById('sortClose')?.addEventListener('click', () => closeModal(sortModal));
  filterModal?.addEventListener('click', (e) => { if (e.target === filterModal) closeModal(filterModal); });
  sortModal?.addEventListener('click', (e) => { if (e.target === sortModal) closeModal(sortModal); });

  filterModal?.querySelectorAll('.chip-row').forEach(row => {
    row.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        row.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });
  });

  document.getElementById('filterApply')?.addEventListener('click', () => {
    filterModal.querySelectorAll('.chip-row').forEach(row => {
      const key = row.dataset.filter;
      const active = row.querySelector('.filter-pill.active');
      activeFilters[key] = active ? active.dataset.value : 'all';
    });
    const filtersOn = Object.values(activeFilters).some(v => v !== 'all');
    filtersBtn?.classList.toggle('active', filtersOn);
    renderProducts();
    closeModal(filterModal);
    showToast(filtersOn ? 'Filters applied' : 'Filters cleared', 'success');
  });

  document.getElementById('filterClear')?.addEventListener('click', () => {
    filterModal.querySelectorAll('.chip-row').forEach(row => {
      row.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.value === 'all');
      });
    });
    activeFilters = { price: 'all', badge: 'all' };
    filtersBtn?.classList.remove('active');
    renderProducts();
  });

  document.getElementById('sortList')?.querySelectorAll('.sort-option').forEach(opt => {
    opt.addEventListener('click', () => {
      sortModal.querySelectorAll('.sort-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      activeSort = opt.dataset.sort;
      if (sortLabel) sortLabel.textContent = SORT_LABELS[activeSort] || 'Most popular';
      sortBtn?.classList.toggle('active', activeSort !== 'popular');
      renderProducts();
      closeModal(sortModal);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (filterModal?.classList.contains('active')) closeModal(filterModal);
    if (sortModal?.classList.contains('active')) closeModal(sortModal);
    if (document.getElementById('cartDrawer')?.classList.contains('active')) closeCart();
  });
}
