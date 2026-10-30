// @vitest-environment jsdom
import '../test/dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { db, type Goal } from '../db/schema'
import { GoalsButton } from './GoalsButton'
import { GoalsOverview } from './GoalsOverview'
import { GoalMoneySheet, GoalSheet } from './GoalSheets'
import { ToastProvider } from './toast'

const today = new Date(2026, 9, 30)

const addGoal = async (over: Partial<Goal> = {}) => {
  const id = (await db.goals.add({ name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: 1, ...over } as never)) as number
  return (await db.goals.get(id))!
}

describe('GoalSheet: making a goal', () => {
  const setup = (goal: Goal | null = null) => {
    const onClose = vi.fn()
    render(
      <ToastProvider>
        <GoalSheet open goal={goal} today={today} onClose={onClose} />
      </ToastProvider>,
    )
    return { onClose, user: userEvent.setup() }
  }

  it('saves the name, cost, what is set aside and the date', async () => {
    const { user, onClose } = setup()
    await user.type(screen.getByLabelText('What are you saving for?'), 'New phone')
    await user.type(screen.getByLabelText('How much does it cost?'), '60,000')
    await user.type(screen.getByLabelText('Saved so far'), '15000')
    await user.type(screen.getByLabelText('Date (optional)'), '2027-01-15')
    await user.click(screen.getByRole('button', { name: 'Save goal' }))
    await waitFor(async () => expect(await db.goals.count()).toBe(1))
    expect((await db.goals.toArray())[0]).toMatchObject({ name: 'New phone', targetMinor: 6_000_000, savedMinor: 1_500_000, dueDate: '2027-01-15' })
    expect(onClose).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Goal added: New phone'))
  })

  it('starts at nothing saved and with no date when those are left blank', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('What are you saving for?'), 'Gift')
    await user.type(screen.getByLabelText('How much does it cost?'), '2000')
    await user.click(screen.getByRole('button', { name: 'Save goal' }))
    await waitFor(async () => expect(await db.goals.count()).toBe(1))
    const g = (await db.goals.toArray())[0]
    expect(g.savedMinor).toBe(0)
    expect(g.dueDate).toBeUndefined()
  })

  it('fills the name from an idea', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Emergency fund' }))
    expect(screen.getByLabelText('What are you saving for?')).toHaveValue('Emergency fund')
  })

  it.each([
    ['no name', '', '500', '', 'Give the goal a name.'],
    ['no cost', 'Trip', '', '', 'Enter what it costs.'],
    ['a cost of zero', 'Trip', '0', '', 'Enter what it costs.'],
    ['a cost that is not a number', 'Trip', 'lots', '', 'Enter what it costs.'],
    ['a negative saved amount', 'Trip', '500', '-5', 'Saved so far can’t be below 0.'],
  ])('refuses %s, says why, and saves nothing', async (_what, name, cost, savedText, message) => {
    const { user, onClose } = setup()
    if (name) await user.type(screen.getByLabelText('What are you saving for?'), name)
    if (cost) await user.type(screen.getByLabelText('How much does it cost?'), cost)
    if (savedText) await user.type(screen.getByLabelText('Saved so far'), savedText)
    await user.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(await db.goals.count()).toBe(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clears the error once the field is corrected', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Save goal' }))
    await screen.findByRole('alert')
    await user.type(screen.getByLabelText('What are you saving for?'), 'T')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('GoalSheet: changing a goal', () => {
  it('shows the saved values and saves changes, including removing the date', async () => {
    const goal = await addGoal({ dueDate: '2027-01-15' })
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <GoalSheet open goal={goal} today={today} onClose={onClose} />
      </ToastProvider>,
    )
    expect(screen.getByLabelText('How much does it cost?')).toHaveValue('25000')
    expect(screen.getByLabelText('Saved so far')).toHaveValue('5000')
    await user.clear(screen.getByLabelText('How much does it cost?'))
    await user.type(screen.getByLabelText('How much does it cost?'), '30000')
    await user.clear(screen.getByLabelText('Date (optional)'))
    await user.click(screen.getByRole('button', { name: 'Save goal' }))
    await waitFor(async () => expect((await db.goals.get(goal.id))!.targetMinor).toBe(3_000_000))
    expect((await db.goals.get(goal.id))!.dueDate).toBeUndefined()
    expect(await db.goals.count()).toBe(1)
  })

  it('deletes a goal, and Undo brings it back as itself', async () => {
    const goal = await addGoal({ name: 'Trip', savedMinor: 40_000 })
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <GoalSheet open goal={goal} today={today} onClose={() => {}} />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete goal' }))
    await waitFor(async () => expect(await db.goals.count()).toBe(0))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Goal deleted'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await db.goals.get(goal.id)).toMatchObject({ name: 'Trip', savedMinor: 40_000 }))
  })
})

