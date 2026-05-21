import React from 'react'

const STATUS = {
  PENDING:   { label: 'Pending',   color: '#9E8E80', bg: 'rgba(158,142,128,0.12)' },
  CONFIRMED: { label: 'Confirmed', color: '#4A88E8', bg: 'rgba(74,136,232,0.12)'  },
  SHIPPED:   { label: 'Shipped',   color: '#D8A020', bg: 'rgba(216,160,32,0.12)'  },
  DELIVERED: { label: 'Delivered', color: '#2EC880', bg: 'rgba(46,200,128,0.12)'  },
  CANCELLED: { label: 'Cancelled', color: '#E04040', bg: 'rgba(224,64,64,0.12)'   },
}

export default function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.PENDING
  return (
    <span
      className="status-badge"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30` }}
    >
      <span className="status-badge__dot" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  )
}
