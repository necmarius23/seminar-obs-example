import React from 'react'
import { useApp } from '../context/AppContext'

export default function Toast() {
  const { toast } = useApp()
  if (!toast) return null

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className={`toast toast--${toast.type}`} key={toast.key}>
        <span className="toast__dot" aria-hidden />
        {toast.message}
      </div>
    </div>
  )
}
