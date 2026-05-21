import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProductVisual from './ProductVisual'
import { useApp } from '../context/AppContext'

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const CATEGORY_COLORS = {
  Electronics: { color: '#4A88E8', bg: 'rgba(74,136,232,0.12)' },
  Furniture:   { color: '#30A866', bg: 'rgba(48,168,102,0.12)' },
  Accessories: { color: '#8855E8', bg: 'rgba(136,85,232,0.12)' },
  Stationery:  { color: '#C89028', bg: 'rgba(200,144,40,0.12)' },
}

export default function ProductCard({ product, style }) {
  const { addToCart } = useApp()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const catStyle = CATEGORY_COLORS[product.category] || { color: '#9E8E80', bg: 'rgba(158,142,128,0.12)' }
  const outOfStock = product.stockQuantity === 0
  const lowStock   = product.stockQuantity > 0 && product.stockQuantity <= 5

  const handleAdd = async (e) => {
    e.stopPropagation()
    if (loading || outOfStock) return
    setLoading(true)
    try { await addToCart(product.id, 1, product.name) }
    finally { setLoading(false) }
  }

  return (
    <article
      className="card product-card"
      style={style}
      onClick={() => navigate(`/products/${product.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/products/${product.id}`)}
      aria-label={product.name}
    >
      <ProductVisual name={product.name} category={product.category} />

      <div className="divider" />

      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{product.description}</p>

        <div className="product-meta">
          <span
            className="tag"
            style={{ color: catStyle.color, background: catStyle.bg }}
          >
            {product.category}
          </span>
          <span
            className={`product-stock ${outOfStock ? 'out' : lowStock ? 'low' : ''}`}
          >
            {outOfStock ? 'Out of stock' : lowStock ? `Only ${product.stockQuantity} left` : `${product.stockQuantity} in stock`}
          </span>
        </div>

        <div className="product-footer">
          <span className="product-price">{fmt(product.price)}</span>
          <button
            className="add-btn"
            onClick={handleAdd}
            disabled={loading || outOfStock}
            aria-label={`Add ${product.name} to cart`}
          >
            {loading
              ? <span className="spinner" style={{ width: 12, height: 12 }} />
              : outOfStock ? 'Sold out' : '+ Cart'
            }
          </button>
        </div>
      </div>
    </article>
  )
}
