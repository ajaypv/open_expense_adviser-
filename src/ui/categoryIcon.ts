import type { IconName } from './Icon'

/** The icon for each category the app starts with. */
const EXACT: Record<string, IconName> = {
  'food & dining': 'utensils',
  groceries: 'cart',
  transport: 'car',
  'bills & utilities': 'receipt',
  health: 'heart',
  'entertainment & travel': 'ticket',
  shopping: 'bag',
  'rent & housing': 'home',
  income: 'arrowDown',
  other: 'tag',
}

/** Words that make a loan instalment, and a mobile top-up: wherever they appear (a merchant, a category) they get their own icon. */
const EMI_WORDS = ['emi', 'loan', 'instal']
const RECHARGE_WORDS = ['recharge', 'prepaid', 'postpaid', 'dth', 'jio', 'airtel', 'vodafone', 'bsnl']

/** For a category the person made or renamed: the first icon whose words start a word in its name. */
const GUESS: [IconName, string[]][] = [
  ['emi', EMI_WORDS],
  ['recharge', RECHARGE_WORDS],
  ['utensils', ['food', 'dining', 'dine', 'eat', 'restaurant', 'cafe', 'coffee', 'lunch', 'dinner', 'snack', 'meal']],
  ['cart', ['grocer', 'supermarket', 'vegetable', 'mart']],
  ['car', ['transport', 'fuel', 'petrol', 'diesel', 'taxi', 'cab', 'metro', 'bus', 'parking', 'toll', 'car', 'bike']],
  ['bolt', ['utilit', 'electric', 'water', 'internet', 'wifi', 'gas']],
  ['receipt', ['bill', 'insurance', 'premium']],
  ['heart', ['health', 'medic', 'doctor', 'pharmacy', 'hospital', 'gym', 'fitness']],
  ['ticket', ['entertain', 'movie', 'cinema', 'travel', 'trip', 'game', 'concert']],
  ['bag', ['shop', 'cloth', 'shoe', 'fashion', 'electronics']],
  ['home', ['rent', 'housing', 'house', 'home', 'mortgage']],
  ['arrowDown', ['income', 'salary']],
]

/** The EMI or recharge icon when a name (of a merchant, a payment) says so, otherwise nothing. */
export function nameIcon(name: string | undefined): IconName | null {
  const n = (name ?? '').trim().toLowerCase()
  if (!n) return null
  if (new RegExp(`\\b(${EMI_WORDS.join('|')})`).test(n)) return 'emi'
  if (new RegExp(`\\b(${RECHARGE_WORDS.join('|')})`).test(n)) return 'recharge'
  return null
}

/** What a purchase looks like: an EMI or a recharge by its merchant's name, otherwise its category's icon. */
export function spendIcon(merchant: string | undefined, categoryName: string | undefined): IconName {
  return nameIcon(merchant) ?? categoryIcon(categoryName)
}

/** What a category looks like: its own icon where the name says so, otherwise a tag. */
export function categoryIcon(name: string | undefined): IconName {
  const n = (name ?? '').trim().toLowerCase()
  if (!n) return 'tag'
  if (EXACT[n]) return EXACT[n]
  for (const [icon, words] of GUESS) {
    if (new RegExp(`\\b(${words.join('|')})`).test(n)) return icon
  }
  return 'tag'
}
