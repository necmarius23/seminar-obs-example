import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'

const fmt     = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDate = (s) => new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

const STATUSES = ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']

function OrderCard({ order, style, onStatusChange }) {
  const [updating, setUpdating] = useState(false)
  const [open, setOpen]         = useState(false)

  const update = async (status) => {
    setUpdating(true)
    try {
      await api.orders.updateStatus(order.id, status)
      onStatusChange()
    } finally {
      setUpdating(false)
      setOpen(false)
    }
  }

  const nextStatuses = STATUSES.filter((s) => s !== order.status && order.status !== 'CANCELLED' && order.status !== 'DELIVERED')

  return (
    <article className="card order-card" style={style}>
      {/* Order header */}
      <div className="order-header">
        <div>
          <div className="order-id">Order #{order.id}</div>
          <div className="order-date">{fmtDate(order.createdAt)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={order.status} />
          {/* Status transition menu */}
          {nextStatuses.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setOpen((o) => !o)}
                disabled={updating}
                aria-label="Change order status"
                style={{ fontSize: '0.65rem' }}
              >
                {updating ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '⋯'}
              </button>
              {open && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  background: 'var(--bg-3)', border: '1px solid var(--border-hover)',
                  borderRadius: 4, padding: '4px', zIndex: 50, minWidth: 130,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  animation: 'fadeIn 120ms ease',
                }}>
                  {nextStatuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => update(s)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '7px 10px', borderRadius: 3, fontSize: '0.75rem',
                        fontWeight: 600, color: 'var(--text-2)',
                        transition: 'background 120ms, color 120ms',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-4)'; e.currentTarget.style.color = 'var(--text-1)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '' }}
                    >
                      → {s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="order-items">
        {(order.items ?? []).map((item) => (
          <div className="order-line" key={item.id}>
            <span className="order-line__name">{item.product?.name ?? `Product #${item.product?.id}`}</span>
            <span className="order-line__qty">× {item.quantity}</span>
            <span className="order-line__price">{fmt(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="order-total-row">
        <span className="order-total-label">Order total</span>
        <span className="order-total-val">{fmt(order.totalAmount)}</span>
      </div>
    </article>
  )
}

export default function OrdersPage() {
  const { userId } = useApp()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(() => {
    let live = true
    setLoading(true)
    setError(null)
    api.orders.list(userId)
      .then((data) => { if (live) { setOrders(data); setLoading(false) } })
      .catch((e)   => { if (live) { setError(e.message); setLoading(false) } })
    return () => { live = false }
  }, [userId])

  useEffect(load, [load])

  return (
    <main className="page">
      {/* Heading */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Your Orders</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Showing orders for{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{userId}</span>
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {/* States */}
      {error && (
        <div className="empty">
          <div className="empty__icon">⚠️</div>
          <div className="empty__title">Could not load orders</div>
          <p className="empty__sub">{error}</p>
          <button className="btn btn-outline" style={{ marginTop: '0.5rem' }} onClick={load}>Retry</button>
        </div>
      )}

      {loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1, 2].map((i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div className="skeleton" style={{ height: 16, width: 120 }} />
                <div className="skeleton" style={{ height: 22, width: 90, borderRadius: 2 }} />
              </div>
              <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: '60%' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <div className="empty">
          <div className="empty__icon">📦</div>
          <div className="empty__title">No orders yet</div>
          <p className="empty__sub">Head to the shop, fill your cart, and checkout.</p>
        </div>
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="orders-list">
          {orders.map((order, i) => (
            <OrderCard
              key={order.id}
              order={order}
              style={{ animationDelay: `${i * 60}ms` }}
              onStatusChange={load}
            />
          ))}
        </div>
      )}
    </main>
  )
}
