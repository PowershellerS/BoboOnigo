'use strict';
const { db } = require('./db');
const products = require('./products');

const SAMPLE_PRODUCTS = [
  { name: 'Classic Tortoise Frame', description: 'Timeless acetate frame with a warm tortoiseshell finish. Comes with anti-scratch lenses.', price: 18500, image: '/img/frame-tortoise.svg', stock: 25 },
  { name: 'Onyx Black Wayfarer', description: 'Bold, matte-black wayfarer style. A versatile everyday frame for any face shape.', price: 15000, image: '/img/frame-black.svg', stock: 40 },
  { name: 'Gold Aviator Round', description: 'Slim gold-tone metal frame with round lenses. Lightweight and comfortable for all-day wear.', price: 22000, image: '/img/frame-gold.svg', stock: 15 },
  { name: 'Navy Blue Rectangle', description: 'Sharp rectangular frame in deep navy blue. A confident, professional look.', price: 16500, image: '/img/frame-blue.svg', stock: 30 },
  { name: 'Ruby Red Round', description: 'Statement round frame in a rich ruby red. Stands out without trying too hard.', price: 17000, image: '/img/frame-red.svg', stock: 20 },
  { name: 'Forest Green Square', description: 'Deep green square frame with a soft matte finish. Understated and elegant.', price: 16000, image: '/img/frame-green.svg', stock: 18 },
  { name: 'Crystal Clear Round', description: 'Transparent frame that pairs with everything. Minimalist and modern.', price: 14000, image: '/img/frame-clear.svg', stock: 35 },
  { name: 'Sunset Orange Square', description: 'Warm burnt-orange square frame for a bold pop of color.', price: 15500, image: '/img/frame-sunset.svg', stock: 22 },
];

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (count > 0) {
    console.log(`Products table already has ${count} row(s); skipping seed. Delete data/shop.db to reseed.`);
    return;
  }
  for (const p of SAMPLE_PRODUCTS) {
    products.createProduct(p);
  }
  console.log(`Seeded ${SAMPLE_PRODUCTS.length} sample products.`);
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
