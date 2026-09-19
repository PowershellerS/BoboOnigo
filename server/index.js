'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { URL } = require('url');

const env = require('./env');
const { readJson, sendJson, sendError, readBody } = require('./http-utils');
const { serveFrom } = require('./static');
const auth = require('./auth');
const products = require('./products');
const shipping = require('./shipping');
const orders = require('./orders');
const paystack = require('./paystack');
const { NIGERIA_STATES } = require('./db');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const servePublic = serveFrom(PUBLIC_DIR);
const serveUploads = serveFrom(UPLOADS_DIR);

function money(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

function publicOrderView(order) {
  return {
    id: order.id,
    status: order.status,
    customerName: order.customer_name,
    email: order.email,
    phone: order.phone,
    addressLine: order.address_line,
    city: order.city,
    state: order.state,
    subtotal: order.subtotal,
    shippingFee: order.shipping_fee,
    total: order.total,
    carrier: order.carrier || null,
    trackingNumber: order.tracking_number || null,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    shippedAt: order.shipped_at,
    deliveredAt: order.delivered_at,
    items: order.items.map((i) => ({ name: i.name, unitPrice: i.unit_price, quantity: i.quantity })),
  };
}

function adminOrderView(order) {
  return { ...publicOrderView(order), paymentReference: order.payment_reference, paymentMethod: order.payment_method };
}

// Saves a data: URL (from a <input type=file> read as base64 in the browser)
// to disk under /uploads and returns the public path to store on the product.
function saveDataUrlImage(dataUrl) {
  const match = /^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw Object.assign(new Error('Please upload a PNG, JPEG, WEBP or GIF image.'), { statusCode: 400 });
  const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length > 6 * 1024 * 1024) {
    throw Object.assign(new Error('Image is too large (max 6MB).'), { statusCode: 400 });
  }
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

function requireAdmin(req, res) {
  if (!auth.isAuthenticated(req)) {
    sendError(res, 401, 'Not authenticated.');
    return false;
  }
  return true;
}

async function handleApi(req, res, pathname, query) {
  // ---- Public catalog ----
  if (req.method === 'GET' && pathname === '/api/products') {
    return sendJson(res, 200, { products: products.listActiveProducts() });
  }
  let m;
  if (req.method === 'GET' && (m = /^\/api\/products\/(\d+)$/.exec(pathname))) {
    const product = products.getProduct(Number(m[1]));
    if (!product || !product.active) return sendError(res, 404, 'Product not found.');
    return sendJson(res, 200, { product });
  }

  if (req.method === 'GET' && pathname === '/api/states') {
    return sendJson(res, 200, { states: NIGERIA_STATES });
  }

  if (req.method === 'GET' && pathname === '/api/shipping/quote') {
    const state = query.get('state') || '';
    const fee = shipping.getShippingFee(state);
    return sendJson(res, 200, { state, fee, freeShipping: fee === 0 });
  }

  // ---- Orders (buyer) ----
  if (req.method === 'POST' && pathname === '/api/orders') {
    const body = await readJson(req);
    try {
      const result = orders.createOrder({ items: body.items, customer: body.customer, address: body.address });
      const order = orders.getOrder(result.orderId);
      const reference = orders.genReference();
      orders.attachPaymentReference(result.orderId, reference, env.DEMO_MODE ? 'demo' : 'paystack');

      if (env.DEMO_MODE) {
        return sendJson(res, 201, {
          demo: true,
          orderId: result.orderId,
          accessToken: result.accessToken,
          reference,
          subtotal: result.subtotal,
          shippingFee: result.shippingFee,
          total: result.total,
        });
      }

      const callbackUrl = `${env.PUBLIC_BASE_URL}/api/paystack/callback`;
      const init = await paystack.initializeTransaction({
        email: order.email,
        amountNaira: result.total,
        reference,
        callbackUrl,
        metadata: { orderId: result.orderId },
      });
      return sendJson(res, 201, {
        demo: false,
        orderId: result.orderId,
        accessToken: result.accessToken,
        reference,
        authorizationUrl: init.data.authorization_url,
        subtotal: result.subtotal,
        shippingFee: result.shippingFee,
        total: result.total,
      });
    } catch (err) {
      return sendError(res, err.statusCode || 400, err.message);
    }
  }

  // Demo-mode "pay now" simulation button (only meaningful when Paystack keys aren't configured).
  if (req.method === 'POST' && (m = /^\/api\/orders\/(\d+)\/demo-pay$/.exec(pathname))) {
    if (!env.DEMO_MODE) return sendError(res, 400, 'Demo payment is disabled; Paystack is configured.');
    const orderId = Number(m[1]);
    const body = await readJson(req);
    const order = orders.getOrder(orderId);
    if (!order || order.access_token !== body.accessToken) return sendError(res, 404, 'Order not found.');
    const updated = orders.markPaid(orderId);
    return sendJson(res, 200, { order: publicOrderView(updated) });
  }

  if (req.method === 'GET' && (m = /^\/api\/orders\/(\d+)$/.exec(pathname))) {
    const orderId = Number(m[1]);
    const token = query.get('token');
    const order = orders.getOrder(orderId);
    if (!order || !token || order.access_token !== token) return sendError(res, 404, 'Order not found.');
    return sendJson(res, 200, { order: publicOrderView(order) });
  }

  if (req.method === 'GET' && pathname === '/api/orders/by-reference') {
    const reference = query.get('reference');
    const token = query.get('token');
    const order = orders.getOrderByReference(reference || '');
    if (!order || !token || order.access_token !== token) return sendError(res, 404, 'Order not found.');
    return sendJson(res, 200, { order: publicOrderView(order) });
  }

  // ---- Paystack ----
  if (req.method === 'GET' && pathname === '/api/paystack/callback') {
    const reference = query.get('reference') || query.get('trxref');
    if (!reference) {
      res.writeHead(302, { Location: '/checkout.html?error=missing_reference' });
      return res.end();
    }
    try {
      const verified = await paystack.verifyTransaction(reference);
      const order = orders.getOrderByReference(reference);
      if (order && verified.data && verified.data.status === 'success') {
        orders.markPaid(order.id);
      }
      const token = order ? order.access_token : '';
      res.writeHead(302, { Location: `/order-success.html?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}` });
      return res.end();
    } catch (err) {
      res.writeHead(302, { Location: `/order-success.html?reference=${encodeURIComponent(reference)}&error=verify_failed` });
      return res.end();
    }
  }

  if (req.method === 'POST' && pathname === '/api/paystack/webhook') {
    const raw = await readBody(req);
    const signature = req.headers['x-paystack-signature'];
    if (!paystack.verifyWebhookSignature(raw, signature)) {
      return sendError(res, 401, 'Invalid signature.');
    }
    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return sendError(res, 400, 'Invalid payload.');
    }
    if (event.event === 'charge.success') {
      const reference = event.data && event.data.reference;
      const order = orders.getOrderByReference(reference);
      if (order) orders.markPaid(order.id);
    }
    return sendJson(res, 200, { received: true });
  }

  // ---- Admin auth ----
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const body = await readJson(req);
    if (!auth.checkPassword(body.password)) return sendError(res, 401, 'Incorrect password.');
    auth.createSession(res);
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    auth.destroySession(req, res);
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'GET' && pathname === '/api/admin/session') {
    return sendJson(res, 200, { authenticated: auth.isAuthenticated(req), demoMode: env.DEMO_MODE });
  }

  // ---- Admin: orders ----
  if (pathname.startsWith('/api/admin/')) {
    if (!requireAdmin(req, res)) return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/orders') {
    const status = query.get('status') || 'all';
    const list = orders.listOrders({ status }).map(adminOrderView);
    return sendJson(res, 200, { orders: list });
  }

  if (req.method === 'POST' && (m = /^\/api\/admin\/orders\/(\d+)\/ship$/.exec(pathname))) {
    const body = await readJson(req);
    try {
      const updated = orders.markShipped(Number(m[1]), { carrier: body.carrier, trackingNumber: body.trackingNumber });
      return sendJson(res, 200, { order: adminOrderView(updated) });
    } catch (err) {
      return sendError(res, err.statusCode || 400, err.message);
    }
  }

  if (req.method === 'POST' && (m = /^\/api\/admin\/orders\/(\d+)\/deliver$/.exec(pathname))) {
    try {
      const updated = orders.markDelivered(Number(m[1]));
      return sendJson(res, 200, { order: adminOrderView(updated) });
    } catch (err) {
      return sendError(res, err.statusCode || 400, err.message);
    }
  }

  if (req.method === 'POST' && (m = /^\/api\/admin\/orders\/(\d+)\/cancel$/.exec(pathname))) {
    try {
      const updated = orders.cancelOrder(Number(m[1]));
      return sendJson(res, 200, { order: adminOrderView(updated) });
    } catch (err) {
      return sendError(res, err.statusCode || 400, err.message);
    }
  }

  if (req.method === 'POST' && (m = /^\/api\/admin\/orders\/(\d+)\/mark-paid$/.exec(pathname))) {
    // Manual override for offline/bank-transfer payments.
    try {
      const updated = orders.markPaid(Number(m[1]));
      return sendJson(res, 200, { order: adminOrderView(updated) });
    } catch (err) {
      return sendError(res, err.statusCode || 400, err.message);
    }
  }

  // ---- Admin: products ----
  if (req.method === 'GET' && pathname === '/api/admin/products') {
    return sendJson(res, 200, { products: products.listAllProducts() });
  }
  if (req.method === 'POST' && pathname === '/api/admin/products') {
    const body = await readJson(req);
    try {
      let imagePath = '';
      if (body.imageDataUrl) imagePath = saveDataUrlImage(body.imageDataUrl);
      if (!body.name || !body.price) return sendError(res, 400, 'Name and price are required.');
      const product = products.createProduct({
        name: body.name.trim(),
        description: body.description || '',
        price: money(body.price),
        image: imagePath,
        stock: Math.max(0, parseInt(body.stock, 10) || 0),
      });
      return sendJson(res, 201, { product });
    } catch (err) {
      return sendError(res, err.statusCode || 400, err.message);
    }
  }
  if (req.method === 'PUT' && (m = /^\/api\/admin\/products\/(\d+)$/.exec(pathname))) {
    const body = await readJson(req);
    try {
      const fields = {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        description: body.description,
        price: body.price !== undefined ? money(body.price) : undefined,
        stock: body.stock !== undefined ? Math.max(0, parseInt(body.stock, 10) || 0) : undefined,
        active: body.active !== undefined ? !!body.active : undefined,
      };
      if (body.imageDataUrl) fields.image = saveDataUrlImage(body.imageDataUrl);
      const product = products.updateProduct(Number(m[1]), fields);
      if (!product) return sendError(res, 404, 'Product not found.');
      return sendJson(res, 200, { product });
    } catch (err) {
      return sendError(res, err.statusCode || 400, err.message);
    }
  }
  if (req.method === 'DELETE' && (m = /^\/api\/admin\/products\/(\d+)$/.exec(pathname))) {
    products.deleteProduct(Number(m[1]));
    return sendJson(res, 200, { ok: true });
  }

  // ---- Admin: shipping rates ----
  if (req.method === 'GET' && pathname === '/api/admin/shipping-rates') {
    return sendJson(res, 200, { rates: shipping.listShippingRates() });
  }
  if (req.method === 'PUT' && pathname === '/api/admin/shipping-rates') {
    const body = await readJson(req);
    if (!Array.isArray(body.rates)) return sendError(res, 400, 'Expected a "rates" array.');
    for (const r of body.rates) {
      if (!r.state) continue;
      shipping.setShippingRate(r.state, Math.max(0, parseInt(r.fee, 10) || 0));
    }
    return sendJson(res, 200, { rates: shipping.listShippingRates() });
  }

  sendError(res, 404, 'Not found.');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, url.searchParams);
      return;
    }

    if (pathname.startsWith('/uploads/')) {
      const rel = pathname.replace(/^\/uploads/, '');
      if (serveUploads(req, res, rel)) return;
      res.writeHead(404);
      return res.end('Not found');
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (servePublic(req, res, pathname)) return;
      // SPA-ish fallback: unknown non-API GET paths just 404 with the site's own page.
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 - Page not found</h1><p><a href="/">Back to the shop</a></p>');
    }

    res.writeHead(405);
    res.end('Method not allowed');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      sendError(res, err.statusCode || 500, err.message || 'Internal server error');
    } else {
      res.end();
    }
  }
});

server.listen(env.PORT, () => {
  console.log(`Glasses shop running at ${env.PUBLIC_BASE_URL} (port ${env.PORT})`);
  console.log(`Payment mode: ${env.DEMO_MODE ? 'DEMO (no Paystack keys set)' : 'LIVE Paystack'}`);
  console.log(`Admin dashboard: /admin/login.html`);
});
