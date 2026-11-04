import { memo, useState } from 'react'
import { useDisplay } from '../data/display'
import type { UpdateCheck } from '../pwa/checkForUpdate'
import type { PaletteId } from '../theme/palettes'
import type { ThemePref } from '../theme/useTheme'
import { Icon, type IconName } from '../ui/Icon'
import { useBackClose } from '../ui/backStack'
import { AccountsSection } from './settings/AccountsSection'
import { BudgetSection } from './settings/BudgetSection'
import { CurrencySection } from './settings/CurrencySection'
import { DataSection } from './settings/DataSection'
import { DisplaySection } from './settings/DisplaySection'
import { BackupCard, UpdateCard } from './settings/EssentialCards'
import { LocationSection } from './settings/LocationSection'
import { card, type Ledger } from './settings/parts'
import { RecurringSection } from './settings/RecurringSection'
import { RemindersSection } from './settings/RemindersSection'
import { SecuritySection } from './settings/SecuritySection'
import { SuggestionsSection } from './settings/SuggestionsSection'

/** The pages Settings leads to. */
export type SettingsPage = 'money' | 'auto' | 'look' | 'privacy'

interface Props {
  ledger: Ledger
  theme: ThemePref
  onTheme: (theme: ThemePref) => void
  /** The colour theme, and the way to change it. */
  palette?: PaletteId
  onPalette?: (palette: PaletteId) => void
  /** A newer version has already downloaded and is waiting to take over. */
  updateReady: boolean
  onApplyUpdate: (() => void) | null
  onCheckUpdate: () => Promise<UpdateCheck>
  onShowWhatsNew: () => void
  /** Opens the upcoming payments, the place to add and change regular payments. */
  onOpenUpcoming?: () => void
  /** Start on one of the pages instead of the list, for a button elsewhere that says "set your balance". */
  initialPage?: SettingsPage | null
}

const PAGES: { id: SettingsPage; title: string; summary: string; icon: IconName }[] = [
  { id: 'money', title: 'Money', summary: 'Currency, accounts and balance, monthly budget', icon: 'bag' },
  { id: 'auto', title: 'Automatic', summary: 'Regular payments, reminders, suggestions', icon: 'repeat' },
  { id: 'look', title: 'Appearance', summary: 'Colour theme, light or dark, text size, hide amounts', icon: 'sun' },
  { id: 'privacy', title: 'Privacy and data', summary: 'App lock, location, export, restore, recently deleted', icon: 'lock' },
]

/**
 * Settings is a short list, not a long page. At the top are the two things worth having at hand: a backup, because
 * everything lives only on this device, and the app update. Below are four rows, each opening a page of its own for
 * that group of settings, with a back button (and the phone's back) to return to the list. Each group's settings are
 * unchanged; they have only moved onto their own page.
 */
export const Settings = memo(function Settings({ ledger, theme, onTheme, palette, onPalette, updateReady, onApplyUpdate, onCheckUpdate, onShowWhatsNew, onOpenUpcoming, initialPage = null }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const [page, setPage] = useState<SettingsPage | null>(initialPage)
  // The phone's back button returns to the list, as the button at the top of a page does.
  useBackClose(page !== null, () => setPage(null))

  const open = PAGES.find((p) => p.id === page)

  if (open) {
    return (
      <div key={open.id} className="settings-page-in pb-8">
        <header className="flex items-center gap-1 pt-3">
          <button type="button" onClick={() => setPage(null)} aria-label="Back to Settings" className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-full active:bg-surface-2">
            <Icon name="chevLeft" size={24} />
          </button>
          <h1 className="text-2xl font-bold tracking-tight">{open.title}</h1>
        </header>

        {open.id === 'money' && (
          <>
            <CurrencySection ledger={ledger} />
            <AccountsSection ledger={ledger} />
            <BudgetSection ledger={ledger} />
          </>
        )}
        {open.id === 'auto' && (
          <>
            <RecurringSection ledger={ledger} onOpenUpcoming={onOpenUpcoming} />
            <RemindersSection />
            <SuggestionsSection />
          </>
        )}
        {open.id === 'look' && <DisplaySection theme={theme} onTheme={onTheme} palette={palette} onPalette={onPalette} />}
        {open.id === 'privacy' && (
          <>
            <DataSection ledger={ledger} />
            <SecuritySection />
            <LocationSection ledger={ledger} />
          </>
        )}
      </div>
    )
  }

  return (
    <div className="pb-8">
      <h1 className="pt-4 text-3xl font-bold tracking-tight">Settings</h1>

      <div className="mt-4 space-y-3">
        <BackupCard ledger={ledger} />
        <UpdateCard updateReady={updateReady} onApplyUpdate={onApplyUpdate} onCheckUpdate={onCheckUpdate} onShowWhatsNew={onShowWhatsNew} />
      </div>

      <nav aria-label="Settings pages" className="mt-6">
        <ul className={`${card} divide-y divide-line overflow-hidden`}>
          {PAGES.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setPage(p.id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
                  <Icon name={p.icon} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-ink-2">{p.summary}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-ink-2">
                  <Icon name="chevRight" size={20} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
})
