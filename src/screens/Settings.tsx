import { memo, useState } from 'react'
import { useDisplay } from '../data/display'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSuggestionPlacement } from '../data/preferences'
import type { UpdateCheck } from '../pwa/checkForUpdate'
import { PALETTES, type PaletteId } from '../theme/palettes'
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
import { type Ledger } from './settings/parts'
import { RecurringSection } from './settings/RecurringSection'
import { RemindersSection } from './settings/RemindersSection'
import { SecuritySection } from './settings/SecuritySection'
import { SuggestionsSection } from './settings/SuggestionsSection'
import { WidgetSection } from './settings/WidgetSection'

/** The pages Settings leads to. */
export type SettingsPage = 'money' | 'auto' | 'suggestions' | 'look' | 'privacy'

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
  { id: 'money', title: 'Money', summary: 'Currency, accounts and balance, monthly budget', icon: 'bank' },
  { id: 'auto', title: 'Automatic', summary: 'Regular payments, reminders, widget', icon: 'autopay' },
  { id: 'suggestions', title: 'Suggestions', summary: 'Your regulars, on Home or above the input bar', icon: 'spark' },
  { id: 'look', title: 'Appearance', summary: 'Colour theme, light or dark, text size, hide amounts', icon: 'palette' },
  { id: 'privacy', title: 'Privacy and data', summary: 'App lock, location, export, restore, recently deleted', icon: 'shield' },
]

/** The pages, in groups under a quiet title each. */
const GROUPS: { title: string; pages: SettingsPage[] }[] = [
  { title: 'Your money', pages: ['money'] },
  { title: 'Make it work for you', pages: ['auto', 'suggestions', 'look'] },
  { title: 'Safe and private', pages: ['privacy'] },
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
  // Nothing is said on the row until the choice has been read, rather than a moment of "Off" for someone who has it on.
  const suggestionPlacement = useLiveQuery(getSuggestionPlacement, [])
  // The phone's back button returns to the list, as the button at the top of a page does.
  useBackClose(page !== null, () => setPage(null))

  const open = PAGES.find((p) => p.id === page)

  // What each row can say at a glance, on its right, as the figures do in a bank app's list: the currency, how many regular
  // payments are set up, which colour theme.
  const regularCount = ledger.recurring.filter((r) => r.active).length
  const glance: Partial<Record<SettingsPage, string>> = {
    money: ledger.currency,
    auto: regularCount > 0 ? `${regularCount} set up` : undefined,
    suggestions: suggestionPlacement ? { home: 'On Home', input: 'By the input', off: 'Off' }[suggestionPlacement] : undefined,
    look: PALETTES.find((p) => p.id === palette)?.name,
  }

  if (open) {
    return (
      <div key={open.id} className="font-cred settings-page-in pb-8">
        <header className="flex items-center gap-3 pt-3">
          <button type="button" onClick={() => setPage(null)} aria-label="Back to Settings" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 active:opacity-70">
            <Icon name="chevLeft" size={22} weight={1.5} />
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{open.title}</h1>
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
            <WidgetSection ledger={ledger} />
          </>
        )}
        {open.id === 'suggestions' && <SuggestionsSection />}
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
    <div className="font-cred pb-8">
      <h1 className="pt-4 text-3xl font-semibold tracking-tight">Settings</h1>

      <div className="cred-panel mt-5">
        <BackupCard ledger={ledger} />
        <UpdateCard updateReady={updateReady} onApplyUpdate={onApplyUpdate} onCheckUpdate={onCheckUpdate} onShowWhatsNew={onShowWhatsNew} />
      </div>

      <nav aria-label="Settings pages">
        {GROUPS.map((g) => (
          <section key={g.title} aria-label={g.title} className="mt-8">
            <h2 className="px-3 text-[0.9375rem] font-medium text-ink-2">{g.title}</h2>
            <ul className="mt-1">
              {g.pages.map((id) => {
                const p = PAGES.find((x) => x.id === id)!
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setPage(p.id)} className="flex min-h-[4.5rem] w-full items-center gap-5 rounded-2xl px-3 py-3 text-left active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2">
                      <span aria-hidden="true" data-icon={p.icon} className="flex size-7 shrink-0 items-center justify-center">
                        <Icon name={p.icon} size={28} weight={1.4} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[1.1875rem] font-medium leading-tight">{p.title}</span>
                        <span className="mt-0.5 block truncate text-sm text-ink-2">{p.summary}</span>
                      </span>
                      {glance[p.id] && <span className="shrink-0 font-semibold">{glance[p.id]}</span>}
                      <span aria-hidden="true" className="shrink-0 text-ink-2">
                        <Icon name="chevRight" size={18} weight={1.4} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </nav>
    </div>
  )
})
