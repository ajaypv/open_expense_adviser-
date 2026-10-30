import { flushSync } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { markVersionSeen, startupNotice, useOnboarded, useSeenVersion } from './data/appState'
import type { LedgerTx } from './data/buildLedger'
import { useDisplay } from './data/display'
import { attachLocation } from './data/location'
import { useSuggestionPlacement } from './data/preferences'
import { useLedger } from './data/useLedger'
import { useNearby } from './data/useNearby'
import { useToday } from './data/useToday'
import { formatMoney, localDateString } from './db/money'
import {
  addTransaction,
  categoryIdByName,
  deleteTransaction,
  deleteTransactions,
  purgeExpiredTrash,
  requestPersistentStorage,
} from './db/repo'
import type { Goal, Transaction } from './db/schema'
import { monthOf, type MonthKey } from './insights/aggregates'
import { learnedCategoryId } from './ingest/learn'
import { parseMany } from './ingest/localParser'
import { suggest, type Suggestion } from './insights/suggestions'
import { usePwa } from './pwa/usePwa'
import { APP_VERSION } from './pwa/version'
import { useReminders } from './reminders/useReminders'
import { Activity } from './screens/Activity'
import { Home } from './screens/Home'
import { Insights } from './screens/Insights'
import { Settings } from './screens/Settings'
import { LockScreen } from './security/LockScreen'
import { useLockState, watchVisibility } from './security/lock'
import { useTheme } from './theme/useTheme'
import { AddSheet } from './ui/AddSheet'
import { BottomNav, TABS, type Tab } from './ui/BottomNav'
import { ChatBar } from './ui/ChatBar'
import { GoalMoneySheet, GoalSheet } from './ui/GoalSheets'
import { GoalsOverview } from './ui/GoalsOverview'
import { PwaBanner } from './ui/PwaBanner'
import { SuggestionList } from './ui/SuggestionList'
import { ToastProvider, useToast } from './ui/toast'
import { Welcome } from './ui/Welcome'
import { WhatsNew } from './ui/WhatsNew'

const NO_SUGGESTIONS: Suggestion[] = []

export default function App() {
  return (
    <ToastProvider>
      <Gate />
    </ToastProvider>
  )
}

/**
 * With the app lock on, nothing but the PIN screen is rendered until it is unlocked, so there is
 * nothing on screen (and nothing queried) for someone else to see.
 */
function Gate() {
  const lock = useLockState()
  useEffect(() => watchVisibility(), [])
  return lock.locked ? <LockScreen /> : <Shell />
}

type Sheet = { open: boolean; editing: LedgerTx | null; prefill: Suggestion | null; startKind: Transaction['kind'] }
/** `n` changes each time a goal sheet opens, so its form starts fresh from the goal it was opened for. */
type GoalSheetState = { open: boolean; goal: Goal | null; n: number }

