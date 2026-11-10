import { useEffect, useRef } from 'react'
import type { ParsedExpense } from '../ingest/localParser'
import { isNativeApp } from '../native/platform'
import { paymentEntry } from './entry'
import { readPending, type PendingPayment } from './native'

/** While the app is on screen, how often it looks for a payment the Add button was pressed for. */
export const PAYMENT_POLL_MS = 10_000

/**
 * Puts the payments the person answered a pop-up for into the app: the ones whose Add button was pressed are added, and one whose
 * pop-up was touched opens the add form filled in (if there were several, the latest opens and the others are added as they were).
 * It looks when the app is opened or comes back to the front, and every few seconds while it is on screen, so that pressing Add
 * on a pop-up that came over the app shows up here at once. Only in the Android app; in a browser it does nothing.
 */
export function usePayments(onAdd: (entries: ParsedExpense[]) => Promise<unknown>, onOpen: (payment: PendingPayment) => void): void {
  const handlers = useRef({ onAdd, onOpen })
  useEffect(() => {
    handlers.current = { onAdd, onOpen }
  })

  useEffect(() => {
    if (!isNativeApp()) return
    let running = false
    let gone = false

    async function drain() {
      if (running || gone || document.visibilityState === 'hidden') return
      running = true
      try {
        const payments = await readPending()
        if (payments.length === 0) return
        const opened = payments.filter((p) => p.state === 'edit').at(-1)
        const toAdd = payments.filter((p) => p.state === 'add' || (p.state === 'edit' && p !== opened))
        const entries = toAdd.map(paymentEntry).filter((e): e is ParsedExpense => e !== null)
        if (entries.length > 0) await handlers.current.onAdd(entries)
        if (opened) handlers.current.onOpen(opened)
      } finally {
        running = false
      }
    }

    void drain()
    const onVisible = () => void drain()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => void drain(), PAYMENT_POLL_MS)
    return () => {
      gone = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
