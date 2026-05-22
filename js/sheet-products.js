/* ============================================================
   sheet-products.js — merge admin-added products from the sheet
   ============================================================ */

import { CONFIG } from './config.js';
import { PRODUCTS, SHOP_SECTIONS, renderProducts, setupShopFilters } from './catalog.js';

// Legacy section names from the pre-cascading-form era → current SHOP_SECTIONS names.
const SECTION_ALIASES = {
  "women's clothing": "Women's",
  "womens clothing": "Women's",
  "accessories": 'HandCraft',
  "jewellery": 'HandCraft',
  "handcrafted gifts": 'HandCraft',
  "home decor": 'HandCraft',
  "bags": 'HandCraft',
  "kids clothing": 'Kids',
  "3d product": '3D Product'
};

function normaliseSection(name) {
  const t = (name || '').trim();
  return SECTION_ALIASES[t.toLowerCase()] || t || 'HandCraft';
}

/** Fetch admin-added products and merge them into the in-memory catalog. */
export async function loadSheetProducts() {
  if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) return;
  try {
    // Cache-bust so the browser doesn't serve a stale response.
    const res = await fetch(`${CONFIG.SHEETS_WEBHOOK}?action=products&_t=${Date.now()}`);
    const data = await res.json();
    console.log('[products] fetched from sheet:', data);
    if (data.status !== 'ok' || !Array.isArray(data.products)) return;

    const existing = new Set(PRODUCTS.map(p => p.id));
    const newProducts = [];
    data.products.forEach(p => {
      if (!p.code || existing.has(p.code)) return;

      const sectionName = normaliseSection(p.section);
      // If the row came from the pre-migration form (single-category), its
      // original Category cell may still be useful as a sub-category label.
      let subCat = (p.subCategory || '').trim();
      if (!subCat) {
        const legacy = (p.section || '').trim();
        subCat = (legacy && legacy !== sectionName) ? legacy : 'Accessories';
      }

      let section = SHOP_SECTIONS.find(s => s.name === sectionName);
      if (!section) {
        section = { name: sectionName, categories: [] };
        SHOP_SECTIONS.push(section);
      }
      if (!section.categories.includes(subCat)) section.categories.push(subCat);

      const images = Array.isArray(p.images) && p.images.length
        ? p.images
        : (p.image ? [p.image] : []);
      const videos = Array.isArray(p.videos) ? p.videos : [];

      newProducts.push({
        id: p.code,
        name: p.name,
        section: sectionName,
        shopCategory: subCat,
        category: sectionName + ' / ' + subCat,
        price: p.price,
        mrp: Number(p.mrp) || 0,
        badge: 'New',
        img: images[0] || 'https://via.placeholder.com/600?text=' + encodeURIComponent(p.name),
        images: images,
        videos: videos,
        description: p.description
      });
    });

    if (newProducts.length) {
      // Prepend so admin-added products appear FIRST on the home page slice
      // and at the top of the shop grid.
      PRODUCTS.unshift(...newProducts);
      console.log(`[products] merged ${newProducts.length} new product(s) from sheet`);
    }

    renderProducts();
    if (document.body.classList.contains('shop-page')) setupShopFilters();
  } catch (err) {
    console.warn('[products] fetch failed', err);
  }
}
