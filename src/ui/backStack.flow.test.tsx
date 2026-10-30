// @vitest-environment jsdom
import '../test/dom'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { backDepth, pushBackEntry, resetBackStack, useBackClose } from './backStack'
import { Dialog } from './Dialog'

/** Presses the browser's (or phone's) back button and lets the resulting event arrive. */
const pressBack = () =>
  act(async () => {
    history.back()
    await new Promise((r) => setTimeout(r, 25))
  })

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 25)))

describe('the back stack, on its own', () => {
  it('closes what was opened last when back is pressed, and only that', async () => {
    const first = vi.fn()
    const second = vi.fn()
    pushBackEntry(first)
    pushBackEntry(second)
    expect(backDepth()).toBe(2)
    await pressBack()
    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
    expect(backDepth()).toBe(1)
    await pressBack()
    expect(first).toHaveBeenCalledOnce()
    expect(backDepth()).toBe(0)
  })

  it('keeps a way to go back for the next one after closing the top one', async () => {
    const a = vi.fn()
    const b = vi.fn()
    const c = vi.fn()
    pushBackEntry(a)
    pushBackEntry(b)
    pushBackEntry(c)
    await pressBack()
    await pressBack()
    await pressBack()
    expect([a, b, c].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])
  })

  it('does not call the handler when it is closed some other way, such as a Close button', async () => {
    const close = vi.fn()
    const done = pushBackEntry(close)
    done()
    await settle()
    expect(close).not.toHaveBeenCalled()
    expect(backDepth()).toBe(0)
  })

  it('leaves the history as it found it once everything has closed itself', async () => {
    const before = history.length
    const done = pushBackEntry(() => {})
    done()
    await settle()
    // The extra step it added has been stepped back over, so a later back press is the app's own.
    expect(backDepth()).toBe(0)
    expect(history.length).toBeLessThanOrEqual(before + 1)
    const stray = vi.fn()
    pushBackEntry(stray)
    await pressBack()
    expect(stray).toHaveBeenCalledOnce() // and the next one still works as normal
  })

  it('closes the right thing when a lower one is closed while a higher one is still open', async () => {
    const lower = vi.fn()
    const upper = vi.fn()
    const closeLower = pushBackEntry(lower)
    pushBackEntry(upper)
    closeLower()
    expect(backDepth()).toBe(1)
    await pressBack()
    expect(upper).toHaveBeenCalledOnce()
    expect(lower).not.toHaveBeenCalled()
  })

  it('does nothing at all when nothing is open, so back leaves the app as the phone normally does', async () => {
    expect(backDepth()).toBe(0)
    const spy = vi.spyOn(history, 'pushState')
    await settle()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

function Toggle() {
  const [open, setOpen] = useState(false)
  useBackClose(open, () => setOpen(false))
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      {open && <p>panel</p>}
      {open && (
        <button type="button" onClick={() => setOpen(false)}>
          close
        </button>
      )}
    </>
  )
}

describe('useBackClose', () => {
  it('closes the panel when back is pressed, and then back is free again', async () => {
    const user = userEvent.setup()
    render(<Toggle />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByText('panel')).toBeInTheDocument()
    expect(backDepth()).toBe(1)
    await pressBack()
    expect(screen.queryByText('panel')).toBeNull()
    expect(backDepth()).toBe(0)
  })

  it('lets go of its place when closed with its own button, so back is not stuck', async () => {
    const user = userEvent.setup()
    render(<Toggle />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    await user.click(screen.getByRole('button', { name: 'close' }))
    await settle()
    expect(backDepth()).toBe(0)
  })

  it('can be opened and closed again and again without piling up', async () => {
    const user = userEvent.setup()
    render(<Toggle />)
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'open' }))
      await pressBack()
      expect(screen.queryByText('panel')).toBeNull()
    }
    expect(backDepth()).toBe(0)
  })
})

describe('after the page is reloaded with something open', () => {
  it('steps off the leftover step on start, so the first back press is not wasted', async () => {
    vi.resetModules()
    history.replaceState({ expenseTrackerBack: true }, '')
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    await import('./backStack')
    expect(back).toHaveBeenCalledOnce()
    back.mockRestore()
    history.replaceState(null, '')
  })

  it('does nothing on a normal start', async () => {
    vi.resetModules()
    history.replaceState(null, '')
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    await import('./backStack')
    expect(back).not.toHaveBeenCalled()
    back.mockRestore()
  })
})

describe('every sheet closes with back', () => {
  it('a Dialog calls its onClose when back is pressed', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} labelledBy="t">
        <h2 id="t">Title</h2>
      </Dialog>,
    )
    await settle()
    expect(backDepth()).toBe(1)
    await pressBack()
    expect(onClose).toHaveBeenCalled()
  })

  it('a Dialog that is not open takes no place in the back stack', async () => {
    resetBackStack()
    render(
      <Dialog open={false} onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
      </Dialog>,
    )
    await settle()
    expect(backDepth()).toBe(0)
  })

  it('two sheets, one inside the other, close one at a time', async () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <>
        <Dialog open onClose={outer} labelledBy="o">
          <h2 id="o">Outer</h2>
        </Dialog>
        <Dialog open onClose={inner} labelledBy="i">
          <h2 id="i">Inner</h2>
        </Dialog>
      </>,
    )
    await settle()
    expect(backDepth()).toBe(2)
    await pressBack()
    expect(inner).toHaveBeenCalled()
    expect(outer).not.toHaveBeenCalled()
  })
})
