import { localDateString, MAX_AMOUNT_MINOR, toMinor } from '../db/money'
import { INCOME_CATEGORY, type DefaultCategoryName } from '../db/defaultCategories'

export interface ParsedExpense {
  /** 'income' when the text describes money received ("salary 80k", "received 500 from Rahul"). */
  kind: 'expense' | 'income'
  amountMinor: number
  merchant: string
  categoryName: DefaultCategoryName
  date: string
  paymentMethod: 'Cash' | 'Card' | 'Online' | ''
  /** Only set when the text named one ("$5", "12 usd", "₹99"); otherwise it is the person's main currency. */
  currency?: string
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_ABBREVIATIONS = ['sun', 'mon', 'tues', 'tue', 'wed', 'thurs', 'thur', 'thu', 'fri', 'sat']
const MONTH_NAMES = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const FILLER = new Set([
  'spent', 'spend', 'paid', 'pay', 'bought', 'buy', 'got', 'i', 'just', 'for', 'on', 'at', 'to',
  'from', 'using', 'via', 'with', 'by', 'the', 'a', 'an', 'of', 'my', 'me', 'and', 'rs', 'inr',
  'rupees', 'rupee', 'usd', 'dollars', 'dollar', 'eur', 'euro', 'euros', 'gbp', 'pounds', 'sent',
])

/**
 * Words that mean money came in. "paid" or "sent" alone mean money went out, so only the
 * phrases "got paid", "paid me" and "sent me" count, and "credit" is left for "credit card".
 */
const INCOME_PATTERN =
  /\b(received|receive|salary|income|credited|refund|refunded|cashback|bonus|earned|deposited|deposit|interest|reimbursement|got paid|paid me|sent me)\b/

/** Clear phrases for money arriving, whatever else is in the line. */
const INCOME_PHRASE = /\b(got paid|paid me|sent me|gave me)\b|\bgot\b.*\bfrom\b/

/**
 * Income words that really describe money going out: someone's wages, tax, a deposit, or "paid interest".
 * Checked before the income words, so "maid salary 8000" is spending and "salary 80,000" is not.
 */
const PAYOUT_PATTERN =
  /\b(maid|driver|cook|staff|employee|nanny|servant|worker|watchman|gardener)\s+salary\b|\bsalary\s+(to|for)\b|\bincome\s+tax\b|\bsecurity\s+deposit\b|\b(paid|pay|paying)\b.*\b(interest|deposit|salary|bonus)\b/

/** Income words that carry no meaning beyond "money came in", dropped from the merchant name. */
const INCOME_GENERIC = new Set(['received', 'receive', 'credited', 'deposited', 'deposit', 'me', 'earned', 'sent'])

const PAYMENT: Record<string, ParsedExpense['paymentMethod']> = {
  cash: 'Cash',
  card: 'Card',
  credit: 'Card',
  debit: 'Card',
  upi: 'Online',
  gpay: 'Online',
  phonepe: 'Online',
  paytm: 'Online',
  netbanking: 'Online',
  online: 'Online',
}

/** First matching rule wins; keep specific merchants before generic words. */
const CATEGORY_KEYWORDS: [DefaultCategoryName, string[]][] = [
  ['Rent & Housing', ['rent', 'maintenance', 'mortgage', 'housing']],
  ['Groceries', ['grocery', 'groceries', 'bigbasket', 'blinkit', 'zepto', 'instamart', 'supermarket', 'vegetables', 'fruits', 'milk', 'walmart', 'costco']],
  ['Food & Dining', ['swiggy', 'zomato', 'restaurant', 'lunch', 'dinner', 'breakfast', 'coffee', 'cafe', 'starbucks', 'pizza', 'burger', 'snacks', 'food', 'mcdonalds', 'tea', 'biryani']],
  ['Transport', ['uber', 'ola', 'rapido', 'fuel', 'petrol', 'diesel', 'metro', 'bus', 'cab', 'taxi', 'auto', 'parking', 'toll', 'train', 'station', 'pump']],
  ['Bills & Utilities', ['electricity', 'water', 'wifi', 'internet', 'broadband', 'recharge', 'bill', 'jio', 'airtel', 'gas', 'insurance', 'phone']],
  ['Health', ['pharmacy', 'doctor', 'medicine', 'medicines', 'hospital', 'clinic', 'gym', 'dentist', 'lab']],
  ['Entertainment & Travel', ['netflix', 'spotify', 'prime', 'hotstar', 'movie', 'movies', 'cinema', 'concert', 'flight', 'hotel', 'trip', 'airbnb', 'game', 'games']],
  ['Shopping', ['amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'shopping', 'mall', 'electronics']],
]

// ---- Dates ---------------------------------------------------------------------------------------

/** A real calendar day, or null for something like 31 February. */
function realDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month, day)
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3))