function Shell() {
  const pwa = usePwa()
  const ledger = useLedger()
  const theme = useTheme()
  const toast = useToast()
  useDisplay() // the suggestion row shows amounts, so redraw when display settings change

  const today = useToday()
  const currentMonth = localDateString(today).slice(0, 7)

  const [tab, setTab] = useState<Tab>('home')
  const [month, setMonth] = useState<MonthKey>(currentMonth)
  // The chat bar owns what is being typed. This only carries text pushed in from outside
  // (an example chip); a new `n` remounts the bar with that text.
  const [draft, setDraft] = useState({ text: '', n: 0 })
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [sheet, setSheet] = useState<Sheet>({ open: false, editing: null, prefill: null, startKind: 'expense' })
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [goalSheet, setGoalSheet] = useState<GoalSheetState>({ open: false, goal: null, n: 0 })
  const [moneySheet, setMoneySheet] = useState<GoalSheetState>({ open: false, goal: null, n: 0 })

  // The user chooses where suggestions appear (or turns them off) in Settings.
  const placement = useSuggestionPlacement()
  // Where they are right now, if they have turned location on: merchants paid near here rank higher.
  const here = useNearby(sheet.open)

  // Regulars that fit the current weekday, time of day, date and place. Recomputed when the data
  // changes, when a new day starts, and each time the form opens (so the time of day is current).
  // Not computed at all while suggestions are off.
  const suggestions = useMemo(
    () => (placement === 'off' ? NO_SUGGESTIONS : suggest(ledger.txs, new Date(), 8, undefined, here ?? undefined)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sheet.open only forces a fresh clock reading
    [ledger.txs, today, sheet.open, placement, here],
  )

  // The form has a tab for each kind, so each gets its own best picks. Taking them from the list above
  // would leave "Received" empty whenever the top few are all expenses.
  const sheetSuggestions = useMemo(
    () =>
      placement === 'off'
        ? NO_SUGGESTIONS
        : [...suggest(ledger.txs, new Date(), 4, 'expense', here ?? undefined), ...suggest(ledger.txs, new Date(), 4, 'income', here ?? undefined)],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sheet.open only forces a fresh clock reading
    [ledger.txs, today, sheet.open, placement, here],
  )

  useEffect(() => {
    void requestPersistentStorage()
    void purgeExpiredTrash() // anything deleted more than 30 days ago goes for good
  }, [])

  // Reminders to log, budget alerts, and the number on the app icon.
  const showMessage = useCallback((message: string) => toast({ message }), [toast])
  const { logNudge } = useReminders(ledger, showMessage)

  // First launch asks three optional questions; after an update, what is new is shown once.
  const onboarded = useOnboarded()
  const seenVersion = useSeenVersion()
  const notice = startupNotice({
    loading: ledger.loading,
    hasData: ledger.txs.length > 0 || ledger.trash.length > 0,
    onboarded,
    seenVersion,
    version: APP_VERSION,
  })
  const [whatsNewByHand, setWhatsNewByHand] = useState(false)
  const showWhatsNew = useCallback(() => setWhatsNewByHand(true), [])
  const closeWhatsNew = useCallback(() => {
    setWhatsNewByHand(false)
    void markVersionSeen(APP_VERSION)
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

  /**
   * Switch tabs with a directional slide where View Transitions are available. Reading the
   * current tab from a ref keeps this function's identity stable, so memoized children that
   * receive handlers built on it don't re-render.
   */
  const tabRef = useRef(tab)
  const go = useCallback((next: Tab) => {
    const current = tabRef.current
    if (next === current) return
    const direction = TABS.findIndex((t) => t.id === next) > TABS.findIndex((t) => t.id === current) ? 'forward' : 'backward'
    const update = () => {
      tabRef.current = next
      flushSync(() => setTab(next))
    }
    if (!document.startViewTransition) return update()
    document.startViewTransition({ update, types: [direction] } as unknown as () => void)
  }, [])

  // The input bar reads the latest data through refs, so its handler keeps the same identity and the
  // bar doesn't re-render every time a transaction is added.
  const dataRef = useRef({ txs: ledger.txs, categoryById: ledger.categoryById })
  dataRef.current = { txs: ledger.txs, categoryById: ledger.categoryById }
  const currency = ledger.currency

  const logFromChat = useCallback(
    async (text: string): Promise<boolean> => {
      const entries = parseMany(text)
      if (entries.length === 0) {
        toast({ message: 'No amount found. Try “450 lunch at Cafe”.' })
        return false
      }
      const { txs, categoryById } = dataRef.current
      const ids: number[] = []
      let sent = 0
      let lastName = ''
      for (const parsed of entries) {
        // Your own choice for a merchant beats the keyword guess.
        const learned = parsed.kind === 'expense' ? learnedCategoryId(parsed.merchant, txs) : null
        const categoryId = learned ?? (await categoryIdByName(parsed.categoryName))
        lastName = categoryById.get(categoryId)?.name ?? parsed.categoryName
        const id = await addTransaction({
          kind: parsed.kind,
          amountMinor: parsed.amountMinor,
          currency,
          categoryId,
          merchant: parsed.merchant,
          note: '',
          date: parsed.date,
          paymentMethod: parsed.paymentMethod,
          source: 'chat',
        })
        void attachLocation(id) // no-op unless the user turned location recording on
        ids.push(id)
        if (parsed.kind === 'expense') sent += parsed.amountMinor
      }
      // Show the month the entry landed in so the user sees it appear.
      setMonth(monthOf(entries[0].date))
      const undo = () => void (ids.length === 1 ? deleteTransaction(ids[0]) : deleteTransactions(ids))
      if (entries.length > 1) {
        toast({ message: `Added ${entries.length} entries${sent ? `, ${formatMoney(sent, currency)} sent` : ''}`, actionLabel: 'Undo', onAction: undo })
      } else {
        const only = entries[0]
        toast({
          message:
            only.kind === 'income'
              ? `Received ${formatMoney(only.amountMinor, currency)}`
              : `Added ${formatMoney(only.amountMinor, currency)} to ${lastName}`,
          actionLabel: 'Undo',
          onAction: undo,
        })
      }
      return true
    },
    [currency, toast],
  )

  // Stable handlers: the screens and the chat bar are memoized and skip renders they don't need.
  const openAdd = useCallback(
    (kind: Transaction['kind'] = 'expense') => setSheet({ open: true, editing: null, prefill: null, startKind: kind }),
    [],
  )
  const openAddDefault = useCallback(() => openAdd('expense'), [openAdd])
  const openEdit = useCallback((tx: LedgerTx) => setSheet({ open: true, editing: tx, prefill: null, startKind: 'expense' }), [])
  const openSuggestion = useCallback((s: Suggestion) => setSheet({ open: true, editing: null, prefill: s, startKind: s.kind }), [])
  const closeSheet = useCallback(() => setSheet((s) => ({ ...s, open: false })), [])

  const newGoal = useCallback(() => setGoalSheet((s) => ({ open: true, goal: null, n: s.n + 1 })), [])
  const editGoal = useCallback((goal: Goal) => setGoalSheet((s) => ({ open: true, goal, n: s.n + 1 })), [])
  const openGoals = useCallback(() => setGoalsOpen(true), [])
  const closeGoals = useCallback(() => setGoalsOpen(false), [])
  const closeGoalSheet = useCallback(() => setGoalSheet((s) => ({ ...s, open: false })), [])
  const goalMoney = useCallback((goal: Goal) => setMoneySheet((s) => ({ open: true, goal, n: s.n + 1 })), [])
  const closeMoneySheet = useCallback(() => setMoneySheet((s) => ({ ...s, open: false })), [])

  // A home-screen shortcut ("Add expense", "Add received") opens the form straight away.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('add')
    if (wanted === 'expense' || wanted === 'income') {
      openAdd(wanted)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [openAdd])

  const pickCategory = useCallback(
    (id: number) => {
      setCategoryFilter(id)
      go('activity')
    },
    [go],
  )
  const seeAll = useCallback(() => {
    setCategoryFilter(null)
    go('activity')
  }, [go])
  const openSettings = useCallback(() => go('settings'), [go])
  const toggleBalance = useCallback(() => setBalanceShown((s) => !s), [])
  const fillChat = useCallback((text: string) => setDraft((d) => ({ text, n: d.n + 1 })), [])

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col pt-[env(safe-area-inset-top)] md:max-w-2xl">
      <PwaBanner pwa={pwa} />

      <main
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]"
        style={{ viewTransitionName: 'tab' }}
      >
        {tab === 'home' && (
          <Home
            ledger={ledger}
            month={month}
            onMonth={setMonth}
            today={today}
            onPickCategory={pickCategory}
            onEdit={openEdit}
            onExample={fillChat}
            onOpenSettings={openSettings}
            onSeeAll={seeAll}
            balanceShown={balanceShown}
            onToggleBalance={toggleBalance}
            suggestions={placement === 'home' ? suggestions : NO_SUGGESTIONS}
            onSuggestion={openSuggestion}
            logNudge={logNudge}
            onAdd={openAddDefault}
            onOpenGoals={openGoals}
          />
        )}
        {tab === 'activity' && (
          <Activity ledger={ledger} today={today} categoryFilter={categoryFilter} onCategoryFilter={setCategoryFilter} onEdit={openEdit} />
        )}
        {tab === 'insights' && (
          <Insights ledger={ledger} month={month} onMonth={setMonth} today={today} onOpenSettings={openSettings} />
        )}
        {tab === 'settings' && (
          <Settings
            ledger={ledger}
            theme={theme.pref}
            onTheme={theme.setPref}
            updateReady={pwa.updateReady}
            onApplyUpdate={pwa.applyUpdate}
            onCheckUpdate={pwa.checkNow}
            onShowWhatsNew={showWhatsNew}
          />
        )}
      </main>

      <div ref={bottomStack}>
        <div className="group pb-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-2 short:pt-1">
          {/* Regulars for right now, one swipe away. Hidden only while the chat box itself has focus
              (the keyboard is up) and on short screens. Not group-focus-within: focusing a chip would
              then hide the row mid-tap and swallow the tap. */}
          {placement === 'input' && suggestions.length > 0 && (
            <section aria-label="Suggested for now" className="mb-2 group-has-[textarea:focus]:hidden short:hidden">
              <SuggestionList
                items={suggestions}
                categoryById={ledger.categoryById}
                currency={ledger.currency}
                onPick={openSuggestion}
                tone="page"
                className="-mx-3 scroll-px-3 px-3 [mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]"
              />
            </section>
          )}
          <ChatBar key={draft.n} initialText={draft.text} onSubmit={logFromChat} onOpenForm={openAddDefault} />
        </div>
        <BottomNav current={tab} onSelect={go} />
      </div>

      <AddSheet
        open={sheet.open}
        editing={sheet.editing}
        categories={ledger.categories}
        accounts={ledger.accounts}
        currency={ledger.currency}
        suggestions={sheetSuggestions}
        showSuggestions={placement !== 'off'}
        prefill={sheet.prefill}
        startKind={sheet.startKind}
        onClose={closeSheet}
      />

      <GoalsOverview
        open={goalsOpen}
        onClose={closeGoals}
        goals={ledger.goals}
        currency={ledger.currency}
        today={today}
        onNew={newGoal}
        onEdit={editGoal}
        onAddMoney={goalMoney}
      />
      <GoalSheet key={`goal-${goalSheet.n}`} open={goalSheet.open} goal={goalSheet.goal} today={today} onClose={closeGoalSheet} />
      <GoalMoneySheet key={`money-${moneySheet.n}`} open={moneySheet.open} goal={moneySheet.goal} currency={ledger.currency} onClose={closeMoneySheet} />

      <Welcome open={notice === 'welcome'} currency={ledger.currency} accounts={ledger.accounts} />
      <WhatsNew open={notice === 'whats-new' || whatsNewByHand} onClose={closeWhatsNew} />
    </div>
  )
}
