import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { type CardStyle } from '../db/cardStyles'

/**
 * A credit card, drawn: the look of Untitled UI's free credit card component (MIT License, Copyright (c) 2025 Untitled UI,
 * https://github.com/untitleduico/react), brought into this app with its own colours and without the network mark. The card is
 * designed at 316 by 190 and scaled to the width it is given, so its text scales with it. Its brand colours are the theme's own accent,
 * so a card takes the look of whichever colour theme is chosen.
 *
 * Nothing on it is a card number: there is none to show. The issuer's place is the card's name, the cardholder's place says
 * what the card is doing ("You owe"), the expiry's place says when the bill is due, and the number's place holds the amount owed.
 * It is a picture; the text it holds is said again, in words, beside it, so it is hidden from a screen reader.
 */

const ROUND = 'before:pointer-events-none before:absolute before:inset-0 before:z-1 before:rounded-[inherit] before:mask-linear-135 before:mask-linear-to-white/20 before:ring-1 before:ring-inset'
const LIGHT_RING = `${ROUND} before:ring-black/10`
const SHEEN_RING = `${ROUND} before:ring-white/30`
const GLASS = 'bg-linear-to-br from-white/30 to-transparent backdrop-blur-[6px]'

interface Look {
  root: string
  /** A background that needs the theme's own colour, which a class cannot say. */
  background?: string
  company: string
  footerText: string
  paypass: string
  chip: string
}

const WHITE = { company: 'text-white', footerText: 'text-white', paypass: 'text-white', chip: 'bg-white/10' }
const DARK_TEXT = { company: 'text-neutral-700', footerText: 'text-neutral-700' }

const LOOKS: Record<CardStyle, Look> = {
  transparent: { root: `bg-black/10 ${GLASS} ${SHEEN_RING}`, ...WHITE },
  'transparent-gradient': { root: `bg-black/10 ${GLASS} ${SHEEN_RING}`, ...WHITE },
  'brand-dark': {
    root: SHEEN_RING,
    background: 'linear-gradient(to top right, color-mix(in oklab, var(--accent) 38%, #000), color-mix(in oklab, var(--accent) 72%, #000))',
    ...WHITE,
  },
  'brand-light': { root: LIGHT_RING, background: 'color-mix(in oklab, var(--accent) 16%, #fff)', ...DARK_TEXT, paypass: 'text-white', chip: 'bg-white' },
  'gray-dark': { root: `bg-linear-to-tr from-neutral-900 to-neutral-700 ${SHEEN_RING}`, ...WHITE },
  'gray-light': { root: `bg-neutral-100 ${LIGHT_RING}`, ...DARK_TEXT, paypass: 'text-neutral-400', chip: 'bg-white' },
  'transparent-strip': { root: `${GLASS} ${SHEEN_RING}`, ...WHITE },
  'gray-strip': { root: `bg-neutral-100 ${SHEEN_RING}`, company: 'text-neutral-700', footerText: 'text-white', paypass: 'text-neutral-400', chip: 'bg-white/10' },
  'gradient-strip': { root: `bg-linear-to-b from-[#A5C0EE] to-[#FBC5EC] ${SHEEN_RING}`, ...WHITE },
  'salmon-strip': { root: `bg-[#F4D9D0] ${SHEEN_RING}`, company: 'text-neutral-700', footerText: 'text-white', paypass: 'text-white', chip: 'bg-white/10' },
  'gray-strip-vertical': { root: `bg-linear-to-br from-white/30 to-transparent bg-neutral-100 ${SHEEN_RING}`, ...WHITE, paypass: 'text-neutral-400' },
  'gradient-strip-vertical': { root: `bg-linear-to-b from-[#FBC2EB] to-[#A18CD1] ${SHEEN_RING}`, ...WHITE },
  'salmon-strip-vertical': { root: `bg-[#F4D9D0] ${SHEEN_RING}`, ...WHITE },
}

const STRIP = new Set<CardStyle>(['transparent-strip', 'gray-strip', 'gradient-strip', 'salmon-strip'])
const VERTICAL = new Set<CardStyle>(['gray-strip-vertical', 'gradient-strip-vertical', 'salmon-strip-vertical'])

