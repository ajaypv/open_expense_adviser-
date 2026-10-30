import { memo, type ReactNode } from 'react'
import { useDisplay } from '../data/display'
import type { UpdateCheck } from '../pwa/checkForUpdate'
import type { ThemePref } from '../theme/useTheme'
import { Icon } from '../ui/Icon'
import { AccountsSection } from './settings/AccountsSection'
import { BudgetSection } from './settings/BudgetSection'
import { CurrencySection } from './settings/CurrencySection'
import { DataSection } from './settings/DataSection'
import { DisplaySection } from './settings/DisplaySection'
import { LocationSection } from './settings/LocationSection'
import type { Ledger } from './settings/parts'
import { RecurringSection } from './settings/RecurringSection'
import { RemindersSection } from './settings/RemindersSection'
import { SecuritySection } from './settings/SecuritySection'
import { SuggestionsSection } from './settings/SuggestionsSection'
import { UpdatesSection } from './settings/UpdatesSection'

interface Props {
  ledger: Ledger
  theme: ThemePref
  onTheme: (theme: ThemePref) => void
  /** A newer version has already downloaded and is waiting to take over. */
  updateReady: boolean
  onApplyUpdate: (() => void) | null
  onCheckUpdate: () => Promise<UpdateCheck>
  onShowWhatsNew: () => void
  /** Opens the upcoming payments, the place to add and change regular payments. */
  onOpenUpcoming?: () => void
}

/**
 * The parts of Settings, in the order a person needs them: keeping their data safe comes first, because
 * everything lives only on this device; then the money setup; then the things that happen on their own;
 * then looks. What is rarely touched is folded away under More.
 */
const PARTS = [
  { id: 'part-data', label: 'Your data and privacy' },
  { id: 'part-money', label: 'Money' },
  { id: 'part-auto', label: 'Automatic' },
  { id: 'part-look', label: 'Appearance' },
  { id: 'more-details', label: 'More' },
] as const

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-12 scroll-mt-4">
      <h2 id={`${id}-h`} className="text-2xl font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Scrolls to a part, opening it first if it is folded. */
function jumpTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  if (el instanceof HTMLDetailsElement) el.open = true
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

/** Each group of settings lives in its own file under settings/. This only puts them in order. */
export const Settings = memo(function Settings({ ledger, theme, onTheme, updateReady, onApplyUpdate, onCheckUpdate, onShowWhatsNew, onOpenUpcoming }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  return (
    <div className="pb-8">
      <h1 className="pt-4 text-3xl font-bold tracking-tight">Settings</h1>

      <nav aria-label="Jump to a part of Settings" className="-mx-5 mt-4">
        <ul className="flex gap-2 overflow-x-auto px-5 py-0.5 [mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]">
          {PARTS.map((p) => (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                onClick={() => jumpTo(p.id)}
                className="min-h-11 whitespace-nowrap rounded-full bg-surface px-4 font-medium shadow-[0_0_0_1px_var(--ring)]"
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <Part id="part-data" title="Your data and privacy">
        <DataSection ledger={ledger} />
        <SecuritySection />
      </Part>

      <Part id="part-money" title="Money">
        <CurrencySection ledger={ledger} />
        <AccountsSection ledger={ledger} />
        <BudgetSection ledger={ledger} />
      </Part>

      <Part id="part-auto" title="Automatic">
        <RecurringSection ledger={ledger} onOpenUpcoming={onOpenUpcoming} />
        <RemindersSection />
        <SuggestionsSection />
      </Part>

      <Part id="part-look" title="Appearance">
        <DisplaySection theme={theme} onTheme={onTheme} />
      </Part>

      {/* Rarely touched, so folded away; open on its own when an update is waiting so that isn't missed. */}
      <details id="more-details" open={updateReady || undefined} className="group mt-12 scroll-mt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <h2 className="text-2xl font-bold tracking-tight">More</h2>
          <span aria-hidden="true" className="text-ink-2 transition-transform group-open:rotate-90 motion-reduce:transition-none">
            <Icon name="chevRight" size={22} />
          </span>
        </summary>
        <LocationSection ledger={ledger} />
        <UpdatesSection updateReady={updateReady} onApplyUpdate={onApplyUpdate} onCheckUpdate={onCheckUpdate} onShowWhatsNew={onShowWhatsNew} />
      </details>
    </div>
  )
})
