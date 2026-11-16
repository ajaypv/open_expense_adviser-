/** How a credit card is drawn: one of thirteen looks, from the Untitled UI credit card set (MIT). Kept here, not with the drawing, because a card's look is saved with it. */
export const CARD_STYLES = [
  'brand-dark',
  'brand-light',
  'gray-dark',
  'gray-light',
  'gradient-strip',
  'salmon-strip',
  'gray-strip',
  'gradient-strip-vertical',
  'salmon-strip-vertical',
  'gray-strip-vertical',
  'transparent',
  'transparent-gradient',
  'transparent-strip',
] as const

export type CardStyle = (typeof CARD_STYLES)[number]

export const isCardStyle = (value: unknown): value is CardStyle => typeof value === 'string' && (CARD_STYLES as readonly string[]).includes(value)

/** The looks that stand on their own on any page. The see-through ones need something behind them, so they are only chosen, never given. */
const GIVEN: CardStyle[] = ['brand-dark', 'gray-dark', 'gradient-strip', 'salmon-strip', 'brand-light', 'gradient-strip-vertical', 'gray-light', 'salmon-strip-vertical']

/** The look a card has until it is given one: a different one for each, the same one each time. */
export const defaultCardStyle = (id: number): CardStyle => GIVEN[Math.abs(Math.trunc(id)) % GIVEN.length]

/** The looks offered when choosing: the see-through ones are left out, since they have nothing behind them here to show against. */
export const CARD_CHOICES: CardStyle[] = CARD_STYLES.filter((s) => !s.startsWith('transparent'))

/** A look's name, in words: "Brand dark". */
export const cardStyleName = (style: CardStyle): string => style.charAt(0).toUpperCase() + style.slice(1).replace(/-/g, ' ')
