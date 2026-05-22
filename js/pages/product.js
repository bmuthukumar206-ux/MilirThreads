/* ============================================================
   pages/product.js — single product detail page (product.html)
   Renders: detail + specs + ratings/reviews + related products.
   ============================================================ */

import { PRODUCTS, productCardHtml } from '../catalog.js';
import { fetchReviews, postReview } from '../api.js';
import { favorites } from '../favorites.js';
import { showToast } from '../toast.js';
import { currentUser } from '../session.js';

(function () {
  const root = document.getElementById('productRoot');
  if (!root) return;

  const productId = new URLSearchParams(location.search).get('id');

  // Combined review list (seed reviews + reviews fetched from the sheet).
  let reviews = [];
  let formRating = 5;

  // ---------- helpers ----------
  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  function prettyDate(s) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return esc(s || '');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function starBar(rating) {
    const pct = Math.max(0, Math.min(100, (Number(rating) || 0) / 5 * 100));
    return `<span class="stars" aria-label="${rating} out of 5 stars">
      <span class="stars-base">★★★★★</span>
      <span class="stars-fill" style="width:${pct}%">★★★★★</span>
    </span>`;
  }

  function avgRating() {
    if (!reviews.length) return 0;
    const sum = reviews.reduce((t, r) => t + (Number(r.rating) || 0), 0);
    return sum / reviews.length;
  }

  // ---------- boot ----------
  let attempts = 0;
  (function waitForProduct() {
    const product = PRODUCTS.find(p => p.id === productId);
    if (product) { boot(product); return; }
    // Sheet products load asynchronously — retry a few times before giving up.
    if (attempts++ < 8) { setTimeout(waitForProduct, 400); return; }
    renderNotFound();
  })();

  function renderNotFound() {
    root.innerHTML = `
      <div class="pd-notfound">
        <h1>Product not found</h1>
        <p>The product you're looking for isn't available.</p>
        <a class="btn btn-primary" href="shop.html"><span>Back to shop</span></a>
      </div>`;
  }

  function boot(product) {
    document.title = `${product.name} | MilirThreads`;
    const crumb = document.getElementById('crumbName');
    if (crumb) crumb.textContent = product.name;

    // Seed reviews from the catalog come first (newest of those at the top).
    reviews = Array.isArray(product.reviews) ? product.reviews.slice() : [];

    render(product);
    wire(product);
    renderRelated(product);
    loadServerReviews(product);
  }

  // ---------- media gallery (multiple images + videos) ----------
  let mediaList = [];   // [{ kind: 'image'|'video', url }]
  let activeMedia = 0;

  const isDriveUrl = (u) => /drive\.google\.com/.test(u || '');

  function buildMedia(product) {
    const imgs = (Array.isArray(product.images) && product.images.length)
      ? product.images
      : (product.img ? [product.img] : []);
    const vids = Array.isArray(product.videos) ? product.videos : [];
    const media = [];
    imgs.forEach(u => { if (u) media.push({ kind: 'image', url: u }); });
    vids.forEach(u => { if (u) media.push({ kind: 'video', url: u }); });
    if (!media.length && product.img) media.push({ kind: 'image', url: product.img });
    return media;
  }

  function galleryHtml() {
    return `
      <div class="pd-gallery">
        <div class="pd-stage" id="pdStage"></div>
        <div class="pd-thumbs" id="pdThumbs" hidden></div>
      </div>`;
  }

  function paintStage(product) {
    const stage = document.getElementById('pdStage');
    if (!stage) return;
    const m = mediaList[activeMedia] || mediaList[0];
    if (!m) { stage.innerHTML = `<img src="${esc(product.img || '')}" alt="${esc(product.name)}">`; return; }
    if (m.kind === 'video') {
      stage.classList.add('is-video');
      stage.innerHTML = isDriveUrl(m.url)
        ? `<iframe src="${esc(m.url)}" allow="autoplay; fullscreen" allowfullscreen></iframe>`
        : `<video src="${esc(m.url)}" controls playsinline></video>`;
    } else {
      stage.classList.remove('is-video');
      stage.innerHTML = `<img src="${esc(m.url)}" alt="${esc(product.name)}">`;
      if (product.badge && activeMedia === 0) {
        stage.innerHTML += `<span class="product-badge">${esc(product.badge)}</span>`;
      }
    }
  }

  function paintThumbs(product) {
    const thumbs = document.getElementById('pdThumbs');
    if (!thumbs) return;
    if (mediaList.length <= 1) { thumbs.hidden = true; return; }
    thumbs.hidden = false;
    thumbs.innerHTML = mediaList.map((m, i) => {
      const inner = m.kind === 'video'
        ? `<span class="pd-thumb-video">&#9658;</span>`
        : `<img src="${esc(m.url)}" alt="">`;
      return `<button type="button" class="pd-thumb ${i === activeMedia ? 'active' : ''}" data-i="${i}">${inner}</button>`;
    }).join('');
    thumbs.querySelectorAll('.pd-thumb').forEach(btn => {
      btn.addEventListener('click', () => {
        activeMedia = Number(btn.dataset.i);
        paintStage(product);
        thumbs.querySelectorAll('.pd-thumb').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
  }

  function renderGallery(product) {
    mediaList = buildMedia(product);
    activeMedia = 0;
    paintStage(product);
    paintThumbs(product);
  }

  // ---------- render ----------
  function render(product) {
    const hasMrp = product.mrp && product.mrp > product.price;
    const off = hasMrp ? Math.round((1 - product.price / product.mrp) * 100) : 0;
    const faved = favorites.has(product.id);

    root.innerHTML = `
      <div class="pd-top">
        ${galleryHtml()}
        <div class="pd-info">
          <div class="pd-cat">${esc(product.category || product.section || '')}</div>
          <h1 class="pd-name">${esc(product.name)}</h1>
          <div class="pd-rating-row" id="pdRatingRow"></div>
          <div class="pd-price">
            <strong>${inr(product.price)}</strong>
            ${hasMrp ? `<s>${inr(product.mrp)}</s><span class="pd-save">${off}% off</span>` : ''}
          </div>
          <p class="pd-desc">${esc(product.description || 'A handcrafted MilirThreads product, made with care.')}</p>
          <div class="pd-actions">
            <button class="btn btn-primary" id="pdAddCart"><span>Add to cart</span></button>
            <button class="btn btn-ghost" id="pdBuyNow"><span>Buy now</span></button>
            <button class="pd-fav ${faved ? 'active' : ''}" id="pdFav" aria-label="Save">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>
              </svg>
            </button>
          </div>
          <ul class="pd-perks">
            <li>Free shipping on orders ${inr(999)}+</li>
            <li>Handcrafted in India</li>
            <li>Secure checkout via Razorpay</li>
          </ul>
        </div>
      </div>

      <section class="pd-section">
        <h2>Specifications</h2>
        ${specsHtml(product)}
      </section>

      <section class="pd-section" id="reviews">
        <h2>Ratings &amp; Reviews</h2>
        <div id="reviewsSummary"></div>
        <div class="pd-review-form-wrap">
          <h3>Write a review</h3>
          <form id="reviewForm" class="pd-review-form" novalidate>
            <div class="field">
              <label>Your name</label>
              <input type="text" name="name" required value="${esc(currentUser ? currentUser.name : '')}" />
            </div>
            <div class="field">
              <label>Your rating</label>
              <div class="star-picker" id="starPicker"></div>
            </div>
            <div class="field">
              <label>Your review</label>
              <textarea name="text" rows="3" required placeholder="Share your experience with this product…"></textarea>
            </div>
            <button type="submit" class="btn btn-primary"><span>Submit review</span></button>
            <p class="form-note" id="reviewNote"></p>
          </form>
        </div>
        <div class="pd-review-list" id="reviewList"></div>
      </section>

      <section class="pd-section" id="relatedSection" hidden>
        <h2>You may also like</h2>
        <div class="products-track related-track" id="relatedGrid"></div>
      </section>
    `;

    renderGallery(product);
    renderRatingRow(product);
    renderReviews();
    renderStarPicker();
  }

  function specsHtml(product) {
    const specs = (product.specs && typeof product.specs === 'object') ? product.specs : {};
    const rows = Object.keys(specs).map(k => `
      <tr><th>${esc(k)}</th><td>${esc(specs[k])}</td></tr>
    `);
    // Always include the basics so sheet-added products still show a table.
    rows.push(`<tr><th>Category</th><td>${esc(product.category || product.section || '—')}</td></tr>`);
    rows.push(`<tr><th>Product code</th><td>${esc(product.id)}</td></tr>`);
    return `<table class="pd-specs"><tbody>${rows.join('')}</tbody></table>`;
  }

  function renderRatingRow(product) {
    const row = document.getElementById('pdRatingRow');
    if (!row) return;
    const avg = avgRating();
    if (!reviews.length) {
      row.innerHTML = `<span class="pd-norating">No ratings yet</span>`;
      return;
    }
    row.innerHTML = `
      ${starBar(avg)}
      <span class="pd-rating-num">${avg.toFixed(1)}</span>
      <a href="#reviews" class="pd-review-link">${reviews.length} review${reviews.length === 1 ? '' : 's'}</a>
    `;
  }

  function renderReviews() {
    renderSummary();
    renderList();
    const product = PRODUCTS.find(p => p.id === productId);
    if (product) renderRatingRow(product);
  }

  function renderSummary() {
    const el = document.getElementById('reviewsSummary');
    if (!el) return;
    if (!reviews.length) {
      el.innerHTML = `<p class="pd-no-reviews">No reviews yet — be the first to review this product.</p>`;
      return;
    }
    const avg = avgRating();
    const counts = [0, 0, 0, 0, 0]; // index 0 → 1 star … index 4 → 5 stars
    reviews.forEach(r => {
      const v = Math.round(Number(r.rating) || 0);
      if (v >= 1 && v <= 5) counts[v - 1]++;
    });
    const bars = [5, 4, 3, 2, 1].map(star => {
      const c = counts[star - 1];
      const pct = reviews.length ? Math.round(c / reviews.length * 100) : 0;
      return `
        <div class="pd-bar-row">
          <span class="pd-bar-label">${star}★</span>
          <span class="pd-bar"><span class="pd-bar-fill" style="width:${pct}%"></span></span>
          <span class="pd-bar-count">${c}</span>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="pd-reviews-summary">
        <div class="pd-rating-big">
          <div class="pd-rating-score">${avg.toFixed(1)}</div>
          ${starBar(avg)}
          <div class="pd-rating-count">${reviews.length} review${reviews.length === 1 ? '' : 's'}</div>
        </div>
        <div class="pd-rating-bars">${bars}</div>
      </div>`;
  }

  function renderList() {
    const el = document.getElementById('reviewList');
    if (!el) return;
    if (!reviews.length) { el.innerHTML = ''; return; }
    el.innerHTML = reviews.map(r => {
      const name = esc(r.name || 'Anonymous');
      const initial = (name.trim()[0] || '?').toUpperCase();
      return `
        <article class="pd-review">
          <div class="pd-review-avatar">${initial}</div>
          <div class="pd-review-body">
            <div class="pd-review-head">
              <span class="pd-review-name">${name}</span>
              <span class="pd-review-date">${prettyDate(r.date)}</span>
            </div>
            ${starBar(Number(r.rating) || 0)}
            <p class="pd-review-text">${esc(r.text)}</p>
          </div>
        </article>`;
    }).join('');
  }

  function renderStarPicker() {
    const picker = document.getElementById('starPicker');
    if (!picker) return;
    const paint = () => {
      picker.querySelectorAll('.star-btn').forEach(btn => {
        btn.classList.toggle('on', Number(btn.dataset.v) <= formRating);
      });
    };
    picker.innerHTML = [1, 2, 3, 4, 5].map(v =>
      `<button type="button" class="star-btn" data-v="${v}" aria-label="${v} star">★</button>`
    ).join('');
    picker.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', () => { formRating = Number(btn.dataset.v); paint(); });
    });
    paint();
  }

  // ---------- related products ----------
  function renderRelated(product) {
    const section = document.getElementById('relatedSection');
    const grid = document.getElementById('relatedGrid');
    if (!section || !grid) return;
    let related = PRODUCTS.filter(p => p.id !== product.id && p.section === product.section);
    if (related.length < 4) {
      const extra = PRODUCTS.filter(p => p.id !== product.id && !related.includes(p));
      related = related.concat(extra);
    }
    related = related.slice(0, 4);
    if (!related.length) { section.hidden = true; return; }
    section.hidden = false;
    grid.innerHTML = related.map(productCardHtml).join('');
  }

  // ---------- server reviews ----------
  async function loadServerReviews(product) {
    const { reviews: serverReviews } = await fetchReviews(product.id);
    if (serverReviews && serverReviews.length) {
      // Server reviews (newest first) go above the catalog seed reviews.
      reviews = serverReviews.concat(reviews);
      renderReviews();
    }
  }

  // ---------- wire interactions ----------
  function wire(product) {
    document.getElementById('pdAddCart')?.addEventListener('click', () => {
      window.addToCart(product.id);
    });
    document.getElementById('pdBuyNow')?.addEventListener('click', () => {
      window.openBuyModal(product.id);
    });
    document.getElementById('pdFav')?.addEventListener('click', (e) => {
      window.toggleFav(e, product.id);
    });

    const form = document.getElementById('reviewForm');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = document.getElementById('reviewNote');
      const name = (form.elements.name.value || '').trim();
      const text = (form.elements.text.value || '').trim();
      if (!name || !text) {
        note.textContent = 'Please add your name and a few words.';
        note.className = 'form-note error';
        return;
      }
      submitReview(product, { name, text, rating: formRating }, note, form);
    });
  }

  async function submitReview(product, entry, note, form) {
    const review = {
      name: entry.name,
      rating: entry.rating,
      date: new Date().toISOString().slice(0, 10),
      text: entry.text
    };
    // Optimistic — show it immediately at the top of the list.
    reviews = [review].concat(reviews);
    renderReviews();
    form.reset();
    formRating = 5;
    renderStarPicker();
    if (currentUser) form.elements.name.value = currentUser.name || '';

    note.textContent = 'Posting your review…';
    note.className = 'form-note';

    const res = await postReview({
      product_id: product.id,
      product_name: product.name,
      customer_name: review.name,
      email: currentUser ? currentUser.email : '',
      rating: review.rating,
      review: review.text
    });

    if (res && res.status === 'ok') {
      note.textContent = 'Thanks! Your review has been posted.';
      note.className = 'form-note success';
      showToast('Review submitted', 'success');
    } else {
      note.textContent = 'Your review is shown here, but could not be saved to the server.';
      note.className = 'form-note warn';
      showToast('Review saved locally only', 'warn');
    }
  }
})();
