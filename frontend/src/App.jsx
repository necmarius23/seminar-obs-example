import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import CartDrawer from './components/CartDrawer'
import Toast from './components/Toast'
import CatalogPage from './pages/CatalogPage'
import ProductDetailPage from './pages/ProductDetailPage'
import OrdersPage from './pages/OrdersPage'

export default function App() {
  return (
    <>
      <Header />
      <CartDrawer />
      <Toast />
      <Routes>
        <Route path="/"               element={<CatalogPage />} />
        <Route path="/products/:id"   element={<ProductDetailPage />} />
        <Route path="/orders"         element={<OrdersPage />} />
        <Route path="*"               element={<CatalogPage />} />
      </Routes>
    </>
  )
}
