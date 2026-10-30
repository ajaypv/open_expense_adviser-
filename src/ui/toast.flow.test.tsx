// @vitest-environment jsdom
import '../test/dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast, type ToastOptions } from './toast'

function Show({ options }: { options: ToastOptions }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast(options)}>
      show
    </button>
  )
}

const mount = (options: ToastOptions) =>
  render(
    <ToastProvider>
      <Show options={options} />
    </ToastProvider>,
  )

const open = (options: ToastOptions) => {
  mount(options)
  fireEvent.click(screen.getByRole('button', { name: 'show' }))
}
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => vi.useRealTimers())

describe('toast: how long it stays', () => {
  it('goes away by itself after a few seconds when it only says something', () => {
    open({ message: 'Saved' })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    wait(5900)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    wait(200)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('stays longer when it carries an Undo, since that may be the only way back', () => {
    open({ message: 'Deleted', actionLabel: 'Undo', onAction: () => {} })
    wait(8000)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
    wait(1200)
    expect(screen.queryByText('Deleted')).toBeNull()
  })
})

describe('toast: while it is being read or used', () => {
  const toastBox = () => screen.getByText('Deleted').closest('.toast')!

  it('stays while a finger or pointer is on it, and leaves a moment after it lets go', () => {
    open({ message: 'Deleted', actionLabel: 'Undo', onAction: () => {} })
    fireEvent.pointerEnter(toastBox())
    wait(60_000)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
    fireEvent.pointerLeave(toastBox())
    wait(2900)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
    wait(200)
    expect(screen.queryByText('Deleted')).toBeNull()
  })

  it('stays while its button has keyboard focus', () => {
    open({ message: 'Deleted', actionLabel: 'Undo', onAction: () => {} })
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.focus(undo)
    wait(60_000)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
    fireEvent.blur(undo)
    wait(3100)
    expect(screen.queryByText('Deleted')).toBeNull()
  })

  it('runs the action and closes when the button is used', () => {
    const onAction = vi.fn()
    open({ message: 'Deleted', actionLabel: 'Undo', onAction })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledOnce()
    expect(screen.queryByText('Deleted')).toBeNull()
  })

  it('a newer message replaces the older one and starts its own countdown', () => {
    open({ message: 'First' })
    wait(5000)
    fireEvent.click(screen.getByRole('button', { name: 'show' }))
    wait(5000)
    expect(screen.getByText('First')).toBeInTheDocument()
  })
})
