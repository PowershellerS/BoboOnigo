// Cart is stored client-side in localStorage as a simple array of
// { productId, quantity }. It is only a convenience for the buyer — the
// server always recomputes prices, stock and shipping fees from scratch
// when the order is actually placed, so nothing here is trusted.
const CART_KEY = 'glasses_cart_v1';

function formatNaira(amount) {
  const n = Math.round(Number(amount) || 0);
  return '₦' + n.toLocaleString('en-NG');
}

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(productId, quantity) {
  const cart = getCart();
  const existing = cart.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ productId, quantity });
  }
  saveCart(cart);
}

function setCartQuantity(productId, quantity) {
  let cart = getCart();
  if (quantity <= 0) {
    cart = cart.filter((i) => i.productId !== productId);
  } else {
    const existing = cart.find((i) => i.productId === productId);
    if (existing) existing.quantity = quantity;
  }
  saveCart(cart);
}

function removeFromCart(productId) {
  setCartQuantity(productId, 0);
}

function clearCart() {
  saveCart([]);
}

function cartItemCount() {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

function updateCartBadge() {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = String(cartItemCount());
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
