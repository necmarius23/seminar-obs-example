import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import ProductVisual from '../components/ProductVisual'
import StatusBadge from '../components/StatusBadge'

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const CATEGORY_COLORS = {
  Electronics: { color: '#4A88E8', bg: 'rgba(74,136,232,0.12)' },
  Furniture:   { color: '#30A866', bg: 'rgba(48,168,102,0.12)' },
  Accessories: { color: '#8855E8', bg: 'rgba(136,85,232,0.12)' },
  Stationery:  { color: '#C89028', bg: 'rgba(200,144,40,0.12)' },
}

export default function ProductDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useApp()

  const [product, setProduct]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [qty, setQty]           = useState(1)
  const [adding, setAdding]     = useState(false)

  useEffect(() => {
    let live = true
    setLoading(true)
    api.products.get(id)
      .then((p) => { if (live) { setProduct(p); setLoading(false) } })
      .catch((e) => { if (live) { setError(e.message); setLoading(false) } })
    return () => { live = false }
  }, [id])

  const handleAdd = async () => {
    if (adding) return
    setAdding(true)
    try { await addToCart(product.id, qty, product.name) }
    finally { setAdding(false) }
  }

  if (loading) return (
    <main className="page">
      <div className="page-loading">
        <span className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    </main>
  )

  if (error || !product) return (
    <main className="page">
      <div className="empty">
        <div className="empty__icon">⚠️</div>
        <div className="empty__title">Product not found</div>
        <p className="empty__sub">{error}</p>
        <button className="btn btn-outline" style={{ marginTop: '0.5rem' }} onClick={() => navigate('/')}>
          Back to Shop
        </button>
      </div>
    </main>
  )

  const catStyle   = CATEGORY_COLORS[product.category] || { color: '#9E8E80', bg: 'rgba(158,142,128,0.12)' }
  const outOfStock = product.stockQuantity === 0
  const lowStock   = product.stockQuantity > 0 && product.stockQuantity <= 5

  return (
    <main className="page" style={{ animation: 'fadeUp 360ms var(--ease-out)' }}>
      {/* Back */}
      <button className="back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="detail-grid">
        {/* Visual */}
        <div className="card detail-visual">
          <ProductVisual name={product.name} category={product.category} size="lg" />
        </div>

        {/* Info */}
        <div className="detail-info">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              className="tag"
              style={{ color: catStyle.color, background: catStyle.bg }}
            >
              {product.category}
            </span>
            {outOfStock && <span className="tag" style={{ color: 'var(--danger)', background: 'rgba(224,64,64,0.12)' }}>Out of stock</span>}
            {lowStock   && <span className="tag" style={{ color: 'var(--warning)', background: 'rgba(216,160,32,0.12)' }}>Low stock — {product.stockQuantity} left</span>}
          </div>

          <h1 className="detail-name">{product.name}</h1>

          <p className="detail-desc">{product.description}</p>

          <div className="detail-price">{fmt(product.price)}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {!outOfStock && (
              <>
                {/* Qty picker */}
                <div>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '8px' }}>
                    Quantity
                  </p>
                  <div className="qty-selector">
                    <button
                      className="qty-btn"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                      aria-label="Decrease"
                    >−</button>
                    <span className="qty-val">{qty}</span>
                    <button
                      className="qty-btn"
                      onClick={() => setQty((q) => Math.min(product.stockQuantity, q + 1))}
                      disabled={qty >= product.stockQuantity}
                      aria-label="Increase"
                    >+</button>
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-lg"
                  style={{ alignSelf: 'flex-start', minWidth: 200 }}
                  onClick={handleAdd}
                  disabled={adding}
                >
                  {adding
                    ? <><span className="spinner" /> Adding…</>
                    : `Add ${qty > 1 ? `${qty}×` : ''} to Cart →`
                  }
                </button>
              </>
            )}

            {outOfStock && (
              <button className="btn btn-outline btn-lg" disabled style={{ alignSelf: 'flex-start', minWidth: 200 }}>
                Out of stock
              </button>
            )}
          </div>

          {/* Stock detail */}
          {!outOfStock && !lowStock && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
              {product.stockQuantity} units available
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
