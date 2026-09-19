# BoboOnigo — Glasses Store

A complete, self-contained ecommerce site for selling glasses online:

- Buyers browse frames, add to cart, and pay securely online (Paystack).
- **Free shipping within Lagos.** Every other Nigerian state has a shipping
  fee that you control from the seller dashboard.
- Sellers get a password-protected dashboard to see paid orders, mark them
  shipped with a tracking number, manage the product catalog, and edit
  shipping fees per state.

It's plain Node.js — no framework, no build step, no paid hosting required
to try it out. It uses Node's built-in SQLite (`node:sqlite`), so there is
nothing to install.

## 1. Requirements

- Node.js **22.5 or newer** (check with `node -v`). This app uses Node's
  built-in SQLite module, which is only available from that version on.

## 2. Setup

```bash
cd glasses-shop
cp .env.example .env
```

Open `.env` and set:

- `ADMIN_PASSWORD` — the password you'll use to log in to the seller
  dashboard at `/admin/login.html`. Change this from the example value.
- `SESSION_SECRET` — any long random string (used to keep admin logins
  secure).
- `PUBLIC_BASE_URL` — the URL your site will be reachable at. For local
  testing, leave it as `http://localhost:3000`. When you deploy, set it to
  your real domain (e.g. `https://shop.example.com`) — this is required for
  Paystack's payment redirect to come back to the right place.

Then seed the sample catalog (8 example frames) and start the server:

```bash
node server/seed.js   # only needed once, to add sample products
node server/index.js
```

Visit **http://localhost:3000** for the shop, and
**http://localhost:3000/admin/login.html** for the seller dashboard.

## 3. Accepting real payments (Paystack)

Out of the box, with no Paystack keys set, the site runs in **demo payment
mode** — checkout shows a "Simulate successful payment" button instead of
a real card form, so you can test the whole flow (including "seller ships
order") without touching real money.

To accept real payments:

1. Create a free account at [paystack.com](https://paystack.com) (Paystack
   supports Nigerian businesses and settles in Naira).
2. Get your **Secret Key** and **Public Key** from
   Settings → API Keys & Webhooks.
3. Add them to `.env`:
   ```
   PAYSTACK_SECRET_KEY=sk_live_xxxxxxxx
   PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxx
   ```
   (Use the `sk_test_...` / `pk_test_...` keys first to try it with
   Paystack's test cards before going live.)
4. In your Paystack dashboard, add a webhook URL pointing to:
   `https://yourdomain.com/api/paystack/webhook`
   This is a safety net that confirms payment even if the buyer closes
   their browser right after paying.
5. Restart the server. It will now redirect buyers to Paystack's real
   checkout page.

## 4. How shipping works

- **Lagos is always free shipping.** This is hard-coded on the server
  side — even if someone tampers with the checkout request, or an admin
  tries to set a fee for Lagos, the server forces it back to ₦0.
- Every other state has a shipping fee, shown to the buyer at checkout
  before they pay. You can edit these fees any time from
  **Seller Dashboard → Shipping rates**.
- A state that hasn't been explicitly priced falls back to
  `DEFAULT_SHIPPING_FEE` from `.env` (₦3,500 by default).

All prices and shipping fees are calculated **on the server**, using the
current price in the database — the browser never gets to decide what
something costs, even if someone edits the page or replays a request with
different numbers.

## 5. Running the seller dashboard

Go to `/admin/login.html` and enter your `ADMIN_PASSWORD`. From there:

- **Orders** — see everything that's been paid for and needs shipping
  ("To ship" tab). Click **Mark shipped**, enter the courier name and
  tracking number, and the buyer's order status updates immediately.
  Once it's out for delivery, mark it **Delivered**. If someone pays by
  bank transfer outside the site, use **Mark paid** to confirm it manually.
- **Products** — add new frames (with a photo, price and stock count),
  edit existing ones, or hide/delete a listing.
- **Shipping rates** — edit the delivery fee for each state. Lagos is
  locked at ₦0 and can't be changed.

## 6. Project structure

```
glasses-shop/
  server/          Node.js backend (plain http, no framework)
    index.js        Routes + server startup
    db.js            SQLite schema & connection
    products.js       Product CRUD
    orders.js          Order creation, payment, fulfillment logic
    shipping.js         Lagos-free / per-state shipping calculator
    paystack.js          Paystack API calls (initialize/verify/webhook)
    auth.js               Admin login/session handling
    seed.js                Sample product data
  public/          Static frontend (plain HTML/CSS/JS, no framework)
    index.html        Storefront
    product.html        Single product + add to cart
    cart.html             Cart
    checkout.html          Checkout form + live shipping calculation
    demo-pay.html            Stand-in payment page (demo mode only)
    order-success.html        Order confirmation
    admin/                     Seller dashboard pages
  uploads/         Product photos uploaded from the admin dashboard
  data/shop.db     SQLite database (created automatically)
```

## 7. Deploying

This app needs a place that can run a persistent Node.js process (not a
static host), since it has its own server and database file — for example
a small VPS, Render, Railway, or Fly.io. Steps are the same everywhere:

1. Copy the project to the server.
2. Set your real `.env` values (especially `ADMIN_PASSWORD`,
   `SESSION_SECRET`, `PUBLIC_BASE_URL`, and your Paystack keys).
3. Run `node server/seed.js` once, then keep `node server/index.js` running
   (e.g. with `pm2`, `forever`, or your host's process manager).
4. Point your domain at the server and make sure it's served over HTTPS —
   most hosts do this for you automatically.

## 8. Notes & limitations

- This is a single-seller shop (one shared admin password), which matches
  what was asked for. It doesn't have buyer accounts — buyers track their
  order using the confirmation link they get after checkout.
- The database is a single SQLite file (`data/shop.db`). Back this file up
  periodically once you're running for real — it holds every order.
- Uploaded product photos are stored under `uploads/`; back that up too.