describe('GoalMoneySheet', () => {
  const setup = (goal: Goal) => {
    const onClose = vi.fn()
    render(
      <ToastProvider>
        <GoalMoneySheet open goal={goal} currency="INR" onClose={onClose} />
      </ToastProvider>,
    )
    return { onClose, user: userEvent.setup() }
  }

  it('adds money, says so, and Undo puts the old amount back', async () => {
    const goal = await addGoal()
    const { user, onClose } = setup(goal)
    await user.type(screen.getByLabelText('Amount'), '5,000')
    await user.click(screen.getByRole('button', { name: 'Add to goal' }))
    await waitFor(async () => expect((await db.goals.get(goal.id))!.savedMinor).toBe(1_000_000))
    expect(onClose).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added ₹5,000 to Goa trip'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await db.goals.get(goal.id))!.savedMinor).toBe(500_000))
  })

  it('takes money out, never below zero, and reports what actually came out', async () => {
    const goal = await addGoal({ savedMinor: 300_000 })
    const { user } = setup(goal)
    await user.click(screen.getByRole('radio', { name: 'Take out' }))
    await user.type(screen.getByLabelText('Amount'), '9000')
    await user.click(screen.getByRole('button', { name: 'Take out', hidden: false }))
    await waitFor(async () => expect((await db.goals.get(goal.id))!.savedMinor).toBe(0))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Took ₹3,000 out of Goa trip'))
  })

  it('fills in what is still needed, and says when that reaches the goal', async () => {
    const goal = await addGoal() // ₹25,000 cost, ₹5,000 saved
    const { user } = setup(goal)
    await user.click(screen.getByRole('button', { name: 'Fill the rest (₹20,000)' }))
    expect(screen.getByLabelText('Amount')).toHaveValue('20000')
    await user.click(screen.getByRole('button', { name: 'Add to goal' }))
    await waitFor(async () => expect((await db.goals.get(goal.id))!.savedMinor).toBe(2_500_000))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Goal reached: Goa trip'))
  })

  it('only offers to fill the rest when adding', async () => {
    const goal = await addGoal()
    const { user } = setup(goal)
    await user.click(screen.getByRole('radio', { name: 'Take out' }))
    expect(screen.queryByRole('button', { name: /Fill the rest/ })).toBeNull()
  })

  it('refuses an empty or zero amount', async () => {
    const goal = await addGoal()
    const { user, onClose } = setup(goal)
    await user.click(screen.getByRole('button', { name: 'Add to goal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount above 0.')
    expect((await db.goals.get(goal.id))!.savedMinor).toBe(500_000)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves money tracked on the goal only: no transaction is made', async () => {
    const goal = await addGoal()
    const { user } = setup(goal)
    await user.type(screen.getByLabelText('Amount'), '100')
    await user.click(screen.getByRole('button', { name: 'Add to goal' }))
    await waitFor(async () => expect((await db.goals.get(goal.id))!.savedMinor).toBe(510_000))
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('Goals overview', () => {
  const goal = (over: Partial<Goal> = {}): Goal => ({ id: 1, name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: 1, ...over })
  const setup = (goals: Goal[]) => {
    const handlers = { onClose: vi.fn(), onNew: vi.fn(), onEdit: vi.fn(), onAddMoney: vi.fn() }
    render(<GoalsOverview open goals={goals} currency="INR" today={today} {...handlers} />)
    return { ...handlers, user: userEvent.setup() }
  }

  it('starts a new goal from the first-goal prompt', async () => {
    const { user, onNew } = setup([])
    await user.click(screen.getByRole('button', { name: 'Set a goal' }))
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('starts another goal from the button at the top', async () => {
    const { user, onNew } = setup([goal()])
    await user.click(screen.getByRole('button', { name: 'New goal' }))
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('opens a goal to change it, or to add money', async () => {
    const g = goal()
    const { user, onEdit, onAddMoney } = setup([g])
    await user.click(screen.getByRole('button', { name: 'Edit goal Goa trip' }))
    expect(onEdit).toHaveBeenCalledWith(g)
    await user.click(screen.getByRole('button', { name: 'Add money to Goa trip' }))
    expect(onAddMoney).toHaveBeenCalledWith(g)
  })

  it('closes from its close button', async () => {
    const { user, onClose } = setup([goal()])
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows every goal at once', () => {
    setup(['A', 'B', 'C', 'D', 'E'].map((name, i) => goal({ id: i + 1, name })))
    for (const name of ['A', 'B', 'C', 'D', 'E']) expect(screen.getByText(name)).toBeInTheDocument()
  })

  it("reports each goal's progress, and the total, to a screen reader", () => {
    setup([goal()])
    expect(screen.getByRole('progressbar', { name: 'Goa trip saved' })).toHaveAttribute('aria-valuetext', '₹5,000 of ₹25,000 saved, 20%')
    expect(screen.getByRole('progressbar', { name: 'All goals saved' })).toHaveAttribute('aria-valuenow', '20')
  })
})

describe('Goals button', () => {
  it('opens the goals when tapped', async () => {
    const onClick = vi.fn()
    render(<GoalsButton goals={[]} onClick={onClick} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Goals. None yet' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('glows the first time it appears, and not when it appears again', () => {
    const first = render(<GoalsButton goals={[]} onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveClass('goal-glow')
    first.unmount()
    render(<GoalsButton goals={[]} onClick={() => {}} />) // coming back to Home later
    expect(screen.getByRole('button')).not.toHaveClass('goal-glow')
  })

  it('does not start glowing again when it only redraws', () => {
    const { rerender } = render(<GoalsButton goals={[]} onClick={() => {}} />)
    const before = screen.getByRole('button').className
    rerender(<GoalsButton goals={[{ id: 1, name: 'Trip', targetMinor: 100, savedMinor: 50, createdAt: 1 }]} onClick={() => {}} />)
    expect(screen.getByRole('button').className.includes('goal-glow')).toBe(before.includes('goal-glow'))
  })
})
