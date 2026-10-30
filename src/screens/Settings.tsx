import { memo } from 'react'
import { useDisplay } from '../data/display'
import type { UpdateCheck } from '../pwa/checkForUpdate'
import type { ThemePref } from '../theme/useTheme'
import { AccountsSection } from './settings/AccountsSection'
import { BudgetSection } from './settings/BudgetSection'
import { CurrencySection } from './settings/CurrencySection'
import { DataSection } from './settings/DataSection'
import { DisplaySection } from './settings/DisplaySection'
import { LocationSection } from './settings/LocationSection'
import { card, Group, Status, type Ledger } from './settings/parts'
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
}

/** Each group of settings lives in its own file under settings/. This only puts them in order. */
export const Settings = memo(function Settings({ ledger, theme, onTheme, updateReady, onApplyUpdate, onCheckUpdate, onShowWhatsNew }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  return (
    <div className="pb-8">
      <h1 className="pt-4 text-3xl font-semibold tracking-tight">Settings</h1>

      <DisplaySection theme={theme} onTheme={onTheme} />
      <SuggestionsSection />
      <AccountsSection ledger={ledger} />
      <BudgetSection ledger={ledger} />
      <RecurringSection ledger={ledger} />
      <RemindersSection />
      <LocationSection ledger={ledger} />
      <CurrencySection ledger={ledger} />
      <SecuritySection />
      <DataSection ledger={ledger} />
      <UpdatesSection
        updateReady={updateReady}
        onApplyUpdate={onApplyUpdate}
        onCheckUpdate={onCheckUpdate}
        onShowWhatsNew={onShowWhatsNew}
      />

      <Group id="ai-h" title="AI assistant" status={<Status on={false}>Coming soon</Status>}>
        <p className={`${card} p-4 text-ink-2`}>
          In the next update you&rsquo;ll add your own API key here. It will stay encrypted on this device.
        </p>
      </Group>
    </div>
  )
})
