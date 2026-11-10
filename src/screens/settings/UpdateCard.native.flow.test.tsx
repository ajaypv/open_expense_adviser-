// @vitest-environment jsdom
import '../../test/dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const app = vi.hoisted(() => ({ native: true }))
vi.mock('../../native/platform', () => ({ isNativeApp: () => app.native }))

import { UpdateCard } from './EssentialCards'

const props = () => ({ updateReady: false, onApplyUpdate: vi.fn(), onCheckUpdate: vi.fn().mockResolvedValue('latest' as const), onShowWhatsNew: vi.fn() })

beforeEach(() => {
  app.native = true
})

describe('App update, inside the Android app', () => {
  it('says how updates arrive, and that the data stays', () => {
    render(<UpdateCard {...props()} />)
    expect(screen.getByText(/arrives as a new download/)).toBeInTheDocument()
    expect(screen.getByText(/your data stays on this phone/)).toBeInTheDocument()
    expect(screen.getByText(/^Version /)).toBeInTheDocument()
  })

  it('offers no check for updates and no update button, which could find nothing', () => {
    render(<UpdateCard {...props()} />)
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull()
  })

  it('still has what’s new', () => {
    const p = props()
    render(<UpdateCard {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'What’s new in this version' }))
    expect(p.onShowWhatsNew).toHaveBeenCalledOnce()
  })
})

describe('App update, in a browser', () => {
  it('still has the check for updates', () => {
    app.native = false
    render(<UpdateCard {...props()} />)
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument()
  })
})
