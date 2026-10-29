import { localDateString, toMinor } from '../db/money'
import { INCOME_CATEGORY, type DefaultCategoryName } from '../db/defaultCategories'

export interface ParsedExpense {
  /** 'income' when the text describes money received ("salary 80k", "received 500 from Rahul"). */
  kind: 'expense' | 'income'
  amountMinor: number
  merchant: string
  categoryName: DefaultCategoryName
  date: string
  paymentMethod: 'Cash' | 'Card' | 'Online' | ''
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const FILLER = new Set([
  'spent', 'spend', 'paid', 'pay', 'bought', 'buy', 'got', 'i', 'just', 'for', 'on', 'at', 'to',
  'from', 'using', 'via', 'with', 'by', 'the', 'a', 'an', 'of', 'my', 'me', 'and', 'rs', 'inr',
  'rupees', 'rupee', 'usd', 'dollars', 'dollar', 'eur', 'euro', 'euros', 'gbp', 'pounds',
])

/**
 * Words that mean money came in. "paid" or "sent" alone mean money went out, so only the
 * phrases "got paid", "paid me" and "sent me" count, and "credit" is left for "credit card".
 */
const INCOME_PATTERN =
  /\b(received|receive|salary|income|credited|refund|refunded|cashback|bonus|earned|deposited|deposit|interest|reimbursement|got paid|paid me|sent me)\b/

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
  ['Transport', ['uber', 'ola', 'rapido', 'fuel', 'petrol', 'diesel', 'metro', 'bus', 'cab', 'taxi', 'auto', 'parking', 'toll', 'train']],
  ['Bills & Utilities', ['electricity', 'water', 'wifi', 'internet', 'broadband', 'recharge', 'bill', 'jio', 'airtel', 'gas', 'insurance', 'phone']],
  ['Health', ['pharmacy', 'doctor', 'medicine', 'medicines', 'hospital', 'clinic', 'gym', 'dentist', 'lab']],
  ['Entertainment & Travel', ['netflix', 'spotify', 'prime', 'hotstar', 'movie', 'movies', 'cinema', 'concert', 'flight', 'hotel', 'trip', 'airbnb', 'game', 'games']],
  ['Shopping', ['amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'shopping', 'mall', 'electronics']],
]

function extractDate(text: string, today: Date): { date: string; rest: string } {
  let s = ` ${text.toLowerCase()} `
  let offset = 0
  const ago = s.match(/\s(\d+)\s+days?\s+ago\s/)
  const weekday = s.match(new RegExp(`\\s(?:(last)\\s+|on\\s+)(${WEEKDAYS.join('|')})\\s`))
  if (ago) {
    offset = -Number(ago[1])
    s = s.replace(ago[0], ' ')
  } else if (s.includes(' day before yesterday ')) {
    offset = -2
    s = s.replace(' day before yesterday ', ' ')
  } else if (s.includes(' yesterday ')) {
    offset = -1
    s = s.replace(' yesterday ', ' ')
  } else if (s.includes(' today ')) {
    s = s.replace(' today ', ' ')
  } else if (weekday) {
    let diff = (today.getDay() - WEEKDAYS.indexOf(weekday[2]) + 7) % 7
    if (weekday[1] && diff === 0) diff = 7
    offset = -diff
    s = s.replace(weekday[0], ' ')
  }
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
  return { date: localDateString(d), rest: s.trim() }
}

function parseAmountToken(token: string): number | null {
  const m = token.match(/^(\d[\d,]*(?:\.\d+)?)(k)?$/i)
  if (!m) return null
  const value = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)
  return Number.isFinite(value) && value > 0 ? value : null
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * Offline fallback for "spent 450 on swiggy yesterday", "18k rent", "coffee 120".
 * Returns null when no amount is found. The AI agent replaces this when a key is set.
 */
export function parseExpense(text: string, today = new Date()): ParsedExpense | null {
  const { date, rest } = extractDate(text.trim(), today)
  const kind: ParsedExpense['kind'] = INCOME_PATTERN.test(rest) ? 'income' : 'expense'
  const tokens = rest
    .replace(/[₹$€£]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/[,;!?]+$/, '').replace(/\.$/, ''))
    .filter(Boolean)

  const amountIndex = tokens.findIndex((t) => parseAmountToken(t) !== null)
  if (amountIndex === -1) return null
  const amount = parseAmountToken(tokens[amountIndex])!

  let paymentMethod: ParsedExpense['paymentMethod'] = ''
  const words: string[] = []
  tokens.forEach((t, i) => {
    if (i === amountIndex) return
    if (PAYMENT[t]) {
      paymentMethod = PAYMENT[t]
      return
    }
    if (FILLER.has(t) || (kind === 'income' && INCOME_GENERIC.has(t))) return
    words.push(t)
  })

  const merchant = titleCase(words.join(' ').replace(/[^\w&'. -]/g, '').trim())
  const haystack = new Set(words.flatMap((w) => w.split(/[^a-z0-9]+/)))
  const categoryName: DefaultCategoryName =
    kind === 'income'
      ? INCOME_CATEGORY
      : (CATEGORY_KEYWORDS.find(([, keys]) => keys.some((k) => haystack.has(k)))?.[0] ?? 'Other')

  return { kind, amountMinor: toMinor(amount), merchant, categoryName, date, paymentMethod }
}
