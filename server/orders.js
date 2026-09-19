'use strict';
const crypto = require('crypto');
const { db } = require('./db');
const { getShippingFee } = require('./shipping');

function genReference() {
  return 'GLS-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}
function genAccessToken() {
  return crypto.randomBytes(24).toString('hex');
}

class OrderError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Creates an order. Prices and stock are read fresh from the database — the
 * client only ever sends product IDs and quantities, never amounts. Stock is
 * decremented immediately (inside a transaction) so two buyers can't both
 * check out the last pair of the same frame; if the order is cancelled or
 * never paid, an admin cancel restores the stock.
 */
function createOrder({ items, customer, address }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderError('Your cart is empty.');
  }
  if (!customer || !customer.name || !customer.email || !customer.phone) {
    throw new OrderError('Please provide your name, email and phone number.');
  }
  if (!address || !address.line || !address.city || !address.state) {
    throw new OrderError('Please provide a full delivery address, city and state.');
  }

  const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1');
  const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

  const resolvedItems = [];
  let subtotal = 0;

  const run = db.transaction(() => {
    for (const rawItem of items) {
      const productId = parseInt(rawItem.productId, 10);
      const quantity = parseInt(rawItem.quantity, 10);
      if (!productId || !quantity || quantity < 1) {
        throw new OrderError('Invalid item in cart.');
      }
      const product = getProduct.get(productId);
      if (!product) {
        throw new OrderError(`One of the items in your cart is no longer available.`);
      }
      if (product.stock < quantity) {
        throw new OrderError(`Sorry, only ${product.stock} left in stock for "${product.name}".`);
      }
      resolvedItems.push({
        product_id: product.id,
        name: product.name,
        unit_price: product.price,
        quantity,
      });
      subtotal += product.price * quantity;
      updateStock.run(quantity, product.id);
    }

    const shippingFee = getShippingFee(address.state);
    const total = subtotal + shippingFee;
    const accessToken = genAccessToken();

    const info = db
      .prepare(
        `INSERT INTO orders
          (access_token, customer_name, email, phone, address_line, city, state, subtotal, shipping_fee, total, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment')`
      )
      .run(
        accessToken,
        customer.name.trim(),
        customer.email.trim(),
        customer.phone.trim(),
        address.line.trim(),
        address.city.trim(),
        address.state.trim(),
        subtotal,
        shippingFee,
        total
      );

    const orderId = Number(info.lastInsertRowid);
    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)'
    );
    for (const item of resolvedItems) {
      insertItem.run(orderId, item.product_id, item.name, item.unit_price, item.quantity);
    }

    return { orderId, accessToken, subtotal, shippingFee, total };
  });

  return run();
}

function restockOrder(orderId) {
  const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
  const restock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
  const run = db.transaction(() => {
    for (const item of items) {
      if (item.product_id) restock.run(item.quantity, item.product_id);
    }
  });
  run();
}

function getOrder(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  return order;
}

function getOrderByReference(reference) {
  const order = db.prepare('SELECT * FROM orders WHERE payment_reference = ?').get(reference);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  return order;
}

function attachPaymentReference(orderId, reference, method) {
  db.prepare('UPDATE orders SET payment_reference = ?, payment_method = ? WHERE id = ?').run(reference, method, orderId);
}

function markPaid(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new OrderError('Order not found', 404);
  if (order.status === 'paid' || order.status === 'processing' || order.status === 'shipped' || order.status === 'delivered') {
    return order; // already paid; idempotent (webhook + callback can both fire)
  }
  db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(orderId);
  return getOrder(orderId);
}

function markShipped(orderId, { carrier, trackingNumber }) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new OrderError('Order not found', 404);
  if (order.status !== 'paid' && order.status !== 'processing') {
    throw new OrderError('Only paid orders can be marked as shipped.');
  }
  db.prepare(
    "UPDATE orders SET status = 'shipped', carrier = ?, tracking_number = ?, shipped_at = datetime('now') WHERE id = ?"
  ).run(carrier || '', trackingNumber || '', orderId);
  return getOrder(orderId);
}

function markDelivered(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new OrderError('Order not found', 404);
  if (order.status !== 'shipped') {
    throw new OrderError('Only shipped orders can be marked as delivered.');
  }
  db.prepare("UPDATE orders SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?").run(orderId);
  return getOrder(orderId);
}

function cancelOrder(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new OrderError('Order not found', 404);
  if (order.status === 'shipped' || order.status === 'delivered' || order.status === 'cancelled') {
    throw new OrderError('This order can no longer be cancelled.');
  }
  restockOrder(orderId);
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(orderId);
  return getOrder(orderId);
}

function listOrders({ status } = {}) {
  let orders;
  if (status && status !== 'all') {
    orders = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all(status);
  } else {
    orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  }
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  for (const order of orders) {
    order.items = itemsStmt.all(order.id);
  }
  return orders;
}

module.exports = {
  OrderError,
  genReference,
  createOrder,
  getOrder,
  getOrderByReference,
  attachPaymentReference,
  markPaid,
  markShipped,
  markDelivered,
  cancelOrder,
  listOrders,
  restockOrder,
};