/**
 * Finds a date in the text and takes it out. Understands "yesterday", "3 days ago", "last friday", a bare
 * "monday", "5th", "28 oct", "oct 5", "12/03", "01/10/2026" and "2026-10-01". Day-first, as people write it
 * in India and most of the world. A date without a year is the most recent one that isn't in the future.
 * Something that isn't a real day (31 February) is dropped from the words and today is kept.
 */
function extractDate(text: string, today: Date): { date: string; rest: string; explicit: boolean } {
  let s = ` ${text.toLowerCase().replace(/[,;!?]+(?=\s|$)/g, ' ')} `
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let found: Date | null = null
  let explicit = false

  /** Takes the match out of the text; the first rule that matches decides the date. */
  const take = (re: RegExp, resolve: (m: RegExpMatchArray) => Date | null): boolean => {
    const m = s.match(re)
    if (!m) return false
    s = s.replace(m[0], ' ')
    found = resolve(m)
    explicit = found !== null
    return true
  }
  const shifted = (days: number) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + days)
  /** This year's date, or last year's if that is still ahead of today. */
  const recent = (month: number, day: number): Date | null => {
    const d = realDate(start.getFullYear(), month, day)
    if (!d) return null
    return d > start ? realDate(start.getFullYear() - 1, month, day) : d
  }
  const withYear = (year: string | undefined, month: number, day: number) =>
    year ? realDate(year.length === 2 ? 2000 + Number(year) : Number(year), month, day) : recent(month, day)

  const rules: [RegExp, (m: RegExpMatchArray) => Date | null][] = [
    [/\s(\d{4})-(\d{1,2})-(\d{1,2})\s/, (m) => realDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]))],
    [/\s(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?\s/, (m) => {
      let day = Number(m[1])
      let month = Number(m[2])
      if (month > 12 && day <= 12) [day, month] = [month, day]
      return withYear(m[3], month - 1, day)
    }],
    [new RegExp(`\\s(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES})\\.?(?:\\s+(\\d{4}))?\\s`), (m) =>
      withYear(m[3], monthIndex(m[2]), Number(m[1])),
    ],
    [new RegExp(`\\s(?:on\\s+)?(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\s`), (m) =>
      withYear(m[3], monthIndex(m[1]), Number(m[2])),
    ],
    [/\s(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\s/, (m) => {
      const day = Number(m[1])
      const thisMonth = realDate(start.getFullYear(), start.getMonth(), day)
      if (thisMonth && thisMonth <= start) return thisMonth
      const before = new Date(start.getFullYear(), start.getMonth() - 1, 1)
      return realDate(before.getFullYear(), before.getMonth(), day)
    }],
    [/\s(\d{1,3})\s+days?\s+(?:ago|back)\s/, (m) => shifted(-Number(m[1]))],
    [/\sday before yesterday\s/, () => shifted(-2)],
    [/\s(?:yesterday|yest|yday|last night)\s/, () => shifted(-1)],
    [/\s(?:today|this morning|this afternoon|this evening|tonight|tonite)\s/, () => start],
    [/\stomorrow\s/, () => shifted(1)],
    [/\slast week\s/, () => shifted(-7)],
    [/\slast month\s/, () => {
      const y = start.getFullYear()
      const m = start.getMonth() - 1
      const first = new Date(y, m, 1)
      return new Date(first.getFullYear(), first.getMonth(), Math.min(start.getDate(), daysInMonth(first.getFullYear(), first.getMonth())))
    }],
    [new RegExp(`\\s(?:(last)\\s+|on\\s+)?(${[...WEEKDAYS, ...WEEKDAY_ABBREVIATIONS].join('|')})\\s`), (m) => {
      const index = WEEKDAYS.findIndex((w) => w === m[2] || w.startsWith(m[2]))
      let diff = (start.getDay() - index + 7) % 7
      if (m[1] && diff === 0) diff = 7
      return shifted(-diff)
    }]
  ]

  for (const [re, resolve] of rules) if (take(re, resolve)) break
  return { date: localDateString(found ?? start), rest: s.trim(), explicit }
}

