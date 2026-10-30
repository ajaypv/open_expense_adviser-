// @vitest-environment jsdom
import '../test/dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'
import { MonthSwitcher } from './MonthSwitcher'
import { PickerField, type PickerOption } from './PickerField'
import { TimeField } from './TimeField'

const options: PickerOption<string>[] = [
  { value: 'USD', label: 'USD', detail: 'US Dollar' },
  { value: 'EUR', label: 'EUR', detail: 'Euro' },
  { value: 'GBP', label: 'GBP', detail: 'British Pound' },
]

function Picker({ onChange = vi.fn(), initial = 'EUR' as string | null, many = false, ...rest }: Record<string, unknown>) {
  const [value, setValue] = useState<string | null>(initial as string | null)
  const list = many ? Array.from({ length: 12 }, (_, i) => ({ value: `C${i}`, label: `C${i}`, detail: i === 3 ? 'Special' : undefined })) : options
  return (
    <PickerField
      id="p"
      title="Currency"
      value={value}
      options={list}
      onChange={(v: string) => {
        setValue(v)
        ;(onChange as (v: string) => void)(v)
      }}
      className="field"
      {...rest}
    />
  )
}

describe('PickerField', () => {
  it('opens a list, and choosing an option applies it and closes the list', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Picker onChange={onChange} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'EUR' }))
    const sheet = screen.getByRole('dialog', { name: 'Currency' })
    expect(within(sheet).getByRole('radio', { name: /EUR/ })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(sheet).getByRole('radio', { name: /GBP/ }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('GBP')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'GBP' })).toBeInTheDocument()
  })

  it('closes without changing anything from the close button', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Picker onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'EUR' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a placeholder until something is chosen', async () => {
    const user = userEvent.setup()
    render(<Picker initial={null} placeholder="Choose…" />)
    await user.click(screen.getByRole('button', { name: 'Choose…' }))
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false')
  })

  it('does nothing when switched off', async () => {
    const user = userEvent.setup()
    render(<Picker disabled />)
    await user.click(screen.getByRole('button', { name: 'EUR' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('filters a long list by what is typed, including the detail line', async () => {
    const user = userEvent.setup()
    render(<Picker many initial="C0" />)
    await user.click(screen.getByRole('button', { name: 'C0' }))
    expect(screen.getAllByRole('radio')).toHaveLength(12)
    await user.type(screen.getByRole('searchbox'), 'special')
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: /C3/ })).toBeInTheDocument()
  })

  it('says so when nothing matches, and starts with a clear search each time it opens', async () => {
    const user = userEvent.setup()
    render(<Picker many initial="C0" />)
    await user.click(screen.getByRole('button', { name: 'C0' }))
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('Nothing matches “zzz”.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'C0' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getAllByRole('radio')).toHaveLength(12)
  })
})

describe('TimeField', () => {
  function Time({ value = '21:00', hour12 = true, onChange = vi.fn() }: { value?: string; hour12?: boolean; onChange?: (v: string) => void }) {
    const [v, setV] = useState(value)
    return (
      <TimeField
        id="t"
        title="Remind me at"
        value={v}
        hour12={hour12}
        onChange={(x) => {
          setV(x)
          onChange(x)
        }}
      />
    )
  }
  const open = async (user: ReturnType<typeof userEvent.setup>, label: string) => user.click(screen.getByRole('button', { name: label }))

  it('sets a new time from hour, minute and AM or PM', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Time onChange={onChange} />)
    await open(user, '9:00 PM')
    await user.click(screen.getByRole('button', { name: '7 o’clock' }))
    await user.click(screen.getByRole('button', { name: '30 minutes' }))
    await user.click(screen.getByRole('radio', { name: 'AM' }))
    expect(screen.getByText('7:30 AM', { selector: 'p' })).toBeInTheDocument() // live preview
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('07:30')
    expect(screen.getByRole('button', { name: '7:30 AM' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('puts midnight and noon on the right side of the day', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Time value="09:00" onChange={onChange} />)
    await open(user, '9:00 AM')
    await user.click(screen.getByRole('button', { name: '12 o’clock' }))
    await user.click(screen.getByRole('radio', { name: 'AM' }))
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    expect(onChange).toHaveBeenLastCalledWith('00:00')
    await open(user, '12:00 AM')
    await user.click(screen.getByRole('radio', { name: 'PM' }))
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    expect(onChange).toHaveBeenLastCalledWith('12:00')
  })

  it('keeps the hour when only AM or PM changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Time value="09:15" onChange={onChange} />)
    await open(user, '9:15 AM')
    await user.click(screen.getByRole('radio', { name: 'PM' }))
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    expect(onChange).toHaveBeenCalledWith('21:15')
  })

  it('changes nothing if closed without setting, and starts again from the saved time', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Time onChange={onChange} />)
    await open(user, '9:00 PM')
    await user.click(screen.getByRole('button', { name: '3 o’clock' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onChange).not.toHaveBeenCalled()
    await open(user, '9:00 PM')
    expect(screen.getByRole('button', { name: '9 o’clock' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('works on a 24-hour clock', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Time value="08:00" hour12={false} onChange={onChange} />)
    await open(user, '08:00')
    expect(screen.queryByRole('radio', { name: 'AM' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '23 o’clock' }))
    await user.click(screen.getByRole('button', { name: '45 minutes' }))
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    expect(onChange).toHaveBeenCalledWith('23:45')
  })

  it('keeps an odd minute that was set another way, and selects it', async () => {
    const user = userEvent.setup()
    render(<Time value="09:07" />)
    await open(user, '9:07 AM')
    expect(screen.getByRole('button', { name: '7 minutes' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('MonthSwitcher', () => {
  const active = new Set(['2025-12', '2026-10'])
  const setup = (month: string, onChange = vi.fn()) => {
    render(<MonthSwitcher month={month} currentMonth="2026-10" onChange={onChange} activeMonths={active} />)
    return { onChange, user: userEvent.setup() }
  }

  it('picks any month of the year from the sheet', async () => {
    const { onChange, user } = setup('2026-10')
    await user.click(screen.getByRole('button', { name: /Choose a month/ }))
    await user.click(screen.getByRole('button', { name: 'March 2026' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cannot pick a month that has not happened', async () => {
    const { onChange, user } = setup('2026-10')
    await user.click(screen.getByRole('button', { name: /Choose a month/ }))
    const november = screen.getByRole('button', { name: 'November 2026' })
    expect(november).toBeDisabled()
    await user.click(november)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves between years, only as far back as there is data, and never forward past this year', async () => {
    const { onChange, user } = setup('2026-10')
    await user.click(screen.getByRole('button', { name: /Choose a month/ }))
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous year' }))
    expect(screen.getByText('2025')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous year' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'December 2025, has transactions' }))
    expect(onChange).toHaveBeenCalledWith('2025-12')
  })

  it('marks months with transactions', async () => {
    const { user } = setup('2026-10')
    await user.click(screen.getByRole('button', { name: /Choose a month/ }))
    expect(screen.getByRole('button', { name: 'October 2026, has transactions' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'April 2026' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('returns to this month in one tap from anywhere else', async () => {
    const { onChange, user } = setup('2026-07')
    await user.click(screen.getByRole('button', { name: 'This month' }))
    expect(onChange).toHaveBeenCalledWith('2026-10')
  })

  it('steps a month at a time with the arrows, and stops at this month', async () => {
    const { onChange, user } = setup('2026-07')
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-06')
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-08')
  })

  it('has no next arrow to press at the current month', () => {
    setup('2026-10')
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'This month' })).toBeNull()
  })

  it('wraps across a year boundary', async () => {
    const { onChange, user } = setup('2026-01')
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(onChange).toHaveBeenCalledWith('2025-12')
  })
})

describe('A list inside another sheet', () => {
  it('closes only itself when something is chosen, not the sheet around it', async () => {
    const outerClosed = vi.fn()
    const user = userEvent.setup()
    render(
      <Dialog open onClose={outerClosed} labelledBy="outer-title">
        <h2 id="outer-title">Outer sheet</h2>
        <Picker />
      </Dialog>,
    )
    await user.click(screen.getByRole('button', { name: 'EUR' }))
    await user.click(await screen.findByRole('radio', { name: /GBP/ }))
    expect(outerClosed).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Outer sheet' })).toBeInTheDocument()
  })
})
