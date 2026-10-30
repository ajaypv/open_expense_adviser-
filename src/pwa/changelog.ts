export interface ChangelogEntry {
  version: string
  date: string
  /** Plain sentences about what people can now do, not about how it was built. */
  items: string[]
}

/** Newest first. The first entry is what "What’s new" shows. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.0',
    date: '2026-10-29',
    items: [
      'Set goals for something you’re saving for, like a new phone or a trip, and add money towards them from Home.',
      'Restore from a backup, and share a backup straight to Files or Drive. You’ll get a reminder when it’s been a while.',
      'Deleted something by mistake? It stays in Recently deleted for 30 days.',
      'Lock the app with a PIN.',
      'Several accounts, such as cash and bank, with transfers between them.',
      'Record purchases in other currencies; set exchange rates in Settings.',
      'Budgets for each category, and a year view, savings and unusual spending in Insights.',
      'Recurring transactions like rent, added with one tap when they’re due.',
      'Reminders to log your spending, and alerts as you near a budget.',
      'Swipe a row to repeat or delete it, select several at once, and filter Activity by date, amount and type.',
      'The input bar learns your category for each merchant and understands several entries at once: “coffee 120, lunch 340”.',
      'Hide all amounts at once, choose Indian or international number grouping, and make the text larger.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-29',
    items: [
      'Choose where suggestions appear, or turn them off.',
      'Check for updates and update the app from Settings.',
    ],
  },
]