// ---- Amounts -------------------------------------------------------------------------------------

/** The ways of writing a number people use: 1200, 1,200, 12,34,567, .5, and 1,5 for one and a half. */
function parseNumber(raw: string): number | null {
  if (/^\d+(\.\d+)?$|^\.\d+$/.test(raw)) return Number(raw)
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) return Number(raw.replace(/,/g, ''))
  if (/^\d{1,2}(,\d{2})+,\d{3}(\.\d+)?$/.test(raw)) return Number(raw.replace(/,/g, ''))
  if (/^\d+,\d{1,2}$/.test(raw)) return Number(raw.replace(',', '.'))
  return null
}

const MULTIPLIER: Record<string, number> = {
  k: 1e3,
  l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5,
  cr: 1e7, crore: 1e7, crores: 1e7,
  m: 1e6, mn: 1e6, million: 1e6,
}

const CURRENCY_OF: Record<string, string> = {
  '₹': 'INR', rs: 'INR', 'rs.': 'INR', inr: 'INR', rupee: 'INR', rupees: 'INR', '/-': 'INR',
  $: 'USD', usd: 'USD', dollar: 'USD', dollars: 'USD',
  '€': 'EUR', eur: 'EUR', euro: 'EUR', euros: 'EUR',
  '£': 'GBP', gbp: 'GBP', pound: 'GBP', pounds: 'GBP',
}

/** Words that stay attached to a number ("450rs", "10lac"); any other letters after digits start a new word. */
const NUMBER_WORDS = new Set(['rs', 'inr', 'usd', 'eur', 'gbp', 'lac', 'lacs', 'lakh', 'lakhs', 'cr', 'crore', 'crores', 'mn', 'million'])

const NUM = String.raw`\d+(?:,\d+)*(?:\.\d+)?|\.\d+`
const AMOUNT = new RegExp(
  String.raw`(^|[^\w.])(?:(rs\.?|inr|usd|eur|gbp|[₹$€£])\s*)?(${NUM})` +
    String.raw`(?:(k|l|m)(?![a-z0-9])|\s*(k|lacs?|lakhs?|cr|crores?|mn|million)(?![a-z0-9]))?` +
    String.raw`(?:\s*(/-|rs\.?|inr|usd|eur|gbp|dollars?|euros?|pounds?|rupees?)(?![a-z0-9])(?!\s*\.?\d))?`,
  'gi',
)

interface Found {
  /** In minor units. */
  minor: number
  currency?: string
  /** Written with a currency mark or a unit (₹300, rs 2500, 18k), which says it is the price. */
  marked: boolean
  from: number
  to: number
}

/**
 * Finds the amount in the text: the number carrying a currency mark if there is one, otherwise the biggest
 * number, so "2 coffees 100" and "iphone 12 pro 79900" take the price and not the quantity or the model.
 * Numbers that are too big to store or round to nothing are not amounts.
 */
