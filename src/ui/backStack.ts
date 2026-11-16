import { useEffect, useRef } from 'react'

/**
 * The phone's back button, made to close what is open instead of leaving the app.
 *
 * A browser decides what "back" does from the page's history. So while anything closable is open (a tab other than
 * Home, a sheet, a picker, a panel), there is exactly one extra step in the history. Pressing back steps over it,
 * and we close the most recently opened thing. If something is still open underneath, the step is put back, so the
 * next press closes that, and so on. When nothing is open there is no extra step, and back leaves the app as usual.
 *
 * Closing something with its own button gives its place up, and steps back over the extra step quietly. That step back is made a
 * moment later, not at once: when one sheet closes as another opens in the same tap (the quick add handing over to the full form),
 * the new one simply takes over the step that is there, instead of a step back and a new step crossing in the browser.
 */

interface Entry {
  close: () => void
}

const stack: Entry[] = []
const GUARD = { expenseTrackerBack: true }

/** Back steps we took ourselves, to remove the extra step: not the person pressing back. */
let ours = 0
let listening = false
/** The extra step is to be removed once the current update has finished, unless something opens meanwhile and takes it over. */
let removing = false

function onPop(e: PopStateEvent) {
  if (ours > 0) {
    ours--
    return
  }
  const top = stack.pop()
  if (!top) {
    // Forward onto a leftover step with nothing open: step off it again.
    if ((e.state as { expenseTrackerBack?: boolean } | null)?.expenseTrackerBack) {
      ours++
      history.back()
    }
    return
  }
  // Something is still open underneath, so keep a step for the next back press to use.
  if (stack.length > 0) history.pushState(GUARD, '')
  top.close()
}

function listen() {
  if (listening) return
  window.addEventListener('popstate', onPop)
  listening = true
}

// A reload keeps the browser's history but forgets what was open. If the page starts on the extra step, step off
// it, so the first back press does something instead of seeming to do nothing.
if (typeof window !== 'undefined' && (history.state as { expenseTrackerBack?: boolean } | null)?.expenseTrackerBack) {
  listen()
  ours++
  history.back()
}

/** Registers something that back should close. Returns what to call when it is closed some other way. */
export function pushBackEntry(close: () => void): () => void {
  listen()
  const entry: Entry = { close }
  // Something opening in the same breath as another closed takes over the step that is there.
  if (removing) removing = false
  else if (stack.length === 0) history.pushState(GUARD, '')
  stack.push(entry)
  return () => {
    const i = stack.indexOf(entry)
    if (i === -1) return // back already closed it
    stack.splice(i, 1)
    if (stack.length === 0) {
      removing = true
      queueMicrotask(() => {
        if (!removing || stack.length > 0) return
        removing = false
        ours++
        history.back()
      })
    }
  }
}

/** How many things back would close, one after another. */
export const backDepth = () => stack.length

/** For tests: forget everything, as if the page had just loaded. */
export function resetBackStack() {
  stack.length = 0
  ours = 0
  removing = false
}

/**
 * While `active`, back closes this. Use it for anything the person can open and dismiss: call it with whether it is
 * open, and with the same function the Close button uses.
 */
export function useBackClose(active: boolean, close: () => void) {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!active) return
    return pushBackEntry(() => latest.current())
  }, [active])
}
