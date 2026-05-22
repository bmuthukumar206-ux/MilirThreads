/* ============================================================
   main.js — storefront entry point
   Imports every feature module and runs the init sequence.
   Loaded by: Index, shop, contact, enquiry, search, product,
              saved-products, my-orders (as <script type="module">).
   ============================================================ */

import { renderProducts, setupShopFilters, setupShopModals } from './catalog.js';
import { setupAuth } from './auth.js';
import { setupReveal, setupNav, setupMobileMenu, setupSlider, setupOfferSlider } from './ui.js';
import { updateCart } from './cart.js';
import { loadInstagramFeed } from './instagram.js';
import { loadSheetProducts } from './sheet-products.js';

// Side-effect modules — register their listeners on import.
import './checkout.js';   // buy modal, promo, Razorpay
import './enquiry.js';    // enquiry form

// ---------- INIT ----------
renderProducts();
setupShopFilters();
setupShopModals();
setupAuth();
setupReveal();
setupNav();
setupMobileMenu();
setupOfferSlider();
setupSlider();
updateCart();
loadInstagramFeed();
loadSheetProducts();