/** The contactless mark. */
function Contactless({ className }: { className?: string }) {
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M15.1429 1.28571C17.0236 4.54326 18.0138 8.23849 18.0138 12C18.0138 15.7615 17.0236 19.4567 15.1429 22.7143M10.4286 3.64285C11.8956 6.18374 12.6679 9.06602 12.6679 12C12.6679 14.934 11.8956 17.8162 10.4286 20.3571M5.92859 5.80713C6.98933 7.66394 7.54777 9.77022 7.54777 11.9143C7.54777 14.0583 6.98933 16.1646 5.92859 18.0214M1.42859 8.14285C2.19306 9.29983 2.59834 10.6362 2.59834 12C2.59834 13.3638 2.19306 14.7002 1.42859 15.8571"
        stroke="currentColor"
        strokeWidth="2.57143"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** The chip, where the network's mark would be: no network is claimed for a card the app knows nothing of. */
function Chip() {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" fill="none" aria-hidden="true">
      <rect x="0.75" y="0.75" width="28.5" height="20.5" rx="4.5" fill="#E8C766" stroke="#9A7A22" strokeWidth="1.5" />
      <path d="M0.75 7.5h8.5a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-8.5M29.25 7.5h-8.5a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3h8.5M12 0.75v6.75M18 0.75v6.75M12 14.5v6.75M18 14.5v6.75" stroke="#9A7A22" strokeWidth="1.2" />
    </svg>
  )
}

const WIDTH = 316
const HEIGHT = 190
/** The widest a card that fits its space is let grow. */
const MAX = 360

interface Props {
  type: CardStyle
  /** The name printed top left: the card's name. */
  company: string
  /** The small line at the bottom left, above the number: what the card is doing. */
  cardHolder?: string
  /** The small line at the bottom right: when the bill is due. */
  cardExpiration?: string
  /** The big line at the bottom: what is owed. */
  cardNumber?: string
  /** A width in pixels; or "fit" to take the width of the space it is in, up to 360. */
  width?: number | 'fit'
  className?: string
}

export function CreditCardArt({ type, company, cardHolder = '', cardExpiration = '', cardNumber = '', width = 'fit', className = '' }: Props) {
  const look = LOOKS[type]
  const outer = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState(MAX)

  // "fit": as wide as the space it is in, up to the most; measured, and measured again if the space changes.
  useEffect(() => {
    const el = outer.current
    if (width !== 'fit' || !el || typeof ResizeObserver === 'undefined') return
    const measure = () => setFit(Math.min(MAX, el.getBoundingClientRect().width || MAX))
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(el)
    return () => watcher.disconnect()
  }, [width])

  const px = width === 'fit' ? fit : width
  const scale = px / WIDTH
  const box: CSSProperties = { width: px, height: HEIGHT * scale }

  return (
    <div ref={outer} data-card-style={type} aria-hidden="true" className={`relative ${width === 'fit' ? 'mx-auto w-full' : ''} ${className}`} style={width === 'fit' ? { maxWidth: MAX, height: HEIGHT * scale } : box}>
      <div
        style={{ width: WIDTH, height: HEIGHT, transform: `scale(${scale})`, ...(look.background ? { background: look.background } : {}) }}
        className={`absolute top-0 left-0 flex origin-top-left flex-col justify-between overflow-hidden rounded-2xl p-4 ${look.root}`}
      >
        {STRIP.has(type) && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-1/2 bg-neutral-800" />}
        {VERTICAL.has(type) && <div className="pointer-events-none absolute inset-y-0 right-22 left-0 z-0 bg-neutral-800" />}
        {type === 'transparent-gradient' && (
          <div className="absolute -top-4 -left-4 grid grid-cols-2 blur-3xl">
            <div className="size-20 rounded-tl-full bg-pink-500 opacity-30" />
            <div className="size-20 rounded-tr-full bg-orange-500 opacity-50" />
            <div className="size-20 rounded-bl-full bg-blue-500 opacity-30" />
            <div className="size-20 rounded-br-full bg-green-500 opacity-30" />
          </div>
        )}

        <div className="relative flex items-start justify-between gap-3 px-1 pt-1">
          <div className={`min-w-0 truncate text-base leading-[normal] font-semibold ${look.company}`}>{company}</div>
          <Contactless className={`shrink-0 ${look.paypass}`} />
        </div>

        <div className="relative flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-end gap-1">
              <p className={`text-xs leading-snug font-semibold tracking-[0.6px] uppercase ${look.footerText}`}>{cardHolder}</p>
              <p className={`ml-auto text-right text-xs leading-[normal] font-semibold tracking-[0.6px] tabular-nums ${look.footerText}`}>{cardExpiration}</p>
            </div>
            <div className={`truncate text-xl leading-[normal] font-bold tracking-[0.5px] tabular-nums ${look.footerText}`}>
              {cardNumber}
              {/* Keeps the line's height when there is nothing on it. */}
              <span className="pointer-events-none invisible inline-block w-0 max-w-0 opacity-0">1</span>
            </div>
          </div>
          <div className={`flex h-8 w-11.5 shrink-0 items-center justify-center rounded ${look.chip}`}>
            <Chip />
          </div>
        </div>
      </div>
    </div>
  )
}
