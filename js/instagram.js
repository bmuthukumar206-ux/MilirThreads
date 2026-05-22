/* ============================================================
   instagram.js — pulls the live Instagram feed into the grid
   ============================================================ */

import { CONFIG } from './config.js';

/** Replace the static social tiles with the latest 6 Instagram posts. */
export async function loadInstagramFeed() {
  const token = CONFIG.INSTAGRAM_TOKEN;
  const grid = document.getElementById('instagramFeed');
  if (!grid) return;
  if (!token || token.includes('YOUR_')) return; // keep static fallback tiles

  const url = `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp&limit=6&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Instagram API ${res.status}`);
    const data = await res.json();
    if (!data?.data?.length) return;

    grid.innerHTML = data.data.slice(0, 6).map((item, i) => {
      const imgUrl = item.media_type === 'VIDEO' ? (item.thumbnail_url || item.media_url) : item.media_url;
      const caption = (item.caption || '').replace(/[<>]/g, '').slice(0, 90);
      return `
        <a href="${item.permalink}" target="_blank" rel="noopener" class="social-tile reveal in" style="animation-delay:${i * 0.06}s">
          <img src="${imgUrl}" alt="${caption}" loading="lazy">
          <div class="tile-overlay"><span>${caption || 'View on Instagram'}</span></div>
        </a>`;
    }).join('');
  } catch (err) {
    console.warn('[Instagram] feed unavailable, keeping static tiles:', err.message);
  }
}