function findAmount(text: string): Found | null {
  const prepared = text.replace(/(\d)([a-z]{2,})/gi, (m, digit: string, word: string) => (NUMBER_WORDS.has(word.toLowerCase()) ? m : `${digit} ${word}`))
  const found: Found[] = []
  for (const m of prepared.matchAll(AMOUNT)) {
    const base = parseNumber(m[3])
    if (base === null) continue
    const unit = (m[4] ?? m[5])?.toLowerCase()
    const minor = toMinor(base * (unit ? (MULTIPLIER[unit] ?? 1) : 1))
    if (!Number.isSafeInteger(minor) || minor < 1 || minor > MAX_AMOUNT_MINOR) continue
    const mark = (m[2] ?? m[6])?.toLowerCase()
    const from = (m.index ?? 0) + m[1].length
    found.push({ minor, currency: mark ? CURRENCY_OF[mark] : undefined, marked: Boolean(mark || unit), from, to: (m.index ?? 0) + m[0].length })
  }
  if (found.length === 0) return null
  const marked = found.find((f) => f.marked)
  if (marked) return marked
  return found.reduce((best, f) => (f.minor > best.minor ? f : best))
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

type Piece = { parsed: ParsedExpense; explicitDate: boolean }

function parseOne(text: string, today: Date): Piece | null {
  const { date, rest, explicit } = extractDate(text.trim(), today)
  const amount = findAmount(rest)
  if (!amount) return null
  const remaining = `${rest.slice(0, amount.from)} ${rest.slice(amount.to)}`
  const kind: ParsedExpense['kind'] = INCOME_PHRASE.test(remaining) || (!PAYOUT_PATTERN.test(remaining) && INCOME_PATTERN.test(remaining)) ? 'income' : 'expense'
  const tokens = remaining
    .replace(/[₹$€£]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/[,;!?]+$/, '').replace(/\.$/, ''))
    .filter(Boolean)

  let paymentMethod: ParsedExpense['paymentMethod'] = ''
  const words: string[] = []
  for (const t of tokens) {
    if (PAYMENT[t]) {
      paymentMethod = PAYMENT[t]
      continue
    }
    if (FILLER.has(t) || (kind === 'income' && INCOME_GENERIC.has(t))) continue
    words.push(t)
  }

  const merchant = titleCase(words.join(' ').replace(/[^\w&'. -]/g, '').trim())
  const haystack = new Set(words.flatMap((w) => w.split(/[^a-z0-9]+/)))
  const categoryName: DefaultCategoryName =
    kind === 'income'
      ? INCOME_CATEGORY
      : (CATEGORY_KEYWORDS.find(([, keys]) => keys.some((k) => haystack.has(k)))?.[0] ?? 'Other')

  const parsed: ParsedExpense = { kind, amountMinor: amount.minor, merchant, categoryName, date, paymentMethod }
  if (amount.currency) parsed.currency = amount.currency
  return { parsed, explicitDate: explicit }
}

/**
 * Offline fallback for "spent 450 on swiggy yesterday", "18k rent", "coffee 120", "2 lakh rent".
 * Returns null when no amount is found. The AI agent replaces this when a key is set.
 */
export function parseExpense(text: string, today = new Date()): ParsedExpense | null {
  return parseOne(text, today)?.parsed ?? null
}

/**
 * Entries are separated by semicolons, new lines, or commas that are not inside a number, so
 * "1,200 rent" stays one amount while "coffee 120, lunch 340" becomes two entries.
 */
const SEPARATOR = /[;\n]+|,(?!\d)/

/**
 * Parses one or several entries typed together ("coffee 120, lunch 340, auto 80" or "coffee 120 and lunch
 * 340"). If any piece has no amount the text is treated as a single entry instead, so a stray comma can't
 * lose anything. A date typed at the end ("..., lunch 340 yesterday") covers every entry that named none.
 */
export function parseMany(text: string, today = new Date()): ParsedExpense[] {
  const pieces = text
    .split(SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => {
      const parts = p.split(/\s+and\s+/i)
      return parts.length > 1 && parts.every((part) => parseOne(part, today)) ? parts : [p]
    })
  if (pieces.length > 1) {
    const parsed = pieces.map((p) => parseOne(p, today))
    if (parsed.every((p): p is Piece => p !== null)) {
      const last = parsed[parsed.length - 1]
      const named = parsed.filter((p) => p.explicitDate)
      if (last.explicitDate && named.length === 1) return parsed.map((p) => ({ ...p.parsed, date: last.parsed.date }))
      return parsed.map((p) => p.parsed)
    }
  }
  const single = parseExpense(text, today)
  return single ? [single] : []
}

let dayFormat: Intl.DateTimeFormat | undefined
let dayYearFormat: Intl.DateTimeFormat | undefined

/** How a message names the day an entry was filed under: nothing for today, then "yesterday", "tomorrow" or the date. */
export function describeDay(date: string, today = new Date()): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((day.getTime() - start.getTime()) / 86_400_000)
  if (diff === 0) return ''
  if (diff === -1) return 'yesterday'
  if (diff === 1) return 'tomorrow'
  if (y !== start.getFullYear()) return (dayYearFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })).format(day)
  return (dayFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(day)
}
