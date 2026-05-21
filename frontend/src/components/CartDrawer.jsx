import React from 'react'
import { useApp } from '../context/AppContext'
import ProductVisual from './ProductVisual'

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

function CartItemRow({ item }) {
  const { updateCartItem, removeCartItem } = useApp()

  const dec = () => {
    if (item.quantity <= 1) removeCartItem(item.id)
    else updateCartItem(item.id, item.quantity - 1)
  }
  const inc = () => updateCartItem(item.id, item.quantity + 1)

  return (
    <div className="cart-item">
      {/* Mini visual */}
      <div
        className="cart-item__visual"
        style={{ background: 'var(--bg-3)', border: '1px solid var(--border)' }}
      >
        <span style={{ fontSize: '1.5rem' }} aria-hidden>
          {getEmoji(item.product?.name, item.product?.category)}
        </span>
      </div>

      <div className="cart-item__info">
        <div className="cart-item__name">
          {item.product?.name ?? `Product #${item.product?.id}`}
        </div>
        <div className="cart-item__sub">{fmt(item.unitPrice)} each</div>
        <div className="cart-item__controls">
          <button className="qty-btn" onClick={dec} aria-label="Decrease quantity">−</button>
          <span className="qty-val">{item.quantity}</span>
          <button className="qty-btn" onClick={inc} aria-label="Increase quantity">+</button>
        </div>
      </div>

      <div className="cart-item__right">
        <span className="cart-item__price">{fmt(item.unitPrice * item.quantity)}</span>
        <button
          className="cart-remove"
          onClick={() => removeCartItem(item.id)}
          aria-label={`Remove ${item.product?.name}`}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function getEmoji(name = '', category = '') {
  const n = name.toLowerCase()
  if (n.includes('laptop'))   return '💻'
  if (n.includes('keyboard')) return '⌨️'
  if (n.includes('mouse'))    return '🖱️'
  if (n.includes('monitor') || n.includes('display')) return '🖥️'
  if (n.includes('webcam'))   return '📷'
  if (n.includes('hub') || n.includes('usb')) return '🔌'
  if (n.includes('chair'))    return '🪑'
  if (n.includes('desk'))     return '🗂️'
  if (n.includes('lamp'))     return '💡'
  if (n.includes('notebook')) return '📓'
  const cat = (category || '').toLowerCase()
  if (cat === 'electronics') return '⚡'
  if (cat === 'furniture')   return '🏠'
  if (cat === 'accessories') return '✨'
  if (cat === 'stationery')  return '✏️'
  return '📦'
}

export default function CartDrawer() {
  const { cart, cartOpen, cartTotal, cartLoading, closeCart, checkout } = useApp()

  if (!cartOpen) return null

  const items = cart?.items ?? []

  return (
    <>
      {/* Backdrop */}
      <div className="overlay" onClick={closeCart} aria-hidden />

      {/* Drawer */}
      <aside className="cart-drawer" role="dialog" aria-label="Shopping cart" aria-modal>
        {/* Header */}
        <div className="cart-header">
          <div className="cart-title">
            Cart
            <span className="cart-title__count">
              {items.reduce((n, i) => n + i.quantity, 0)} items
            </span>
          </div>
          <button className="cart-close" onClick={closeCart} aria-label="Close cart">✕</button>
        </div>

        {/* Items */}
        <div className="cart-items">
          {items.length === 0 ? (
            <div className="empty" style={{ padding: '3rem 1.5rem' }}>
              <div className="empty__icon">🛒</div>
              <div className="empty__title">Your cart is empty</div>
              <p className="empty__sub">Browse the shop and add something you like.</p>
            </div>
          ) : (
            items.map((item) => <CartItemRow key={item.id} item={item} />)
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="cart-footer">
            <div className="cart-summary">
              <span className="cart-summary__label">Total</span>
              <span className="cart-summary__total">{fmt(cartTotal)}</span>
            </div>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', fontSize: '0.82rem', letterSpacing: '0.07em' }}
              onClick={checkout}
              disabled={cartLoading}
            >
              {cartLoading
                ? <><span className="spinner" /> Processing…</>
                : 'Checkout →'
              }
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
