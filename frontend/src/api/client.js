const BASE = '/api'

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.message || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  products: {
    list: (category) =>
      req('GET', category ? `/products?category=${encodeURIComponent(category)}` : '/products'),
    get: (id) => req('GET', `/products/${id}`),
    create: (data) => req('POST', '/products', data),
  },
  cart: {
    get: (userId) => req('GET', `/cart/${userId}`),
    addItem: (userId, productId, quantity) =>
      req('POST', `/cart/${userId}/items`, { productId, quantity }),
    updateItem: (userId, itemId, quantity) =>
      req('PUT', `/cart/${userId}/items/${itemId}`, { quantity }),
    removeItem: (userId, itemId) => req('DELETE', `/cart/${userId}/items/${itemId}`),
    clear: (userId) => req('DELETE', `/cart/${userId}`),
  },
  orders: {
    list: (userId) => req('GET', `/orders/user/${userId}`),
    get: (orderId) => req('GET', `/orders/${orderId}`),
    checkout: (userId) => req('POST', `/orders/user/${userId}/checkout`),
    updateStatus: (orderId, status) =>
      req('PATCH', `/orders/${orderId}/status?status=${status}`),
  },
}
