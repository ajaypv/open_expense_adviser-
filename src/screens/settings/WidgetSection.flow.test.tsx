// @vitest-environment jsdom
import '../../test/dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeLedger } from '../../test/ledger'

vi.mock('../../widget/useWidgetSnapshot', () => ({ updateWidgetNow: vi.fn() }))
const app = vi.hoisted(() => ({ android: false }))
vi.mock('../../widget/native', () => ({ isAndroidApp: () => app.android, publishToAndroid: vi.fn() }))

import { updateWidgetNow } from '../../widget/useWidgetSnapshot'
import { WidgetSection } from './WidgetSection'

const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'

const update = vi.mocked(updateWidgetNow)
const mount = (ua: string) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  render(<WidgetSection ledger={makeLedger()} />)
}

afterEach(() => {
  app.android = false
  vi.restoreAllMocks()
  update.mockReset()
})

describe('Settings: the widget, on Windows with Edge', () => {
  it('says it is available here, and what the widget shows', () => {
    mount(EDGE_WINDOWS)
    expect(screen.getByRole('heading', { name: 'Widget' })).toBeInTheDocument()
    expect(screen.getByText('Available here')).toBeInTheDocument()
    expect(screen.getByText(/what you have spent this month, where the month is heading and the next payment/)).toBeInTheDocument()
  })

  it('says how to add it, in three steps', () => {
    mount(EDGE_WINDOWS)
    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveTextContent('Install this app from Microsoft Edge')
    expect(steps[1]).toHaveTextContent('Windows key and W')
    expect(steps[2]).toHaveTextContent('add Spending')
  })

  it('says it updates when the app is opened, and says when it last did', () => {
    mount(EDGE_WINDOWS)
    expect(screen.getByText('It updates whenever you open the app, and says when it last did.')).toBeInTheDocument()
  })

  it('brings the widget up to date from a button, and says it has', async () => {
    update.mockResolvedValue(true)
    mount(EDGE_WINDOWS)
    fireEvent.click(screen.getByRole('button', { name: 'Update the widget now' }))
    expect(await screen.findByText('The widget has the latest figures.')).toBeInTheDocument()
    expect(update).toHaveBeenCalledOnce()
  })

  it('says what to do when it could not', async () => {
    update.mockResolvedValue(false)
    mount(EDGE_WINDOWS)
    fireEvent.click(screen.getByRole('button', { name: 'Update the widget now' }))
    expect(await screen.findByText('Couldn’t update the widget. Install the app first, then try again.')).toBeInTheDocument()
  })

  it('shows that it is working, and cannot be pressed again meanwhile', async () => {
    let finish!: (v: boolean) => void
    update.mockReturnValue(new Promise<boolean>((r) => (finish = r)))
    mount(EDGE_WINDOWS)
    fireEvent.click(screen.getByRole('button', { name: 'Update the widget now' }))
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled()
    finish(true)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update the widget now' })).toBeEnabled())
  })
})

describe('Settings: the widget, on a phone', () => {
  it('says it is not on this device, and why, without offering what cannot be done', () => {
    mount(PHONE)
    expect(screen.getByText('Not on this device')).toBeInTheDocument()
    expect(screen.getByText(/Android and iPhone do not let a web app put a widget on the home screen/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update the widget now' })).toBeNull()
    expect(screen.queryByText(/Windows key and W/)).toBeNull()
  })

  it('points at what does work: the shortcuts on the app icon', () => {
    mount(PHONE)
    expect(screen.getByText(/Touch and hold it for Add expense and Add received money/)).toBeInTheDocument()
  })

  it('says where it can work', () => {
    mount(PHONE)
    expect(screen.getByText('On a Windows 11 PC with Microsoft Edge, this app can show a widget in the Widgets Board.')).toBeInTheDocument()
  })
})

describe('Settings: the widget, in the Android app', () => {
  const mountApp = () => {
    app.android = true
    mount(PHONE)
  }

  it('says it is available here, and how to add it on the home screen', () => {
    mountApp()
    expect(screen.getByText('Available here')).toBeInTheDocument()
    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toHaveTextContent('Touch and hold an empty spot on your home screen, then choose Widgets')
    expect(steps[1]).toHaveTextContent('drag Spending or Timeline onto the screen')
  })

  it('says there is a Timeline widget too, in the Android app only', () => {
    mountApp()
    expect(screen.getByText(/second widget, Timeline, with the last few days/)).toBeInTheDocument()
  })

  it('does not tell anyone to use Edge or the Widgets Board', () => {
    mountApp()
    expect(screen.queryByText(/Microsoft Edge/)).toBeNull()
    expect(screen.queryByText(/Windows key and W/)).toBeNull()
    expect(screen.queryByText(/do not let a web app/)).toBeNull()
  })

  it('brings the widget up to date from a button, and says what to do when it could not', async () => {
    update.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    mountApp()
    fireEvent.click(screen.getByRole('button', { name: 'Update the widget now' }))
    expect(await screen.findByText('The widget has the latest figures.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Update the widget now' }))
    expect(await screen.findByText('Couldn’t update the widget. Try again.')).toBeInTheDocument()
  })
})
