import React, { useState, useEffect } from 'react'
import { api } from '../api/client'
import ProductCard from '../components/ProductCard'

const ALL = '__all__'

export default function CatalogPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [category, setCategory] = useState(ALL)
  const [categories, setCategories] = useState([])

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    api.products.list(category === ALL ? null : category)
      .then((data) => {
        if (!live) return
        setProducts(data)
        // Build category list from all-products response on first load
        if (category === ALL) {
          const cats = [...new Set(data.map((p) => p.category))].sort()
          setCategories(cats)
        }
        setLoading(false)
      })
      .catch((err) => {
        if (!live) return
        setError(err.message)
        setLoading(false)
      })
    return () => { live = false }
  }, [category])

  return (
    <main className="page">
      {/* Page heading */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Our Collection</h1>
        <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          {loading ? '—' : `${products.length} products`}
        </p>
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="category-bar" style={{ marginBottom: '1.75rem' }}>
          <button
            className={`cat-pill${category === ALL ? ' active' : ''}`}
            onClick={() => setCategory(ALL)}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`cat-pill${category === cat ? ' active' : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* States */}
      {error && (
        <div className="empty">
          <div className="empty__icon">⚠️</div>
          <div className="empty__title">Could not load products</div>
          <p className="empty__sub">{error}</p>
          <button
            className="btn btn-outline"
            style={{ marginTop: '0.5rem' }}
            onClick={() => setCategory(category)}
          >
            Retry
          </button>
        </div>
      )}

      {loading && !error && (
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 320 }}>
              <div className="skeleton" style={{ height: 180 }} />
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="skeleton" style={{ height: 18, width: '70%' }} />
                <div className="skeleton" style={{ height: 14, width: '90%' }} />
                <div className="skeleton" style={{ height: 14, width: '60%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="empty">
          <div className="empty__icon">🔍</div>
          <div className="empty__title">No products found</div>
          <p className="empty__sub">Try a different category.</p>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="product-grid">
          {products.map((p, i) => (
            <ProductCard
              key={p.id}
              product={p}
              style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}
            />
          ))}
        </div>
      )}
    </main>
  )
}
