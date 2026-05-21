import React, { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function Header() {
  const { userId, setUserId, cartCount, toggleCart } = useApp()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [draftId, setDraftId] = useState(userId)
  const popoverRef = useRef(null)
  const inputRef   = useRef(null)

  // Sync draft when userId changes externally
  useEffect(() => { setDraftId(userId) }, [userId])

  // Close on outside click
  useEffect(() => {
    if (!popoverOpen) return
    const handler = (e) => {
      if (!popoverRef.current?.contains(e.target)) setPopoverOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverOpen])

  // Focus input when popover opens
  useEffect(() => {
    if (popoverOpen) inputRef.current?.focus()
  }, [popoverOpen])

  const confirm = () => {
    setUserId(draftId)
    setPopoverOpen(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') confirm()
    if (e.key === 'Escape') setPopoverOpen(false)
  }

  return (
    <header className="header">
      {/* Logo */}
      <NavLink to="/" className="header__logo">
        VAULT
        <span className="header__logo-dot" aria-hidden />
      </NavLink>

      {/* Nav */}
      <nav className="header__nav" aria-label="Main">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `header__nav-link${isActive ? ' active' : ''}`}
        >
          Shop
        </NavLink>
        <NavLink
          to="/orders"
          className={({ isActive }) => `header__nav-link${isActive ? ' active' : ''}`}
        >
          Orders
        </NavLink>
      </nav>

      {/* Right controls */}
      <div className="header__right">
        {/* User selector */}
        <div className="user-selector" ref={popoverRef}>
          <button
            className="user-chip"
            onClick={() => setPopoverOpen((o) => !o)}
            aria-expanded={popoverOpen}
            aria-label="Switch user"
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userId}
            </span>
            <span className="user-chip__caret">▾</span>
          </button>

          {popoverOpen && (
            <div className="user-popover" role="dialog" aria-label="User selector">
              <p className="user-popover__label">Active user</p>
              <input
                ref={inputRef}
                className="user-popover__input"
                value={draftId}
                onChange={(e) => setDraftId(e.target.value)}
                onKeyDown={handleKey}
                placeholder="e.g. user1"
                spellCheck={false}
              />
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={confirm}>
                Switch
              </button>
              <p className="user-popover__hint">
                No auth — just a user identifier for the cart & orders.
              </p>
            </div>
          )}
        </div>

        {/* Cart */}
        <button className="cart-btn" onClick={toggleCart} aria-label={`Cart, ${cartCount} items`}>
          <span className="cart-btn__icon" aria-hidden>🛒</span>
          {cartCount > 0 && (
            <span className="cart-badge" aria-live="polite">{cartCount}</span>
          )}
        </button>
      </div>
    </header>
  )
}
