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
const box = (text: string) => screen.getByText(text).closest('.toast')!

const realMatchMedia = window.matchMedia
const reducedMotion = (on: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => {
  vi.useRealTimers()
  window.matchMedia = realMatchMedia
})

describe('toast: it is brief', () => {
  it('goes away by itself after about three seconds when it only says something, shrinking away first', () => {
    open({ message: 'Saved' })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    wait(2900)
    expect(box('Saved')).not.toHaveClass('island-leave')
    wait(150) // the time is up: it starts to shrink away
    expect(box('Saved')).toHaveClass('island-leave')
    wait(400)
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('stays a little longer, but still not long, when it carries an Undo', () => {
    open({ message: 'Deleted', actionLabel: 'Undo', onAction: () => {} })
    wait(3200)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
    expect(box('Deleted')).not.toHaveClass('island-leave')
    wait(1500)
    wait(400)
    expect(screen.queryByText('Deleted')).toBeNull()
  })

  it('goes at once, without shrinking, when the person has asked for less motion', () => {
    reducedMotion(true)
    open({ message: 'Saved' })
    wait(3100)
    expect(screen.queryByText('Saved')).toBeNull()
  })
})

describe('toast: it shows where the money went', () => {
  it('has an icon for what it is about, in the colour of the category', () => {
    open({ message: 'Added ₹20 to Other', icon: 'tag', color: 'var(--s4)' })
    const icon = box('Added ₹20 to Other').querySelector('[data-icon]') as HTMLElement
    expect(icon.getAttribute('data-icon')).toBe('tag')
    expect(icon.style.getPropertyValue('--c')).toBe('var(--s4)')
    expect(icon.querySelector('svg')).not.toBeNull()
  })

  it('has a tick when it was given no icon', () => {
    open({ message: 'Saved' })
    expect((box('Saved').querySelector('[data-icon]') as HTMLElement).getAttribute('data-icon')).toBe('check')
  })

  it('keeps the icon out of what a screen reader says, since the words already say it', () => {
    open({ message: 'Added ₹20 to Other', icon: 'tag' })
    expect(box('Added ₹20 to Other').querySelector('[data-icon]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Added ₹20 to Other')
  })

  it('opens from the top of the screen like an island, with the icon and the words animating in', () => {
    open({ message: 'Saved' })
    expect(box('Saved')).toHaveClass('island')
    expect(box('Saved').querySelector('.island-icon')).not.toBeNull()
    expect(box('Saved').querySelector('.island-text')).not.toBeNull()
    expect(screen.getByRole('status').className).toMatch(/\btop-/)
  })
})

describe('toast: while it is being read or used', () => {
  it('stays while a finger or pointer is on it, and leaves a moment after it lets go', () => {
    open({ message: 'Deleted', actionLabel: 'Undo', onAction: () => {} })
    fireEvent.pointerEnter(box('Deleted'))
    wait(60_000)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
    fireEvent.pointerLeave(box('Deleted'))
    wait(1900)
    expect(box('Deleted')).not.toHaveClass('island-leave')
    wait(200)
    wait(400)
    expect(screen.queryByText('Deleted')).toBeNull()
  })

  it('comes back if a finger lands on it while it is already shrinking away', () => {
    open({ message: 'Saved' })
    wait(3100)
    expect(box('Saved')).toHaveClass('island-leave')
    fireEvent.pointerEnter(box('Saved'))
    expect(box('Saved')).not.toHaveClass('island-leave')
    wait(60_000)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('stays while its button has keyboard focus', () => {
    open({ message: 'Deleted', actionLabel: 'Undo', onAction: () => {} })
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.focus(undo)
    wait(60_000)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
    fireEvent.blur(undo)
    wait(2100)
    wait(400)
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
    wait(2500)
    fireEvent.click(screen.getByRole('button', { name: 'show' }))
    wait(2500)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(box('First')).not.toHaveClass('island-leave')
  })
})
