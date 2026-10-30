// @vitest-environment jsdom
import '../test/dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { SecuritySection } from '../screens/settings/SecuritySection'
import { ToastProvider } from '../ui/toast'
import { LockScreen } from './LockScreen'
import { enableLock, getLockState, getPinRecord, lockNow, resetLockForTests, verifyPin } from './lock'

beforeEach(() => resetLockForTests())

const section = () =>
  render(
    <ToastProvider>
      <SecuritySection />
    </ToastProvider>,
  )

describe('App lock settings', () => {
  it('turns the lock on with a PIN, and stores only a salted hash of it', async () => {
    const user = userEvent.setup()
    section()
    await user.click(screen.getByRole('button', { name: 'Set a PIN' }))
    await user.type(screen.getByLabelText(/Choose a PIN/), '4821')
    await user.type(screen.getByLabelText('Enter it again'), '4821')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(getLockState().enabled).toBe(true))
    expect(getLockState().locked).toBe(false) // the person who just set it is let in
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('App lock is on'))
    const record = (await getPinRecord())!
    expect(record.length).toBe(4)
    expect(JSON.stringify(record)).not.toContain('4821')
    expect(await verifyPin('4821', record)).toBe(true)
    expect(await verifyPin('4822', record)).toBe(false)
    expect(await screen.findByRole('button', { name: 'Lock now' })).toBeInTheDocument()
  })

  it.each([
    ['too short', '12', '12', 'Use 4 to 8 digits.'],
    ['mismatched', '1234', '1235', 'The two PINs don’t match.'],
  ])('refuses a PIN that is %s', async (_what, pin, again, message) => {
    const user = userEvent.setup()
    section()
    await user.click(screen.getByRole('button', { name: 'Set a PIN' }))
    await user.type(screen.getByLabelText(/Choose a PIN/), pin)
    await user.type(screen.getByLabelText('Enter it again'), again)
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(getLockState().enabled).toBe(false)
  })

  it('only takes digits', async () => {
    const user = userEvent.setup()
    section()
    await user.click(screen.getByRole('button', { name: 'Set a PIN' }))
    await user.type(screen.getByLabelText(/Choose a PIN/), 'ab12-cd34')
    expect(screen.getByLabelText(/Choose a PIN/)).toHaveValue('1234')
  })

  it('warns that a forgotten PIN cannot be recovered, and lets the person back out', async () => {
    const user = userEvent.setup()
    section()
    await user.click(screen.getByRole('button', { name: 'Set a PIN' }))
    expect(screen.getByText(/forgotten PIN can’t be recovered/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Set a PIN' })).toBeInTheDocument()
    expect(getLockState().enabled).toBe(false)
  })

  it('locks straight away on request', async () => {
    await enableLock('1234', 60)
    const user = userEvent.setup()
    section()
    await user.click(await screen.findByRole('button', { name: 'Lock now' }))
    expect(getLockState().locked).toBe(true)
  })

  it('changes when the app locks again', async () => {
    await enableLock('1234', 60)
    const user = userEvent.setup()
    section()
    await user.click(await screen.findByRole('button', { name: 'Lock when I’m away' }))
    await user.click(await screen.findByRole('radio', { name: /Right away/ }))
    expect(getLockState().autoLockSeconds).toBe(0)
  })

  it('needs the current PIN to change it, then uses the new one', async () => {
    await enableLock('1234', 60)
    const user = userEvent.setup()
    section()
    await user.click(await screen.findByRole('button', { name: 'Change PIN' }))
    await user.type(screen.getByLabelText('Current PIN'), '9999')
    await user.type(screen.getByLabelText(/New PIN/), '5678')
    await user.type(screen.getByLabelText('Enter it again'), '5678')
    await user.click(screen.getAllByRole('button', { name: 'Change PIN' }).at(-1)!)
    expect(await screen.findByRole('alert')).toHaveTextContent('That isn’t your current PIN.')
    expect(await verifyPin('1234', (await getPinRecord())!)).toBe(true) // unchanged

    await user.clear(screen.getByLabelText('Current PIN'))
    await user.type(screen.getByLabelText('Current PIN'), '1234')
    await user.click(screen.getAllByRole('button', { name: 'Change PIN' }).at(-1)!)
    await waitFor(async () => expect(await verifyPin('5678', (await getPinRecord())!)).toBe(true))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('PIN changed'))
  })

  it('needs the current PIN to turn the lock off', async () => {
    await enableLock('1234', 60)
    const user = userEvent.setup()
    section()
    await user.click(await screen.findByRole('button', { name: 'Turn off app lock' }))
    await user.type(screen.getByLabelText('Current PIN'), '0000')
    await user.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That isn’t your current PIN.')
    expect(getLockState().enabled).toBe(true)

    await user.clear(screen.getByLabelText('Current PIN'))
    await user.type(screen.getByLabelText('Current PIN'), '1234')
    await user.click(screen.getByRole('button', { name: 'Turn off' }))
    await waitFor(() => expect(getLockState().enabled).toBe(false))
    expect(await getPinRecord()).toBeNull()
    expect(await screen.findByRole('button', { name: 'Set a PIN' })).toBeInTheDocument()
  })
})

