import type { DefaultCategoryName } from '../db/defaultCategories'

/**
 * The words the chat bar knows. This file is only data, so teaching the app a new word never touches the
 * parser: add it to the right list below.
 *
 * To add words for another region, make a new pack the same shape as KARNATAKA and add it to PACKS.
 * To add one word, put it in the pack and category it belongs to.
 *
 * Each word is a single lowercase word with no spaces ("ksrtc", not "ksrtc bus"): the parser looks at the
 * words of a message one at a time. A message with several known words goes to the first category in
 * CATEGORY_ORDER that has one, so a word may only appear once across all the lists (a test checks this).
 */

/** The first category with a matching word wins, so list specific categories before general ones. */
export const CATEGORY_ORDER: DefaultCategoryName[] = [
  'Rent & Housing',
  'Groceries',
  'Food & Dining',
  'Transport',
  'Bills & Utilities',
  'Health',
  'Entertainment & Travel',
  'Shopping',
]

export type WordPack = Partial<Record<DefaultCategoryName, string[]>>

/**
 * Words that mean the same everywhere. "chicken" and "fruit" are left out on purpose: "chicken biryani" and
 * "fruit bowl for lunch" are meals, and Groceries is checked before Food & Dining.
 */
export const GENERAL: WordPack = {
  'Rent & Housing': ['rent', 'maintenance', 'mortgage', 'housing'],
  Groceries: ['grocery', 'groceries', 'supermarket', 'vegetables', 'vegetable', 'fruits', 'milk', 'eggs', 'walmart', 'costco'],
  'Food & Dining': ['restaurant', 'lunch', 'dinner', 'breakfast', 'coffee', 'cafe', 'starbucks', 'pizza', 'burger', 'snacks', 'snack', 'food', 'mcdonalds', 'tea', 'biryani', 'juice', 'coconut', 'bakery', 'canteen'],
  Transport: ['uber', 'fuel', 'petrol', 'diesel', 'metro', 'bus', 'cab', 'taxi', 'auto', 'parking', 'toll', 'train', 'station', 'pump'],
  'Bills & Utilities': ['electricity', 'water', 'wifi', 'internet', 'broadband', 'recharge', 'bill', 'gas', 'insurance', 'phone'],
  Health: ['pharmacy', 'doctor', 'medicine', 'medicines', 'hospital', 'clinic', 'gym', 'dentist', 'lab'],
  'Entertainment & Travel': ['netflix', 'spotify', 'prime', 'movie', 'movies', 'cinema', 'concert', 'flight', 'hotel', 'trip', 'airbnb', 'game', 'games'],
  Shopping: ['amazon', 'clothes', 'shoes', 'shopping', 'mall', 'electronics'],
}

/** Apps, shops and words used across India. */
export const INDIA: WordPack = {
  'Rent & Housing': ['pg'],
  Groceries: ['bigbasket', 'blinkit', 'zepto', 'instamart', 'kirana', 'dmart'],
  'Food & Dining': ['swiggy', 'zomato', 'chai', 'tiffin', 'meals', 'thali', 'chaat', 'mess'],
  Transport: ['ola', 'rapido', 'rickshaw', 'fastag', 'irctc', 'redbus'],
  'Bills & Utilities': ['jio', 'airtel', 'bsnl', 'vodafone', 'dth', 'cylinder'],
  Health: ['apollo', 'medplus', 'netmeds', 'pharmeasy'],
  'Entertainment & Travel': ['hotstar', 'pvr', 'inox', 'bookmyshow'],
  Shopping: ['flipkart', 'myntra'],
}

/** Karnataka and Bengaluru: buses, metro, tiffin and the local utilities and shops. */
export const KARNATAKA: WordPack = {
  Groceries: ['hopcoms', 'nandini'],
  'Food & Dining': ['darshini', 'idli', 'dosa', 'vada', 'udupi', 'mtr', 'kaapi', 'sugarcane'],
  // "yatri" is Namma Yatri; "vajra" and "airavat" are BMTC's airport and long-distance buses.
  Transport: ['ksrtc', 'bmtc', 'bmrcl', 'vajra', 'airavat', 'yatri', 'blusmart'],
  'Bills & Utilities': ['bescom', 'bwssb', 'fibernet'],
  Health: ['manipal'],
}

/** Every pack in use. Add a new one here to switch it on. */
export const PACKS: WordPack[] = [GENERAL, INDIA, KARNATAKA]

/** The packs joined up, in the order the parser tries them. */
export const CATEGORY_KEYWORDS: [DefaultCategoryName, string[]][] = CATEGORY_ORDER.map((name) => [
  name,
  PACKS.flatMap((pack) => pack[name] ?? []),
])

/** Words that only join a message together. They are dropped when the merchant's name is made. */
export const FILLER_WORDS = [
  'spent', 'spend', 'paid', 'pay', 'bought', 'buy', 'got', 'i', 'just', 'for', 'on', 'at', 'to',
  'from', 'using', 'via', 'with', 'by', 'the', 'a', 'an', 'of', 'my', 'me', 'and', 'rs', 'inr',
  'rupees', 'rupee', 'usd', 'dollars', 'dollar', 'eur', 'euro', 'euros', 'gbp', 'pounds', 'sent',
]

/** Income words that carry no meaning beyond "money came in", dropped from the merchant name. */
export const INCOME_FILLER_WORDS = ['received', 'receive', 'credited', 'deposited', 'deposit', 'me', 'earned', 'sent']

export type PaymentMethod = 'Cash' | 'Card' | 'Online' | ''

/** Words that say how it was paid. They set the payment method and are dropped from the name. */
export const PAYMENT_WORDS: Record<string, PaymentMethod> = {
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
