# MilirThreads — Setup Guide

Complete setup for your handcrafted store landing page.

## 📁 Files

| File | Purpose |
|---|---|
| `Index.html` / `shop.html` / `enquiry.html` / `contact.html` | Customer-facing pages |
| `admin.html` | Admin dashboard — stats & charts (auth-gated) |
| `admin-products.html` | Admin — add products (multi image/video, MRP) |
| `admin-orders.html` | Admin — order tracking Kanban board |
| `styles.css` | All styling |
| `script.js` | Products, cart, auth, Razorpay |
| `google-apps-script.gs` | Backend for Google Sheets logging |
| `logo.png` | Brand logo (used in nav and footer) |

## 🚀 Quick Start

1. Keep all files in the same folder.
2. Open `Index.html` in any browser — works immediately for preview (demo mode for payments).
3. To go live, host these files on any static host (Netlify, Vercel, GitHub Pages, your shared hosting).

## 💳 Razorpay Setup

1. Sign up at [razorpay.com](https://razorpay.com) and complete KYC.
2. Go to **Dashboard → Settings → API Keys**.
3. Generate **Test Mode** keys first (for testing) and later **Live Mode** keys.
4. Copy the **Key ID** (starts with `rzp_test_` or `rzp_live_`).
5. Open `script.js` and replace the placeholder:
   ```js
   RAZORPAY_KEY: 'rzp_test_XXXXXXXXXXXXXX'
   ```
   with your real key.

What the checkout sends to Razorpay:
- **amount** = `received_amount` (post-discount) in paise (×100)
- **notes** = shipping address, product list, promo code, mode (`single` or `cart`)
- **prefill** = customer name / email / phone

On successful payment Razorpay's `handler` posts the order details to your Google Sheet. Failed payments are also logged with `status: failed`.

> ⚠️ Never put your **Razorpay Secret Key** in the frontend. For production, payment signature verification should happen on a server. The current setup captures payments and logs them — fine to start, but add server-side verification before scaling.

## 📊 Google Sheets Setup (5 minutes)

Every successful checkout writes a row to **Purchase Details**, and every enquiry submission writes to **Leads**.

### Step 1 — Create your spreadsheet
- Go to [sheets.google.com](https://sheets.google.com)
- Create a new blank spreadsheet (any name, e.g. **MilirThreads Orders**)

### Step 2 — Open Apps Script
- In the spreadsheet: **Extensions → Apps Script**
- Delete the default code
- Open `google-apps-script.gs` from this project, copy ALL contents, paste into the Apps Script editor
- Save the project (any name, e.g. *MilirThreads Webhook*)

### Step 3 — Deploy as Web App
- **Deploy → New deployment**
- Type: **Web app**
- **Execute as:** Me
- **Who has access:** Anyone
- Click **Deploy** and authorize when prompted (Google will warn it's an unverified app — click "Advanced" → "Go to project")
- Copy the **Web app URL** (looks like `https://script.google.com/macros/s/AKfy.../exec`)

### Step 4 — Connect website to sheet
Open `script.js` and replace:
```js
SHEETS_WEBHOOK: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
```
with your Web app URL.

### Step 5 — Test
- Open your landing page
- Submit the enquiry form → check the **Leads** tab
- Make a test purchase → check the **Purchase Details** tab

> Whenever you edit `google-apps-script.gs`, you must **Deploy → Manage deployments → Edit → New version** for the changes to take effect.

## 👤 User Accounts & Order Tracking

The site has an **account icon** in the nav (between Search and Cart). Clicking it opens a modal with three tabs:

- **Login** — existing users
- **Sign up** — new account; row appended to the **Users** sheet
- **Admin** — separate login for the store owner

After signing in, the icon shows a green dot. Click it to open the account drawer with **My orders** and **Log out**. The "My orders" button fetches every row in **Purchase Details** matching the logged-in email and shows: products, amount, discount, paid, payment id, status.

### Admin login (hidden convention)

There is **no separate admin tab** in the UI — normal customers only see Login / Sign up. Admins are identified by their email:

> Any email whose **local part contains `.admin`** is treated as an admin.
> Examples:
> - `dinesh.admin@gmail.com` → admin role
> - `owner.admin@yourbiz.com` → admin role
> - `john@gmail.com` → normal user

How it works:
- On **signup**, the Apps Script checks `isAdminEmail()` and writes `admin` into the **Role** column for those accounts.
- On **login**, the role is read from the Users sheet — no special form needed.
- When the logged-in user has `role: 'admin'`, the account drawer shows an extra **Admin dashboard** button that opens the orders modal listing **every** purchase across all customers.

This means the very first admin signs themselves up with `something.admin@<their-email-host>` and they're admin. To promote an existing user, change their **Role** cell in the Users sheet from `user` to `admin`.

### Forgot password

The login form has a **Forgot password?** link. Flow:

1. User enters their email → frontend sends `POST {type: 'forgot_request', email}`.
2. Apps Script generates a 6-digit OTP, stores it in **Script Properties** with a 10-minute expiry, and emails the user via `MailApp.sendEmail()` (uses your Google account's sending quota).
3. User enters the OTP + a new password → frontend sends `POST {type: 'forgot_confirm', email, otp, new_password_hash}`.
4. Apps Script verifies the OTP, updates the **Password Hash** column in the Users sheet, deletes the OTP, and returns the user object — the frontend auto-signs them in.

The first time Apps Script tries to send mail, it'll prompt for **Gmail send authorization**. Approve it once and it works for every reset after that.

### Security notes

- Passwords are hashed in the **browser** (SHA-256) before being sent to the webhook, so plaintext never travels or is stored in the sheet.
- This is fine for an MVP store. For production, also add:
  - Per-user salt (Apps Script supports per-row salts)
  - HTTPS (Apps Script always serves over HTTPS — good)
  - Server-side rate limiting (Apps Script doesn't, so add a check counter if you go live with many customers)
- The webhook URL is technically a secret. Don't print it in public repos.

### Admin Dashboard ([admin.html](admin.html))

Logged-in admins see an **Admin dashboard** button in the account drawer. Clicking it navigates to `admin.html` — a dedicated, dynamic dashboard separate from the storefront.

Sections:

| Widget | What it shows |
|---|---|
| **Stat cards** | Total leads (+ pending review) · Qualified leads (+ conversion %) · Revenue till now (+ order count, discounts given) · Registered users (+ new this week, admin count) |
| **Leads by interest** | Horizontal bar list of the `Interest` field counts (Women's Clothing, Bulk Gifting, Custom Order, …) |
| **Sales by category** | Revenue mix bucketed by product keyword (Women's Clothing, Jewellery, Bags, 3D Product, …). Categorisation is heuristic — edit `categorize()` in `google-apps-script.gs` to tweak. |
| **Approvals raised** | Orders with `Status = pending`. Two buttons per row: **Approve** (sets status to `approved`) or **Reject** (sets to `rejected`). Card is hidden when there's nothing pending. |
| **Recent orders** | Latest 8 rows from Purchase Details with customer + payment id + status pill |
| **Recent leads** | Latest 5 leads with **Mark qualified / Unqualified / Reset** buttons. The chosen state is written to the `Qualified` column (added automatically on the next lead append; older leads default to `pending`). |
| **New signups** | Latest 5 users with role pill (`user` / `admin`) |

How qualified/unqualified works:
- New leads land with `Qualified = pending`.
- Admin clicks **Mark qualified** → POST `lead_qualify` → Apps Script verifies the requester is admin, updates the Leads row.
- The Stat card "Qualified leads" + conversion % refresh on next dashboard load.

Approval flow (for future use — e.g. COD, custom orders, partial payments):
- Any payment row written with `status: pending` shows up in the **Approvals raised** card.
- Admin Approve → `Status = approved` (revenue starts counting toward the total).
- Admin Reject → `Status = rejected` (not counted in revenue).
- Currently the Razorpay handler writes `status: success`, so the Approvals card stays empty until you have a flow that intentionally writes `pending` rows.

All admin endpoints (`adminStats`, `lead_qualify`, `order_status`) verify the requester's email maps to a `role: admin` row in the **Users** sheet — non-admins get `{status:'error', error:'Not authorized'}` even if they hit the URL directly.

> **Important**: when you redeploy the Apps Script, the `Qualified` column will only be added automatically the next time a *new* lead is submitted (because that's when `getOrCreateSheet` runs). If your Leads sheet already exists without that column, manually add a header cell `Qualified` in column G.

### Order tracking board ([admin-orders.html](admin-orders.html))

The admin nav has an **Orders** tab. It opens a dedicated page with a
drag-and-drop Kanban board that tracks fulfilment of every paid order:

| Column | Meaning |
|---|---|
| **New orders** | Paid, not yet dispatched (`Delivery Status = received`) |
| **Out for delivery** | Dispatched and on the way (`out_for_delivery`) |
| **Delivered** | Completed (`delivered`) |

- Each card shows the product image(s), customer, amount, date and payment id.
- **Drag** a card to another column to update it — or use the **‹ / ›** move
  buttons on the card (works on touch devices too).
- The stat cards at the top count how many orders are in each stage.
- A move POSTs `type: 'delivery_status'` to the webhook, which writes the new
  value into the `Delivery Status` column of **Purchase Details**.
- Only orders whose payment `Status` is `success` / `approved` / `demo` enter
  the board; failed/cancelled payments are excluded.

### Products with multiple images & videos

The **Add products** form accepts **multiple images and videos per product**
(click or drop into the upload box — pick as many files as you like):

- Images: JPG / PNG / WEBP, up to 4 MB each.
- Videos: MP4 / WEBM, up to 25 MB each. Keep a single save under ~35 MB total
  (Apps Script limits the request size).
- Every file is uploaded to the **MilirThreads Product Images** Drive folder.
  Images are stored as `lh3.googleusercontent.com` links; videos as Drive
  `/preview` links and are shown in an embedded player on the product page.
- The product detail page shows a gallery: a main viewer plus a thumbnail
  strip to switch between images and videos.
- **MRP** vs **Selling price**: the form has both. The storefront shows the
  selling price with the MRP struck through next to it.

### Reset a user / change admin password

- Reset a user: delete their row in the **Users** sheet, or have them use Forgot password.
- Change an admin's password: same as any user — Forgot password sends an OTP to the admin's email.
- Demote an admin: change their **Role** cell from `admin` back to `user`.

## 🔐 Google Sign-In Setup (free — do before going live)

The auth modal has a **"Sign in with Google"** button. Until a real OAuth Client ID is
configured it shows `Error 401: invalid_client` ("OAuth client was not found"), because
the pages ship with the placeholder `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`.

Setting this up is **completely free** — no cost, no credit card. Google only charges for
billable services (Maps, Cloud servers, storage); plain Google Sign-In is not billable.

> Recommended: do this with the **official business Google account**, not a personal one,
> before moving to live.

### Step 1 — Create a Google Cloud project
1. Go to <https://console.cloud.google.com/>
2. Top bar → project dropdown → **New Project** → name it `MilirThreads` → **Create**
3. Make sure that project is selected.

### Step 2 — Configure the OAuth consent screen
1. Left menu → **APIs & Services → OAuth consent screen**
2. User Type: **External** → **Create**
3. Fill in: App name `MilirThreads`, support email, developer email → **Save and Continue**
4. Skip Scopes → **Save and Continue**
5. **Test users** → add the Google accounts you'll log in with → **Save and Continue**
   (While the app is in "Testing" status, only listed test users can sign in.)
6. To allow any customer to sign in, later use **Publish App** on the consent screen.

### Step 3 — Create the OAuth Client ID
1. Left menu → **APIs & Services → Credentials**
2. **+ Create Credentials → OAuth client ID**
3. Application type: **Web application**, name `MilirThreads Web`
4. Under **Authorized JavaScript origins → + Add URI**, add every address the site runs on:
   - `http://localhost:5500` and `http://127.0.0.1:5500` (local dev — VS Code Live Server)
   - your real domain when live, e.g. `https://www.milirthreads.in`
5. Leave "Authorized redirect URIs" empty → **Create**
6. Copy the **Client ID** — it ends in `.apps.googleusercontent.com`.

### Step 4 — Put the Client ID in the site
Replace the placeholder `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with your real
Client ID. It appears in the `data-client_id` attribute of the auth modal on **5 pages**:

`Index.html`, `shop.html`, `contact.html`, `enquiry.html`, `search.html`

```html
<div id="g_id_onload"
     data-client_id="YOUR_REAL_CLIENT_ID.apps.googleusercontent.com"
     data-callback="handleGoogleSignIn"
     data-auto_prompt="false"></div>
```

Each of those pages already loads the Google library
(`<script src="https://accounts.google.com/gsi/client" async defer></script>` in `<head>`).

### Step 5 — Test
Open the site at one of the URLs you registered as an Authorized origin, click
**Sign in with Google**, and pick an account. On success the user is signed in and a row is
written to the **Users** sheet via the `google_login` webhook action.

> The Authorized JavaScript origin must match the address in the browser **exactly** —
> `http://localhost:5500` and `http://127.0.0.1:5500` count as different origins. Opening
> the file directly (`file://`) will never work; always use a local/hosted `http://` server.

## 🛒 Product Detail Page & Reviews

Every product card (on the home page, shop page and search page) is now clickable —
clicking the image or the product name opens **`product.html?id=<product code>`**, a
dedicated detail page. The card's Quick buy / Add cart / Save buttons still work without
navigating away.

The product detail page shows:

| Section | What it shows |
|---|---|
| **Detail** | Large image, name, category, price + discount, description, Add to cart / Buy now / Save |
| **Specifications** | A spec table (material, care, etc.). Built-in products have rich specs; admin-added products fall back to category + product code |
| **Ratings & Reviews** | Average score, star breakdown bars, a "Write a review" form, and the review list |
| **You may also like** | Up to 4 related products from the same section |

### How reviews work

- The 12 built-in products ship with sample reviews (edit them in `js/catalog.js` →
  the `reviews` array on each product).
- The **Write a review** form posts to the webhook (`type: 'review_add'`) and the review
  is appended to a **Reviews** sheet. It also appears on the page immediately.
- On page load, all reviews for that product are fetched from the sheet
  (`GET ?action=reviews&id=<code>`) and merged above the sample reviews.
- If the webhook isn't deployed yet, the review still shows on the page but a notice says
  it wasn't saved to the server.

> After adding the reviews code, **redeploy the Apps Script as a new version**
> (Deploy → Manage deployments → Edit → New version) or the `review_add` /
> `reviews` actions will return "Unknown payload type".

## 📑 Sheet Columns

**Purchase Details**
| Date | Name | Phone | Email | Which Product | Amount | Received Amount | Discount | Promo Code | Payment ID | Status | Shipping Address | Delivery Status |

> `Delivery Status` (`received` / `out_for_delivery` / `delivered`) is added
> automatically and drives the **Orders** Kanban board. It is separate from
> the payment `Status` column.

**Products**
| Date Added | Code | Name | Section | Sub Category | MRP | Price | Description | Image URL | Video URL | Added By |

> `Price` is the selling price; `MRP` is the struck-through price shown on the
> storefront. `Image URL` and `Video URL` hold comma-joined Drive links so a
> product can carry multiple images and videos.

**Leads**
| Date | Name | Phone | Email | Interest | Message |

**Users**
| Date Joined | Name | Email | Phone | Password Hash | Role |

**Reviews**
| Date | Product ID | Product Name | Customer Name | Email | Rating | Review |

## 📷 Instagram Feed Integration

The "@milirthreads" section on the homepage loads your actual Instagram posts when a token is configured. Without a token it falls back to the static tiles.

### Easy path — Instagram Basic Display API

1. Go to [developers.facebook.com](https://developers.facebook.com) and log in with the Facebook account linked to your Instagram.
2. **My Apps → Create App** → choose type **Consumer** → give it a name like "MilirThreads Site".
3. In the app dashboard left sidebar: **Add Product → Instagram Basic Display → Set Up**.
4. Click **Create New App** (inside Instagram Basic Display), fill in:
   - Display Name: MilirThreads
   - Valid OAuth Redirect URIs: `https://localhost/` (any URL works for personal use)
   - Deauthorize / Data Deletion URL: same as above
5. In **Roles → Roles**, add yourself as an **Instagram Tester** and accept the invite from your Instagram app (Settings → Apps and Websites → Tester Invites → Accept).
6. **User Token Generator** → click **Generate Token** for your Instagram username → log in to Instagram and approve → copy the short-lived token (valid 1 hour).
7. Exchange it for a **long-lived token** (60 days) — open this URL in a browser (replace the placeholders):
   ```
   https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=YOUR_APP_SECRET&access_token=SHORT_TOKEN
   ```
   The response includes the long-lived `access_token`.
8. Paste that token into `script.js → CONFIG.INSTAGRAM_TOKEN`.
9. Refresh the homepage — your six latest posts replace the static tiles.

### Keeping the token alive

Long-lived tokens last 60 days. Refresh by calling:
```
https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=LONG_LIVED_TOKEN
```
or just regenerate via the User Token Generator. For zero-maintenance, use a third-party widget service like [Behold](https://behold.so) or [SnapWidget](https://snapwidget.com) instead — they handle token refresh and give you a `<script>` to drop into the page.

### What gets shown

The integration fetches the 6 latest posts (images + video thumbnails), uses the post caption as alt text and hover tooltip, and each tile links to the original Instagram post.

## 🎟️ Promo Codes

Defined in `script.js` as `PROMO_CODES`. The starter code:

```js
const PROMO_CODES = {
  MILIR10: { percent: 10, label: '10% off (MILIR10)' }
};
```

Add more by appending entries like `FESTIVE25: { percent: 25, label: '25% off' }`. The discount is calculated as `round(amount * percent / 100)`; `received_amount = amount - discount`.

## 📱 Update Your Social & Contact Links

In each HTML page, replace:

| Placeholder | Replace with |
|---|---|
| `https://wa.me/911234567890` | Your WhatsApp number link |
| `https://instagram.com` | Your Instagram URL |
| `https://facebook.com` | Your Facebook URL |
| `https://snapchat.com` | Your Snapchat URL |
| `hello@milirthreads.in` | Your email |
| `+91 12345 67890` | Your phone |
| Address block | Your studio/store address |

## 🛍️ Add Your Products

In `script.js`, edit the `PRODUCTS` array:

```js
{
  id: 'p001',
  name: 'Product name',
  section: 'Women\'s' | 'HandCraft' | 'Kids' | '3D Product',
  shopCategory: 'Kurtas' | 'Jewellery' | ...,
  category: 'Women\'s Clothing' | 'Accessories' | 'Handcrafted Gifts' | ...,
  price: 2499,
  mrp: 3200,
  badge: 'New',     // optional
  img: 'https://...'
}
```

## ✅ What's Wired Up

- Razorpay checkout with prefill, custom theme, dismiss + failure handlers
- Single-product Quick Buy AND multi-item Cart checkout (cart total is what gets charged)
- Promo codes with live amount/discount/received summary
- Google Sheets logging for every order **and** every failed attempt (so you see drop-offs)
- Toasts for success / warn / error / info
- Filter + sort modals on the shop page
- Right-side cart drawer with quantity controls

---
Need server-side signature verification or order confirmation emails? `google-apps-script.gs` is a good place to add `MailApp.sendEmail(...)` after appending to the Purchase Details sheet.
