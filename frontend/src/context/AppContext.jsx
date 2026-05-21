import React, {
  createContext, useContext, useReducer, useEffect, useCallback, useRef,
} from 'react'
import { api } from '../api/client'

const Ctx = createContext(null)

const init = {
  userId: 'user1',
  cart: null,
  cartOpen: false,
  cartLoading: false,
  toast: null,
}

function reducer(s, a) {
  switch (a.type) {
    case 'SET_USER':     return { ...s, userId: a.v, cart: null, cartOpen: false }
    case 'SET_CART':     return { ...s, cart: a.v, cartLoading: false }
    case 'CART_LOADING': return { ...s, cartLoading: true }
    case 'OPEN_CART':    return { ...s, cartOpen: true }
    case 'CLOSE_CART':   return { ...s, cartOpen: false }
    case 'TOGGLE_CART':  return { ...s, cartOpen: !s.cartOpen }
    case 'SET_TOAST':    return { ...s, toast: a.v }
    default:             return s
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init)
  const toastTimer = useRef(null)

  // Fetch cart whenever userId changes
  useEffect(() => {
    let live = true
    api.cart.get(state.userId)
      .then(cart  => { if (live) dispatch({ type: 'SET_CART', v: cart }) })
      .catch(()   => { if (live) dispatch({ type: 'SET_CART', v: { userId: state.userId, items: [], status: 'ACTIVE' } }) })
    return () => { live = false }
  }, [state.userId])

  const toast = useCallback((type, message) => {
    clearTimeout(toastTimer.current)
    dispatch({ type: 'SET_TOAST', v: { type, message, key: Date.now() } })
    toastTimer.current = setTimeout(() => dispatch({ type: 'SET_TOAST', v: null }), 3600)
  }, [])

  const setUserId = useCallback((id) => {
    dispatch({ type: 'SET_USER', v: (id || '').trim() || 'user1' })
  }, [])

  const openCart  = useCallback(() => dispatch({ type: 'OPEN_CART' }),   [])
  const closeCart = useCallback(() => dispatch({ type: 'CLOSE_CART' }),  [])
  const toggleCart = useCallback(() => dispatch({ type: 'TOGGLE_CART' }), [])

  // Returns void; throws on error so callers can reset local loading
  const addToCart = useCallback(async (productId, quantity, productName) => {
    try {
      const cart = await api.cart.addItem(state.userId, productId, quantity)
      dispatch({ type: 'SET_CART', v: cart })
      toast('success', `"${productName}" added to cart`)
      dispatch({ type: 'OPEN_CART' })
    } catch (err) {
      toast('error', err.message || 'Failed to add item')
      throw err
    }
  }, [state.userId, toast])

  const updateCartItem = useCallback(async (itemId, quantity) => {
    try {
      const cart = await api.cart.updateItem(state.userId, itemId, quantity)
      dispatch({ type: 'SET_CART', v: cart })
    } catch (err) {
      toast('error', err.message || 'Failed to update quantity')
    }
  }, [state.userId, toast])

  const removeCartItem = useCallback(async (itemId) => {
    try {
      const cart = await api.cart.removeItem(state.userId, itemId)
      dispatch({ type: 'SET_CART', v: cart })
    } catch (err) {
      toast('error', err.message || 'Failed to remove item')
    }
  }, [state.userId, toast])

  const checkout = useCallback(async () => {
    dispatch({ type: 'CART_LOADING' })
    try {
      const order = await api.orders.checkout(state.userId)
      const cart  = await api.cart.get(state.userId)
      dispatch({ type: 'SET_CART', v: cart })
      dispatch({ type: 'CLOSE_CART' })
      toast('success', `Order #${order.id} placed!`)
      return order
    } catch (err) {
      dispatch({ type: 'SET_CART', v: state.cart })
      toast('error', err.message || 'Checkout failed')
      throw err
    }
  }, [state.userId, state.cart, toast])

  const cartCount = state.cart?.items?.reduce((n, i) => n + i.quantity, 0) ?? 0
  const cartTotal = state.cart?.items?.reduce((n, i) => n + i.unitPrice * i.quantity, 0) ?? 0

  return (
    <Ctx.Provider value={{
      ...state, cartCount, cartTotal,
      setUserId, openCart, closeCart, toggleCart,
      addToCart, updateCartItem, removeCartItem, checkout,
      toast,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}
