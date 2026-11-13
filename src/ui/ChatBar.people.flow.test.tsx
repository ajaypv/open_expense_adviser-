// @vitest-environment jsdom
import '../test/dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Person } from '../db/schema'
import { ChatBar } from './ChatBar'

const people: Person[] = [
  { id: 1, name: 'Shweta Rao', phone: '+91 98765 43210', createdAt: 1 },
  { id: 2, name: 'Ankit Verma', createdAt: 2 },
  { id: 3, name: 'Shetty Meera', createdAt: 3 },
]

function setup(over: Partial<React.ComponentProps<typeof ChatBar>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true)
  render(<ChatBar onSubmit={onSubmit} onOpenForm={vi.fn()} people={people} {...over} />)
  return { onSubmit, user: userEvent.setup(), box: () => screen.getByLabelText('Add a transaction') as HTMLTextAreaElement }
}

const options = () => within(screen.getByRole('listbox', { name: 'People' })).getAllByRole('option')

describe('Input bar: @ and a name', () => {
  it('lists the people who fit as soon as an @ and a few letters are typed', async () => {
    const { user, box } = setup()
    await user.click(box())
    await user.type(box(), '@shw')
    expect(options().map((o) => o.textContent)).toEqual(['Shweta Rao+91 98765 43210'])
    await user.clear(box())
    await user.type(box(), '@sh')
    expect(options().map((o) => o.textContent)).toEqual(['Shweta Rao+91 98765 43210', 'Shetty Meera'])
  })

  it('lists the people sent to most recently when only the @ is typed', async () => {
    const { user, box } = setup()
    await user.click(box())
    await user.type(box(), '@')
    expect(options()).toHaveLength(3)
  })

  it('fills the whole name in when one is tapped, and leaves the caret ready for the amount', async () => {
    const { user, box } = setup()
    await user.click(box())
    await user.type(box(), '@shw')
    await user.click(within(options()[0]).getByRole('button'))
    expect(box()).toHaveValue('@Shweta Rao ')
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.keyboard('500')
    expect(box()).toHaveValue('@Shweta Rao 500')
  })

  it('works in the middle of a line, and keeps what comes after', async () => {
    const { user, box } = setup()
    await user.click(box())
    await user.type(box(), '500 to @shw')
    await user.click(within(options()[0]).getByRole('button'))
    expect(box()).toHaveValue('500 to @Shweta Rao ')
  })

  it('chooses with the arrow keys and Enter, without sending the line', async () => {
    const { user, box, onSubmit } = setup()
    await user.click(box())
    await user.type(box(), '@sh')
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(box()).toHaveValue('@Shetty Meera ')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('still sends on Enter when no name was chosen from the list', async () => {
    const { user, box, onSubmit } = setup()
    await user.click(box())
    await user.type(box(), '@shw 500{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('@shw 500')
  })

  it('closes with Escape', async () => {
    const { user, box } = setup()
    await user.click(box())
    await user.type(box(), '@sh')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('offers nobody for a name that fits no one, an address, or once the amount is being typed', async () => {
    const { user, box } = setup()
    await user.click(box())
    await user.type(box(), '@zzz')
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.clear(box())
    await user.type(box(), 'me@sh')
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.clear(box())
    await user.type(box(), '@Shweta Rao 5')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('offers nothing for an ordinary line', async () => {
    const { user, box } = setup()
    await user.click(box())
    await user.type(box(), '450 lunch at Cafe')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('offers nothing when there is nobody yet, and still takes the text', async () => {
    const { user, box, onSubmit } = setup({ people: [] })
    await user.click(box())
    await user.type(box(), '@sh 100{Enter}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onSubmit).toHaveBeenCalledWith('@sh 100')
  })

  it('goes away when the bar loses focus', async () => {
    const { user, box } = setup()
    await user.click(box())
    await user.type(box(), '@sh')
    await user.click(screen.getByRole('button', { name: 'Add an expense' }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
