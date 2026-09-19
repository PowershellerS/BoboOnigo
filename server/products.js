'use strict';
const { db } = require('./db');

function listActiveProducts() {
  return db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC').all();
}

function listAllProducts() {
  return db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
}

function getProduct(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function createProduct({ name, description, price, image, stock }) {
  const info = db
    .prepare('INSERT INTO products (name, description, price, image, stock, active) VALUES (?, ?, ?, ?, ?, 1)')
    .run(name, description || '', price, image || '', stock || 0);
  return getProduct(Number(info.lastInsertRowid));
}

function updateProduct(id, fields) {
  const existing = getProduct(id);
  if (!existing) return null;
  const merged = {
    name: fields.name ?? existing.name,
    description: fields.description ?? existing.description,
    price: fields.price ?? existing.price,
    image: fields.image ?? existing.image,
    stock: fields.stock ?? existing.stock,
    active: fields.active ?? existing.active,
  };
  db.prepare('UPDATE products SET name=?, description=?, price=?, image=?, stock=?, active=? WHERE id=?').run(
    merged.name,
    merged.description,
    merged.price,
    merged.image,
    merged.stock,
    merged.active ? 1 : 0,
    id
  );
  return getProduct(id);
}

function deleteProduct(id) {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

module.exports = { listActiveProducts, listAllProducts, getProduct, createProduct, updateProduct, deleteProduct };
