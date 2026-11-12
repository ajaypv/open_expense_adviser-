// @vitest-environment jsdom
import '../test/dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../db/schema'
import { Welcome } from './Welcome'

afterEach(cleanup)

const mount = () => {
  render(<Welcome open currency="INR" accounts={[]} />)
  return userEvent.setup()
}
const go = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Continue' }))

describe('Welcome: three questions, one to a screen', () => {
  it('opens on the currency, with a bar of dots saying it is the first of three', () => {
    mount()
    expect(screen.getByRole('dialog', { name: /Which currency/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Question 1 of 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Currency' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Money you have today/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
  })

  it('goes on to the balance and then the budget, the last button being the one that starts', async () => {
    const user = mount()
    await go(user)
    expect(screen.getByRole('img', { name: 'Question 2 of 3' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Money you have today/)).toBeInTheDocument()
    await go(user)
    expect(screen.getByRole('img', { name: 'Question 3 of 3' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Monthly budget/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument()
    expect(screen.getByText(/Uber 230 yesterday/)).toBeInTheDocument()
  })

  it('goes back with what was typed still there', async () => {
    const user = mount()
    await go(user)
    await user.type(screen.getByLabelText(/Money you have today/), '5000')
    await go(user)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText(/Money you have today/)).toHaveValue('5000')
  })

  it('goes on with Enter, since each screen is a form', async () => {
    const user = mount()
    await go(user)
    await user.type(screen.getByLabelText(/Money you have today/), '100{Enter}')
    expect(screen.getByLabelText(/Monthly budget/)).toBeInTheDocument()
  })

  it('says so, on the screen of the box that is wrong, when a number is not a number', async () => {
    const user = mount()
    await go(user)
    await user.type(screen.getByLabelText(/Money you have today/), 'lots')
    await go(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Use numbers only')
    expect(screen.getByLabelText(/Money you have today/)).toBeInTheDocument() // still here
  })

  it('does not take a budget of nothing, and takes you back to a balance that is wrong, when it is the last that is pressed', async () => {
    const user = mount()
    await go(user)
    await user.type(screen.getByLabelText(/Money you have today/), '100')
    await go(user)
    await user.type(screen.getByLabelText(/Monthly budget/), '0')
    await user.click(screen.getByRole('button', { name: 'Get started' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use numbers only')
    expect(await db.settings.get('onboarded')).toBeUndefined()
  })

  it('saves nothing until the last screen, and leaving with Skip saves nothing but that it is done', async () => {
    const user = mount()
    await go(user)
    await user.type(screen.getByLabelText(/Money you have today/), '100')
    expect(await db.budgets.toArray()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(async () => expect((await db.settings.get('onboarded'))?.value).toBe(true))
    expect(await db.budgets.toArray()).toEqual([])
  })
})
