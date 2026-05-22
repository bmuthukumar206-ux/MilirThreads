/* ============================================================
   pages/admin-products.js — add / list / delete products
   (admin-products.html)
   ============================================================ */

import { CONFIG } from '../config.js';
import { currentUser, persistUser } from '../session.js';
import { showToast } from '../toast.js';
import { postAuth } from '../api.js';
import { SHOP_SECTIONS } from '../catalog.js';

(function () {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Admins only.');
    location.replace('Index.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
  let imageDataUrl = '';
  let imageName = '';

  const form = $('productForm');
  const fileInput = $('productImage');
  const drop = $('imageDrop');
  const preview = $('imagePreview');
  const empty = $('imageEmpty');
  const clearBtn = $('clearImageBtn');
  const imageNote = $('imageNote');
  const note = $('productNote');
  const submitBtn = $('submitProduct');
  const submitLabel = $('submitLabel');
  const sectionSel = $('sectionSelect');
  const subSel = $('subCategorySelect');

  // ----- Populate cascading Section / Sub Category from SHOP_SECTIONS
  function populateSections() {
    sectionSel.innerHTML = '<option value="">Select a section</option>' +
      SHOP_SECTIONS.map(s => `<option>${s.name}</option>`).join('');
  }
  function populateSubCategories(sectionName) {
    const section = SHOP_SECTIONS.find(s => s.name === sectionName);
    if (!section) {
      subSel.innerHTML = '<option value="">Pick a section first</option>';
      subSel.disabled = true;
      return;
    }
    subSel.innerHTML = '<option value="">Select a sub category</option>' +
      section.categories.map(c => `<option>${c}</option>`).join('');
    subSel.disabled = false;
  }
  populateSections();
  sectionSel.addEventListener('change', () => populateSubCategories(sectionSel.value));

  // ----- Image upload + preview
  function setImage(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file', 'error');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Image too large (max 4 MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      imageDataUrl = e.target.result;
      imageName = file.name;
      preview.src = imageDataUrl;
      preview.hidden = false;
      empty.hidden = true;
      clearBtn.hidden = false;
      imageNote.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
      imageNote.className = 'form-note';
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    imageDataUrl = '';
    imageName = '';
    fileInput.value = '';
    preview.removeAttribute('src');
    preview.hidden = true;
    empty.hidden = false;
    clearBtn.hidden = true;
    imageNote.textContent = '';
  }

  fileInput.addEventListener('change', (e) => setImage(e.target.files[0]));
  clearBtn.addEventListener('click', clearImage);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
    if (e.dataTransfer.files[0]) setImage(e.dataTransfer.files[0]);
  });

  // ----- Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    note.textContent = '';
    note.className = 'form-note';

    const fd = new FormData(form);
    const payload = {
      type: 'product_add',
      admin_email: currentUser.email,
      name: (fd.get('name') || '').toString().trim(),
      code: (fd.get('code') || '').toString().trim(),
      section: (fd.get('section') || '').toString().trim(),
      sub_category: (fd.get('sub_category') || '').toString().trim(),
      price: Number(fd.get('price')) || 0,
      description: (fd.get('description') || '').toString().trim(),
      image_data: imageDataUrl,
      image_name: imageName
    };

    if (!payload.name || !payload.code || !payload.section || !payload.sub_category || !payload.price) {
      note.textContent = 'Fill in name, code, section, sub-category and price.';
      note.className = 'form-note error';
      showToast('Missing required fields', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitLabel.textContent = 'Saving…';
    note.textContent = imageDataUrl ? 'Uploading image to Drive and saving…' : 'Saving…';

    const r = await postAuth(payload);

    submitBtn.disabled = false;
    submitLabel.textContent = 'Save product';

    if (r.status === 'ok') {
      note.textContent = `✓ ${payload.name} saved.`;
      note.className = 'form-note success';
      showToast('Product saved', 'success');
      // Show it immediately in the All-Products grid with the local base64 so
      // there's no wait for Drive to propagate.
      addPendingProduct({
        code: payload.code,
        name: payload.name,
        section: payload.section,
        subCategory: payload.sub_category,
        price: payload.price,
        description: payload.description,
        image: r.product?.image || '',
        localImage: imageDataUrl,
        dateAdded: new Date().toISOString().slice(0, 19).replace('T', ' ')
      });
      form.reset();
      clearImage();
      populateSubCategories('');
      // Also pull a fresh list so any other tab's edits land here.
      loadProducts();
    } else {
      note.textContent = r.error || 'Could not save product';
      note.className = 'form-note error';
      showToast(r.error || 'Save failed', 'error');
    }
  });

  // ====================================================
  // ALL PRODUCTS  — filter panel + listing pulled from sheet
  // ====================================================
  const grid = $('productGrid');
  const filterSection = $('filterSection');
  const filterSubCategory = $('filterSubCategory');
  const filterTime = $('filterTime');
  const filterCountEl = $('filterCount');
  let allProducts = [];
  let pendingLocalImages = {}; // code → base64 fresh upload

  const escape = (s) => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function populateFilterSections() {
    filterSection.innerHTML = '<option value="">All sections</option>' +
      SHOP_SECTIONS.map(s => `<option>${s.name}</option>`).join('');
  }
  function populateFilterSubCategories(sectionName) {
    if (!sectionName) {
      filterSubCategory.innerHTML = '<option value="">All</option>';
      filterSubCategory.disabled = true;
      return;
    }
    const section = SHOP_SECTIONS.find(s => s.name === sectionName);
    filterSubCategory.innerHTML = '<option value="">All in section</option>' +
      (section ? section.categories.map(c => `<option>${c}</option>`).join('') : '');
    filterSubCategory.disabled = false;
  }
  populateFilterSections();

  filterSection.addEventListener('change', () => {
    populateFilterSubCategories(filterSection.value);
    renderGrid();
  });
  filterSubCategory.addEventListener('change', renderGrid);
  filterTime.addEventListener('change', renderGrid);
  $('filterReset').addEventListener('click', () => {
    filterSection.value = '';
    filterTime.value = 'all';
    populateFilterSubCategories('');
    renderGrid();
  });
  $('filterRefresh').addEventListener('click', loadProducts);

  function addPendingProduct(p) {
    if (p.localImage) pendingLocalImages[p.code] = p.localImage;
    // optimistic: drop into the head of the list until next refresh
    allProducts.unshift(p);
    renderGrid();
  }

  async function loadProducts() {
    if (CONFIG.SHEETS_WEBHOOK.includes('YOUR_DEPLOYMENT_ID')) {
      grid.innerHTML = '<div class="orders-empty">Webhook not configured yet.</div>';
      return;
    }
    grid.innerHTML = '<div class="orders-empty">Loading…</div>';
    try {
      const res = await fetch(`${CONFIG.SHEETS_WEBHOOK}?action=products`);
      const data = await res.json();
      if (data.status !== 'ok' || !Array.isArray(data.products)) {
        grid.innerHTML = '<div class="orders-empty">Could not load products.</div>';
        return;
      }
      allProducts = data.products;
      renderGrid();
    } catch (err) {
      grid.innerHTML = `<div class="orders-empty">Network error: ${escape(err.message)}</div>`;
    }
  }

  function renderGrid() {
    const sec = filterSection.value;
    const sub = filterSubCategory.value;
    const days = filterTime.value;
    const cutoff = days === 'all' ? 0 : Date.now() - Number(days) * 24 * 60 * 60 * 1000;

    const filtered = allProducts.filter(p => {
      if (sec && p.section !== sec) return false;
      if (sub && p.subCategory !== sub) return false;
      if (cutoff) {
        const t = Date.parse((p.dateAdded || '').toString().replace(' ', 'T'));
        if (isNaN(t) || t < cutoff) return false;
      }
      return true;
    });

    filterCountEl.textContent = `${filtered.length} of ${allProducts.length} products`;

    if (!filtered.length) {
      grid.innerHTML = '<div class="orders-empty">No products match these filters.</div>';
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const local = pendingLocalImages[p.code];
      const drive = p.image || '';
      const primary = local || drive;
      const fallback = local && drive ? drive : '';
      const imgTag = primary
        ? `<img src="${escape(primary)}" alt="" ${fallback ? `data-fallback="${escape(fallback)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.style.display='none'}"` : ''}>`
        : '<span>No image</span>';
      return `
        <article class="saved-product" data-code="${escape(p.code)}">
          <div class="saved-thumb">${imgTag}</div>
          <div class="saved-meta">
            <strong>${escape(p.name)}</strong>
            <span class="saved-cat">${escape(p.section)} · ${escape(p.subCategory)} · ${escape(p.code)}</span>
            <span class="saved-price">₹${Number(p.price).toLocaleString('en-IN')}</span>
            ${p.description ? `<p>${escape(p.description)}</p>` : ''}
            <button type="button" class="product-delete-btn" data-action="delete">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              <span>Delete</span>
            </button>
          </div>
        </article>`;
    }).join('');

    grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.currentTarget.closest('.saved-product');
        if (!card) return;
        const code = card.dataset.code;
        const product = allProducts.find(p => p.code === code);
        confirmDelete(product || { code }, card);
      });
    });
  }

  async function confirmDelete(product, card) {
    const ok = window.confirm(
      `Delete "${product.name || product.code}"?\n\n` +
      `This removes the row from the Products sheet and moves the image to the Drive trash. ` +
      `It cannot be undone from this page.`
    );
    if (!ok) return;

    card.style.opacity = '0.5';
    card.style.pointerEvents = 'none';

    const r = await postAuth({
      type: 'product_delete',
      admin_email: currentUser.email,
      code: product.code
    });

    if (r.status === 'ok') {
      // Remove from local cache so the next render drops it.
      allProducts = allProducts.filter(p => p.code !== product.code);
      delete pendingLocalImages[product.code];
      showToast(`Deleted ${product.name || product.code}`, 'success');
      renderGrid();
    } else {
      card.style.opacity = '';
      card.style.pointerEvents = '';
      showToast(r.error || 'Delete failed', 'error');
    }
  }

  loadProducts();

  $('adminLogout').addEventListener('click', () => {
    persistUser(null);
    location.replace('Index.html');
  });
})();
