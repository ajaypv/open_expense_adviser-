const PATHS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  bars: 'M5 20v-9M12 20V4M19 20v-6',
  sliders: 'M4 7h9m4 0h3M4 17h3m4 0h9M15 4v6M9 14v6',
  plus: 'M12 5v14M5 12h14',
  send: 'M12 19V5M6 11l6-6 6 6',
  chevLeft: 'M15 6l-6 6 6 6',
  chevRight: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  warn: 'M12 4 3 20h18zM12 10v4M12 17h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  eye: 'M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zM12 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5z',
  eyeOff: 'M4 4l16 16M9.9 5.7A9.8 9.8 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-3 3.8M6.3 7.2A17 17 0 0 0 2 12s3.5 6.5 10 6.5c1.5 0 2.8-.3 4-.8M10 10a2.75 2.75 0 0 0 3.9 3.9',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  trash: 'M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  chevDown: 'M6 9l6 6 6-6',
  pin: 'M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  monitor: 'M4 5h16v11H4zM9 20h6M12 16v4',
  arrowUp:'M12 19V6M6 12l6-6 6 6',
  arrowDown: 'M12 5v13M6 12l6 6 6-6',
  flag: 'M5 21V3.5M5 4.5c3-1.8 5.5 1.8 9 0 2-1.2 3.7-1.2 5 0v9c-1.3-1.2-3-1.2-5 0-3.5 1.8-6-1.8-9 0',
  search:'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.2-4.2',
  // What a category looks like, shown in the pop-up when something is added to it.
  utensils: 'M6 3v6a3 3 0 0 0 6 0V3M9 12v9M17 21V3c-2.5 1-4 4-4 8h4',
  cart: 'M3 4h2.4l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8a1.5 1.5 0 0 0 1.5-1.1L20.4 8H6.1M9.5 20h.01M17 20h.01',
  car: 'M5 17H3.5v-4a2 2 0 0 1 1.3-1.9L6.5 10 8 6.5h8l1.5 3.5 1.7 1.1a2 2 0 0 1 1.3 1.9v4H19M9.5 17h5M7.5 15.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM16.5 15.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  bolt: 'M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z',
  heart: 'M12 20s-7.5-4.6-7.5-9.7A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
  ticket: 'M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2.5 2.5 0 0 0 0-5zM14 5v14',
  bag: 'M5.5 8h13L19.5 20h-15L5.5 8zM9 8V6.5a3 3 0 0 1 6 0V8',
  tag: 'M3 12.5V4h8.5l9.5 9.5-8.5 8.5L3 12.5zM7.5 8.5h.01',
  // Regular payments, each its own: a bill is a receipt, a mobile recharge a phone being topped up, an EMI a calendar of instalments,
  // an autopay a circling arrow with a tick.
  receipt: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9.5 8h5M9.5 12h5M9.5 15.5h2.5',
  recharge: 'M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM12 8v5M9.5 10.5h5M11 18.5h2',
  emi: 'M4 6h16v14H4zM4 10.5h16M8 3.5v4M16 3.5v4M8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17h.01M12 17h.01',
  autopay: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4M9 12l2.2 2.2L15.5 10',
  // The Settings list: a bank for money, a shield with a keyhole for privacy, a palette for appearance.
  bank: 'M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3.5 20.5h17',
  shield: 'M12 3.5 5 6v5.5c0 4.2 2.9 7.2 7 9 4.1-1.8 7-4.8 7-9V6l-7-2.5zM12 9.5a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM12 12.3v2.4',
  palette: 'M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.5-1-2.6 0-.9.7-1.5 1.6-1.5H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.6 16.7 3.5 12 3.5zM7.5 11h.01M9.5 7.5h.01M14 7.5h.01',
  card: 'M4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9A1.5 1.5 0 0 1 4.5 6zM3 10h18M6.5 14.5h3.5',
  person: 'M12 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2-2.2-.8 2.2-.8L19 16z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22, weight = 1.75 }: { name: IconName; size?: number; weight?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
