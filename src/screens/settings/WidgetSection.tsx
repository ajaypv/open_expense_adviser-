import { useState } from 'react'
import { isAndroidApp } from '../../widget/native'
import { widgetsSupported } from '../../widget/support'
import { updateWidgetNow } from '../../widget/useWidgetSnapshot'
import { card, Group, Status, type Ledger } from './parts'

/**
 * The widget, and an honest account of where it can be. A web app can have one only in the Windows 11 Widgets Board, with
 * the app installed from Microsoft Edge; Android and iPhone give web apps no home-screen widgets at all. So in a phone browser this
 * says so, and points at what does work there (the shortcuts on the app icon); on Windows with Edge, and in the Android app, it
 * says how to add the widget, and has a button to bring it up to date.
 */
export function WidgetSection({ ledger }: { ledger: Ledger }) {
  const supported = widgetsSupported()
  const android = isAndroidApp()
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle')

  async function update() {
    setState('working')
    setState((await updateWidgetNow(ledger)) ? 'done' : 'failed')
  }

  return (
    <Group id="widget-h" title="Widget" status={<Status on={supported}>{supported ? 'Available here' : 'Not on this device'}</Status>}>
      <div className={`${card} space-y-3 p-4`}>
        <p>Shows what you have spent this month, where the month is heading and the next payment that leaves on its own.</p>
        {supported ? (
          <>
            {android ? (
              <ol className="list-decimal space-y-1 pl-5 text-ink-2">
                <li>Touch and hold an empty spot on your home screen, then choose Widgets.</li>
                <li>Find Expense Tracker, then touch and drag Spending onto the screen.</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-ink-2">
                <li>Install this app from Microsoft Edge: open its menu, then Apps, then Install this site as an app.</li>
                <li>Press the Windows key and W to open the Widgets Board.</li>
                <li>Choose the plus, find Expense Tracker, and add Spending.</li>
              </ol>
            )}
            <p className="text-ink-2">It updates whenever you open the app, and says when it last did.</p>
            <button type="button" onClick={() => void update()} disabled={state === 'working'} className="min-h-12 w-full rounded-full bg-surface-2 font-medium disabled:opacity-50">
              {state === 'working' ? 'Updating…' : 'Update the widget now'}
            </button>
            <p role="status" aria-live="polite" className="min-h-5 text-sm text-ink-2">
              {state === 'done' ? 'The widget has the latest figures.' : state === 'failed' ? (android ? 'Couldn’t update the widget. Try again.' : 'Couldn’t update the widget. Install the app first, then try again.') : ''}
            </p>
          </>
        ) : (
          <>
            <p className="text-ink-2">On a Windows 11 PC with Microsoft Edge, this app can show a widget in the Widgets Board.</p>
            <p className="text-ink-2">
              Android and iPhone do not let a web app put a widget on the home screen: only apps installed from a store can. What works on your phone is the app icon itself. Touch and hold it for Add expense and Add received money.
            </p>
          </>
        )}
      </div>
    </Group>
  )
}
