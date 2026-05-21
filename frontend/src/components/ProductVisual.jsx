import React from 'react'

const CATEGORY_CONFIG = {
  Electronics: {
    bg: 'radial-gradient(ellipse at 65% 35%, #1E3860 0%, #0D1A34 55%, #080C1A 100%)',
    glow: '#3A78E8',
    glowRgb: '58, 120, 232',
  },
  Furniture: {
    bg: 'radial-gradient(ellipse at 65% 35%, #1A3C28 0%, #0C1E15 55%, #060E0A 100%)',
    glow: '#30A866',
    glowRgb: '48, 168, 102',
  },
  Accessories: {
    bg: 'radial-gradient(ellipse at 65% 35%, #34185A 0%, #1A0D30 55%, #0A0618 100%)',
    glow: '#8855E8',
    glowRgb: '136, 85, 232',
  },
  Stationery: {
    bg: 'radial-gradient(ellipse at 65% 35%, #402E0C 0%, #22180A 55%, #0E0C04 100%)',
    glow: '#C89028',
    glowRgb: '200, 144, 40',
  },
}

const FALLBACK = {
  bg: 'radial-gradient(ellipse at 65% 35%, #202020 0%, #0E0E0E 100%)',
  glow: '#888',
  glowRgb: '136, 136, 136',
}

function getEmoji(name = '', category = '') {
  const n = name.toLowerCase()
  if (n.includes('laptop') || n.includes('macbook')) return '💻'
  if (n.includes('keyboard')) return '⌨️'
  if (n.includes('mouse')) return '🖱️'
  if (n.includes('monitor') || n.includes('display') || n.includes('screen')) return '🖥️'
  if (n.includes('webcam') || n.includes('camera')) return '📷'
  if (n.includes('hub') || n.includes('usb-c') || n.includes('adapter')) return '🔌'
  if (n.includes('chair')) return '🪑'
  if (n.includes('desk') || n.includes('table')) return '🗂️'
  if (n.includes('lamp') || n.includes('light')) return '💡'
  if (n.includes('notebook') || n.includes('journal') || n.includes('book')) return '📓'
  if (n.includes('headphone') || n.includes('earphone') || n.includes('audio')) return '🎧'
  if (n.includes('phone') || n.includes('mobile')) return '📱'
  if (n.includes('tablet') || n.includes('ipad')) return '📲'
  if (n.includes('printer')) return '🖨️'
  if (n.includes('cable') || n.includes('cord') || n.includes('wire')) return '🔋'
  const cat = category.toLowerCase()
  if (cat === 'electronics') return '⚡'
  if (cat === 'furniture')   return '🏠'
  if (cat === 'accessories') return '✨'
  if (cat === 'stationery')  return '✏️'
  return '📦'
}

export default function ProductVisual({ name, category, size = 'md' }) {
  const cfg = CATEGORY_CONFIG[category] || FALLBACK
  const emoji = getEmoji(name, category)
  const iconSize = size === 'lg' ? '80px' : '62px'

  return (
    <div
      className="product-visual"
      style={{ height: size === 'lg' ? '100%' : undefined }}
    >
      {/* Gradient background */}
      <div
        className="product-visual__glow"
        style={{ background: cfg.bg }}
      />
      {/* Subtle noise texture overlay */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle at 50% 50%, rgba(${cfg.glowRgb}, 0.18) 0%, transparent 65%)`,
          zIndex: 0,
        }}
      />
      {/* Icon */}
      <span
        className="product-visual__icon"
        style={{
          fontSize: iconSize,
          filter: `drop-shadow(0 0 18px rgba(${cfg.glowRgb}, 0.65))
                   drop-shadow(0 0 5px rgba(${cfg.glowRgb}, 0.35))`,
        }}
        aria-hidden
      >
        {emoji}
      </span>
    </div>
  )
}