describe('Lock screen', () => {
  const locked = async (pin = '1234', fails?: { count: number; until: number }) => {
    await enableLock(pin, 60) // turning the lock on resets the count of wrong tries, so set it after
    if (fails) localStorage.setItem('lock-fails', JSON.stringify(fails))
    lockNow()
    render(<LockScreen />)
    return userEvent.setup()
  }

  it('unlocks as soon as the last digit of the right PIN is typed', async () => {
    const user = await locked()
    expect(getLockState().locked).toBe(true)
    await user.type(screen.getByLabelText('PIN'), '1234')
    await waitFor(() => expect(getLockState().locked).toBe(false))
  })

  it('unlocks with the button too', async () => {
    const user = await locked()
    await waitFor(async () => expect(await getPinRecord()).not.toBeNull())
    // Typing fewer digits than the PIN has doesn't submit by itself; the button does.
    await user.type(screen.getByLabelText('PIN'), '123')
    expect(getLockState().locked).toBe(true)
    await user.type(screen.getByLabelText('PIN'), '4')
    await waitFor(() => expect(getLockState().locked).toBe(false))
  })

  it('says how many tries are left after a wrong PIN, and clears the box', async () => {
    const user = await locked()
    await user.type(screen.getByLabelText('PIN'), '0000')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Wrong PIN. 4 tries left before a short wait.'))
    expect(screen.getByLabelText('PIN')).toHaveValue('')
    expect(getLockState().locked).toBe(true)
  })

  it('makes the person wait after five wrong tries, and stops taking input', async () => {
    const user = await locked('1234', { count: 4, until: 0 })
    await user.type(screen.getByLabelText('PIN'), '0000')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Too many wrong tries\. Try again in \d+ seconds\./))
    expect(screen.getByLabelText('PIN')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled()
    expect(getLockState().locked).toBe(true)
  })

  it('does not let even the right PIN in during the wait', async () => {
    const user = await locked('1234', { count: 5, until: Date.now() + 30_000 })
    await act(async () => {})
    await user.type(screen.getByLabelText('PIN'), '1234')
    await waitFor(() => expect(getLockState().locked).toBe(true))
  })

  it('only takes digits, and no more than the longest PIN', async () => {
    const user = await locked()
    await user.type(screen.getByLabelText('PIN'), 'a1b2')
    expect(screen.getByLabelText('PIN')).toHaveValue('12')
  })

  it('keeps Unlock off until something is typed', async () => {
    await locked()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled()
  })

  it('only offers to erase everything once ERASE has been typed', async () => {
    const user = await locked()
    await user.click(screen.getByText('Forgot your PIN?'))
    expect(screen.getByRole('button', { name: 'Erase all' })).toBeDisabled()
    await user.type(screen.getByLabelText('Type ERASE to confirm'), 'eras')
    expect(screen.getByRole('button', { name: 'Erase all' })).toBeDisabled()
    await user.type(screen.getByLabelText('Type ERASE to confirm'), 'e')
    expect(screen.getByRole('button', { name: 'Erase all' })).toBeEnabled()
  })
})
