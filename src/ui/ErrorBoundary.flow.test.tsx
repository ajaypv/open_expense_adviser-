// @vitest-environment jsdom
import '../test/dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('kaboom')
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {}) // React logs the error it catches
})
afterEach(() => vi.restoreAllMocks())

describe('ErrorBoundary', () => {
  it('shows the app as usual when nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <p>All fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All fine')).toBeInTheDocument()
  })

  it('shows a message, and says the data is safe, instead of a blank screen', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('alert')).toHaveTextContent('Your data is safe on this device')
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeInTheDocument()
  })

  it('reloads the page when asked', async () => {
    const reload = vi.fn()
    render(
      <ErrorBoundary onReload={reload}>
        <Boom />
      </ErrorBoundary>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload the app' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
