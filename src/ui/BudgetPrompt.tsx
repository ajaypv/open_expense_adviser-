/**
 * The invitation to set a monthly budget, for someone who has not. It sits lower on Home, after the cash flow and the
 * payments coming up, so it never comes between the numbers that answer "where do I stand". Once a budget is set it
 * is gone, and the progress shows in the spending overview instead.
 */
export function BudgetPrompt({ onSetBudget }: { onSetBudget: () => void }) {
  return (
    <section aria-label="Budget" className="mt-3 rounded-3xl bg-surface-2/60 p-5">
      <p className="font-medium">Your budget</p>
      <p className="mt-0.5 text-ink-2">Set a monthly budget to see how much you have left.</p>
      <button type="button" onClick={onSetBudget} className="mt-3 min-h-11 rounded-full bg-surface-2 px-4 font-medium">
        Set budget
      </button>
    </section>
  )
}
