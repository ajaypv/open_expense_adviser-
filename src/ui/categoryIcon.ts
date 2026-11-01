import type { IconName } from './Icon'

/** The icon for each category the app starts with. */
const EXACT: Record<string, IconName> = {
  'food & dining': 'utensils',
  groceries: 'cart',
  transport: 'car',
  'bills & utilities': 'bolt',
  health: 'heart',
  'entertainment & travel': 'ticket',
  shopping: 'bag',
  'rent & housing': 'home',
  income: 'arrowDown',
  other: 'tag',
}

/** For a category the person made or renamed: the first icon whose words start a word in its name. */
const GUESS: [IconName, string[]][] = [
  ['utensils', ['food', 'dining', 'dine', 'eat', 'restaurant', 'cafe', 'coffee', 'lunch', 'dinner', 'snack', 'meal']],
  ['cart', ['grocer', 'supermarket', 'vegetable', 'mart']],
  ['car', ['transport', 'fuel', 'petrol', 'diesel', 'taxi', 'cab', 'metro', 'bus', 'parking', 'toll', 'car', 'bike']],
  ['bolt', ['bill', 'utilit', 'electric', 'water', 'internet', 'wifi', 'phone', 'recharge', 'gas']],
  ['heart', ['health', 'medic', 'doctor', 'pharmacy', 'hospital', 'gym', 'fitness']],
  ['ticket', ['entertain', 'movie', 'cinema', 'travel', 'trip', 'game', 'concert']],
  ['bag', ['shop', 'cloth', 'shoe', 'fashion', 'electronics']],
  ['home', ['rent', 'housing', 'house', 'home', 'mortgage']],
  ['arrowDown', ['income', 'salary']],
]

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
