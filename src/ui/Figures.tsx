/**
 * A sentence with its figures picked out in bold (the amounts, counts and shares, as the same bold sans every other amount is set in).
 * The words around them are left as they are. Each figure is found as written in the text, whole, and the first place it stands is
 * the one that is bolded.
 */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function Figures({ text, figures, every = false }: { text: string; figures: string[]; /** Bold every place a figure stands, not only the first. */ every?: boolean }) {
  const list = [...new Set(figures.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (list.length === 0) return <>{text}</>
  const found = new RegExp(`(?<![\\d,.])(${list.map(escape).join('|')})(?!\\d|[.,]\\d)`)
  const at = found.exec(text)
  if (!at) return <>{text}</>
  const rest = text.slice(at.index + at[0].length)
  return (
    <>
      {text.slice(0, at.index)}
      <b className="num text-ink">{at[0]}</b>
      <Figures text={rest} figures={every ? list : list.filter((f) => f !== at[0])} every={every} />
    </>
  )
}
