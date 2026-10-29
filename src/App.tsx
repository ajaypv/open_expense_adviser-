import { flushSync } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { attachLocation } from './data/location'
import { useLedger } from './data/useLedger'
import { useToday } from './data/useToday'
import { formatMoney, localDateString } from './db/money'
import { addTransaction, categoryIdByName, deleteTransaction, requestPersistentStorage } from './db/repo'
import type { Transaction } from './db/schema'
import { monthOf, type MonthKey } from './insights/aggregates'
import { suggest, type Suggestion } from './insights/suggestions'
import { parseExpense } from './ingest/localParser'
import { usePwa } from './pwa/usePwa'
import { Activity } from './screens/Activity'
import { Home } from './screens/Home'
import { Insights } from './screens/Insights'
import { Settings } from './screens/Settings'
import { useTheme } from './theme/useTheme'
import { AddSheet } from './ui/AddSheet'
import { BottomNav, TABS, type Tab } from './ui/BottomNav'
import { ChatBar } from './ui/ChatBar'
import { PwaBanner } from './ui/PwaBanner'
import { ToastProvider, useToast } from './ui/toast'

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}

function Shell() {
  const pwa = usePwa()
  const ledger = useLedger()
  const theme = useTheme()
  const toast = useToast()

  const today = useToday()
  const currentMonth = localDateString(today).slice(0, 7)

  const [tab, setTab] = useState<Tab>('home')
  const [month, setMonth] = useState<MonthKey>(currentMonth)
  const [chat, setChat] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [sheet, setSheet] = useState<{ open: boolean; editing: Transaction | null; prefill: Suggestion | null }>({
    open: false,
    editing: null,
    prefill: null,
  })

  // Regulars that fit the current weekday, time of day and date. Recomputed when the data changes,
  // when a new day starts, and each time the form opens (so the time of day is current).
  const suggestions = useMemo(
    () => suggest(ledger.txs, new Date(), 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sheet.open only forces a fresh clock reading
    [ledger.txs, today, sheet.open],
  )

  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  // The estimated balance starts hidden. It stays revealed across tabs, but is hidden again
  // whenever the app goes to the background (switching apps, locking the phone).
  const [balanceShown, setBalanceShown] = useState(false)
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') setBalanceShown(false)
    }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])

  // Publish the chat bar + nav height so floating UI (the toast) always sits just above it,
  // even when the chat box grows to several lines.
  const bottomStack = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = bottomStack.current
    if (!el) return
    const publish = () => document.documentElement.style.setProperty('--stack-h', `${el.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /** Switch tabs with a directional slide where View Transitions are available. */
  function go(next: Tab) {
    if (next === tab) return
    const direction = TABS.findIndex((t) => t.id === next) > TABS.findIndex((t) => t.id === tab) ? 'forward' : 'backward'
    const update = () => flushSync(() => setTab(next))
    if (!document.startViewTransition) return update()
    document.startViewTransition({ update, types: [direction] } as unknown as () => void)
  }

  async function logFromChat(text: string): Promise<boolean> {
    const parsed = parseExpense(text)
    if (!parsed) {
      toast({ message: 'No amount found. Try “450 lunch at Cafe”.' })
      return false
    }
    const id = await addTransaction({
      kind: parsed.kind,
      amountMinor: parsed.amountMinor,
      currency: ledger.currency,
      categoryId: await categoryIdByName(parsed.categoryName),
      merchant: parsed.merchant,
      note: '',
      date: parsed.date,
      paymentMethod: parsed.paymentMethod,
      source: 'chat',
    })
    void attachLocation(id) // no-op unless the user turned location recording on
    // Show the month the expense landed in so the user sees it appear.
    setMonth(monthOf(parsed.date))
    toast({
      message:
        parsed.kind === 'income'
          ? `Received ${formatMoney(parsed.amountMinor, ledger.currency)}`
          : `Added ${formatMoney(parsed.amountMinor, ledger.currency)} to ${parsed.categoryName}`,
      actionLabel: 'Undo',
      onAction: () => void deleteTransaction(id),
    })
    return true
  }

  const openAdd = () => setSheet({ open: true, editing: null, prefill: null })
  const openEdit = (tx: Transaction) => setSheet({ open: true, editing: tx, prefill: null })
  const openSuggestion = (s: Suggestion) => setSheet({ open: true, editing: null, prefill: s })
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }))

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col pt-[env(safe-area-inset-top)] md:max-w-2xl">
      <PwaBanner pwa={pwa} />

      <main
        className="flex-1 overflow-y-auto overscroll-contain pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]"
        style={{ viewTransitionName: 'tab' }}
      >
        {tab === 'home' && (
          <Home
            ledger={ledger}
            month={month}
            onMonth={setMonth}
            today={today}
            onPickCategory={(id) => {
              setCategoryFilter(id)
              go('activity')
            }}
            onEdit={openEdit}
            onExample={setChat}
            onOpenSettings={() => go('settings')}
            onSeeAll={() => {
              setCategoryFilter(null)
              go('activity')
            }}
            balanceShown={balanceShown}
            onToggleBalance={() => setBalanceShown((s) => !s)}
            suggestions={suggestions}
            onSuggestion={openSuggestion}
          />
        )}
        {tab === 'activity' && (
          <Activity
            ledger={ledger}
            today={today}
            categoryFilter={categoryFilter}
            onCategoryFilter={setCategoryFilter}
            onEdit={openEdit}
          />
        )}
        {tab === 'insights' && (
          <Insights ledger={ledger} month={month} onMonth={setMonth} today={today} onOpenSettings={() => go('settings')} />
        )}
        {tab === 'settings' && <Settings ledger={ledger} theme={theme.pref} onTheme={theme.setPref} />}
      </main>

      <div ref={bottomStack}>
        <div className="pb-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-2 short:pt-1">
          <ChatBar value={chat} onChange={setChat} onSubmit={logFromChat} onOpenForm={openAdd} />
        </div>
        <BottomNav current={tab} onSelect={go} />
      </div>

      <AddSheet
        open={sheet.open}
        editing={sheet.editing}
        categories={ledger.categories}
        currency={ledger.currency}
        suggestions={suggestions}
        prefill={sheet.prefill}
        onClose={closeSheet}
      />
    </div>
  )
}
