import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, parseLocalDate } from '../db/money'
import { BILL_ICON, BILL_LABELS } from '../insights/billSplit'
import { yearsWithSpending, yearStory, type YearStory } from '../insights/story'
import { categoryIcon } from './categoryIcon'
import { Dialog } from './Dialog'
import { Icon, type IconName } from './Icon'
import { useCountWhen } from './motion'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  open: boolean
  onClose: () => void
  ledger: Ledger
  today: Date
}

let monthFormat: Intl.DateTimeFormat | undefined
let weekdayFormat: Intl.DateTimeFormat | undefined
let dayFormat: Intl.DateTimeFormat | undefined
const monthName = (m: number) => (monthFormat ??= new Intl.DateTimeFormat(undefined, { month: 'long' })).format(new Date(2023, m, 1))
const weekdayName = (i: number) => (weekdayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'long' })).format(new Date(2023, 0, 2 + i)) // 2 Jan 2023 was a Monday
const dayLabel = (date: string) => (dayFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' })).format(parseLocalDate(date))
const percent = (share: number) => (share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`)

/** A number that counts up when its tile comes to the front, landing exactly on the figure. */
function Money({ minor, currency, active, delay = 250 }: { minor: number; currency: string; active: boolean; delay?: number }) {
  const value = useCountWhen(minor, active, delay)
  return <>{formatMoney(value === minor ? minor : Math.round(value / 100) * 100, currency)}</>
}

/** The tile's frame: its own deep colour, a ghost of its icon, and what is in it rising in once it is the one in view. */
function Reel({ id, index, active, hue, icon, eyebrow, title, last, onNext, children }: { id: string; index: number; active: boolean; hue: string; icon: IconName; eyebrow: string; title: string; last?: boolean; onNext: () => void; children: ReactNode }) {
  return (
    <section
      data-reel={id}
      data-index={index}
      data-active={active}
      aria-labelledby={`reel-${id}`}
      className="reel relative flex h-dvh snap-start snap-always flex-col justify-center overflow-hidden px-7 pb-24 pt-28 text-white"
      style={{ '--hue': hue } as CSSProperties}
    >
      <span aria-hidden="true" className="reel-ghost pointer-events-none absolute -bottom-10 -right-10 text-white">
        <Icon name={icon} size={260} />
      </span>
      <p className="reel-in text-sm font-semibold uppercase tracking-[0.14em] text-white/75" style={{ '--d': '0ms' } as CSSProperties}>
        {eyebrow}
      </p>
      <h2 id={`reel-${id}`} className="reel-in mt-3 text-[clamp(1.75rem,8vw,2.5rem)] font-extrabold leading-[1.05] tracking-tight" style={{ '--d': '90ms' } as CSSProperties}>
        {title}
      </h2>
      {children}
      {!last && (
        <button type="button" onClick={onNext} aria-label="Next" className="reel-next absolute inset-x-0 bottom-6 mx-auto flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm active:bg-white/25">
          <Icon name="chevDown" size={22} />
        </button>
      )}
    </section>
  )
}

/** A line under the headline, rising in a beat after it. */
function Line({ children, delay = 600, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <p className={`reel-in mt-4 max-w-[30ch] text-[1.1875rem] leading-snug text-white/85 [&_b]:font-extrabold [&_b]:text-white ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </p>
  )
}

const BIG = 'reel-in num mt-6 block text-[clamp(2.75rem,15vw,4.5rem)] font-extrabold leading-none tracking-tight tabular-nums'

/** The tiles a year's story has, in order, each one skipped when there is nothing to say for it. */
function tilesFor(s: YearStory, categoryById: Ledger['categoryById'], currency: string, today: Date) {
  const money = (m: number) => formatMoney(m, currency)
  const top = s.categories[0]
  const topName = top ? (top.name ?? categoryById.get(top.categoryId)?.name ?? 'Spending') : ''
  const hottest = s.priciestMonth
  const tiles: { id: string; node: (ctx: { index: number; active: boolean; next: () => void; last: boolean }) => ReactNode }[] = []

  tiles.push({
    id: 'start',
    node: ({ index, active, next, last }) => (
      <Reel id="start" index={index} active={active} hue="var(--s7)" icon="spark" eyebrow="Your year" title={`${s.year}, in spending`} last={last} onNext={next}>
        <span className={BIG} style={{ '--d': '300ms' } as CSSProperties}>
          <Money minor={s.totalMinor} currency={currency} active={active} />
        </span>
        <Line delay={700}>{`spent over ${s.count} ${s.count === 1 ? 'expense' : 'expenses'}, about ${money(s.perDayMinor)} a day.`}</Line>
        <p className="reel-in mt-10 flex items-center gap-2 text-sm font-medium text-white/70" style={{ '--d': '1000ms' } as CSSProperties}>
          <span aria-hidden="true" className="reel-nudge">
            <Icon name="arrowDown" size={16} />
          </span>
          Scroll to see it
        </p>
      </Reel>
    ),
  })

  if (top) {
    tiles.push({
      id: 'category',
      node: ({ index, active, next, last }) => (
        <Reel id="category" index={index} active={active} hue="var(--s1)" icon={categoryIcon(topName)} eyebrow="Where it went" title={`${topName} took the biggest bite.`} last={last} onNext={next}>
          <span className={BIG} style={{ '--d': '300ms' } as CSSProperties}>
            <Money minor={top.totalMinor} currency={currency} active={active} />
          </span>
          <Line delay={650}>
            <b>{percent(top.share)}</b>
            {' of everything you spent this year.'}
          </Line>
          <ul aria-label="Your biggest categories" className="mt-7 space-y-3">
            {s.categories.map((c, i) => {
              const name = c.name ?? categoryById.get(c.categoryId)?.name ?? 'Other'
              return (
                <li key={c.key ?? c.categoryId} className="reel-in" style={{ '--d': `${800 + i * 90}ms` } as CSSProperties}>
                  <div className="flex items-baseline justify-between gap-3 text-[0.9375rem] font-semibold">
                    <span className="truncate">{name}</span>
                    <span className="num shrink-0 text-white/85">{money(c.totalMinor)}</span>
                  </div>
                  <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-white/15">
                    <span className="reel-bar block h-full rounded-full bg-white" style={{ width: `${Math.max(4, (c.totalMinor / top.totalMinor) * 100)}%`, '--d': `${900 + i * 90}ms` } as CSSProperties} />
                  </div>
                </li>
              )
            })}
          </ul>
        </Reel>
      ),
    })
  }

  if (s.phone) {
    const p = s.phone
    tiles.push({
      id: 'phone',
      node: ({ index, active, next, last }) => (
        <Reel id="phone" index={index} active={active} hue="var(--s3)" icon="recharge" eyebrow="Phone bills" title="Staying connected cost you" last={last} onNext={next}>
          <span className={BIG} style={{ '--d': '300ms' } as CSSProperties}>
            <Money minor={p.totalMinor} currency={currency} active={active} />
          </span>
          <Line delay={650}>
            {`${p.count} ${p.count === 1 ? 'payment' : 'payments'} on recharges and phone bills, about `}
            <b>{money(p.perMonthMinor)}</b>
            {` a month, which is ${percent(p.share)} of your year.`}
          </Line>
        </Reel>
      ),
    })
  }

  const highest = Math.max(...s.months)
  tiles.push({
    id: 'months',
    node: ({ index, active, next, last }) => (
      <Reel id="months" index={index} active={active} hue="var(--s2)" icon="bars" eyebrow="Month by month" title={`${monthName(hottest!.month)} was the heaviest.`} last={last} onNext={next}>
        <span className={BIG} style={{ '--d': '300ms' } as CSSProperties}>
          <Money minor={hottest!.totalMinor} currency={currency} active={active} />
        </span>
        <div role="img" aria-label={`Spending each month: ${s.months.map((m, i) => `${monthName(i)} ${money(m)}`).join(', ')}`} className="mt-8 flex h-28 items-end gap-1.5">
          {s.months.map((m, i) => (
            <span key={i} className="flex h-full flex-1 flex-col justify-end">
              <span
                className="reel-col block w-full rounded-t-md"
                style={{ height: `${m > 0 ? Math.max(5, (m / highest) * 100) : 2}%`, background: i === hottest!.month ? '#fff' : 'rgb(255 255 255 / 0.35)', '--d': `${700 + i * 40}ms` } as CSSProperties}
              />
            </span>
          ))}
        </div>
        <div aria-hidden="true" className="mt-1.5 flex gap-1.5 text-center text-xs font-medium text-white/70">
          {s.months.map((_, i) => (
            <span key={i} className="flex-1">
              {monthName(i).slice(0, 1)}
            </span>
          ))}
        </div>
        {s.cheapestMonth && (
          <Line delay={1100}>
            {`${monthName(s.cheapestMonth.month)} was the lightest, at `}
            <b>{money(s.cheapestMonth.totalMinor)}</b>.
          </Line>
        )}
      </Reel>
    ),
  })

  if (s.biggest) {
    const b = s.biggest
    const where = b.merchant || categoryById.get(b.categoryId)?.name || 'one payment'
    tiles.push({
      id: 'biggest',
      node: ({ index, active, next, last }) => (
        <Reel id="biggest" index={index} active={active} hue="var(--s8)" icon="tag" eyebrow="Your biggest buy" title="One payment stood out." last={last} onNext={next}>
          <span className={BIG} style={{ '--d': '300ms' } as CSSProperties}>
            <Money minor={b.totalMinor} currency={currency} active={active} />
          </span>
          <Line delay={650}>
            <b>{where}</b>
            {`, on ${dayLabel(b.date)}.`}
          </Line>
        </Reel>
      ),
    })
  }

  if (s.favourite) {
    const f = s.favourite
    tiles.push({
      id: 'favourite',
      node: ({ index, active, next, last }) => (
        <Reel id="favourite" index={index} active={active} hue="var(--s5)" icon="pin" eyebrow="Your regular spot" title={`${f.name}, again and again.`} last={last} onNext={next}>
          <span className={BIG} style={{ '--d': '300ms' } as CSSProperties}>
            {f.count}×
          </span>
          <Line delay={650}>
            {`You paid them ${f.count} times, `}
            <b>{money(f.totalMinor)}</b>
            {' in all.'}
          </Line>
        </Reel>
      ),
    })
  }

  if (s.busiestWeekday) {
    const w = s.busiestWeekday
    const high = Math.max(...s.weekdays)
    tiles.push({
      id: 'weekday',
      node: ({ index, active, next, last }) => (
        <Reel id="weekday" index={index} active={active} hue="var(--s4)" icon="sun" eyebrow="Your day" title={`${weekdayName(w.weekday)}s cost you the most.`} last={last} onNext={next}>
          <span className={BIG} style={{ '--d': '300ms' } as CSSProperties}>
            <Money minor={w.totalMinor} currency={currency} active={active} />
          </span>
          <div role="img" aria-label={`Spending on each weekday: ${s.weekdays.map((m, i) => `${weekdayName(i)} ${money(m)}`).join(', ')}`} className="mt-8 flex h-24 items-end gap-2">
            {s.weekdays.map((m, i) => (
              <span key={i} className="flex h-full flex-1 flex-col justify-end">
                <span className="reel-col block w-full rounded-t-md" style={{ height: `${m > 0 ? Math.max(5, (m / high) * 100) : 2}%`, background: i === w.weekday ? '#fff' : 'rgb(255 255 255 / 0.35)', '--d': `${700 + i * 60}ms` } as CSSProperties} />
              </span>
            ))}
          </div>
          <div aria-hidden="true" className="mt-1.5 flex gap-2 text-center text-xs font-medium text-white/70">
            {s.weekdays.map((_, i) => (
              <span key={i} className="flex-1">
                {weekdayName(i).slice(0, 3)}
              </span>
            ))}
          </div>
        </Reel>
      ),
    })
  }

  if (s.bills && s.bills.parts.length > 0) {
    const b = s.bills
    tiles.push({
      id: 'bills',
      node: ({ index, active, next, last }) => (
        <Reel id="bills" index={index} active={active} hue="var(--s6)" icon="receipt" eyebrow="Bills, recharges and EMIs" title="What you had to pay." last={last} onNext={next}>
          <span className={BIG} style={{ '--d': '300ms' } as CSSProperties}>
            <Money minor={b.totalMinor} currency={currency} active={active} />
          </span>
          <Line delay={650}>
            <b>{percent(b.shareOfMonth)}</b>
            {' of your year went on them.'}
          </Line>
          <ul aria-label="What the bills were" className="mt-6 space-y-2.5">
            {b.parts.map((p, i) => (
              <li key={p.kind} className="reel-in flex items-center gap-3 text-[0.9375rem] font-semibold" style={{ '--d': `${800 + i * 90}ms` } as CSSProperties}>
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Icon name={BILL_ICON[p.kind]} size={18} />
                </span>
                <span className="min-w-0 flex-1 truncate">{BILL_LABELS[p.kind]}</span>
                <span className="num shrink-0">{money(p.totalMinor)}</span>
              </li>
            ))}
          </ul>
        </Reel>
      ),
    })
  }

  const left = s.receivedMinor > 0 ? s.receivedMinor - s.totalMinor : null
  tiles.push({
    id: 'end',
    node: ({ index, active, next, last }) => (
      <Reel id="end" index={index} active={active} hue="var(--s7)" icon="flag" eyebrow={`That is ${s.year}`} title={s.year === today.getFullYear() ? 'And the year is not over.' : 'That was your year.'} last={last} onNext={next}>
        {left !== null && (
          <Line delay={500}>
            {`You received `}
            <b>{money(s.receivedMinor)}</b>
            {` and spent `}
            <b>{money(s.totalMinor)}</b>
            {left >= 0 ? `, leaving ${money(left)}.` : `, ${money(-left)} more than came in.`}
          </Line>
        )}
        <div className="reel-in mt-10 flex flex-wrap gap-3" style={{ '--d': '800ms' } as CSSProperties}>
          <button type="button" data-reel-replay className="min-h-12 rounded-full bg-white px-6 font-semibold text-black active:opacity-80">
            Watch again
          </button>
        </div>
      </Reel>
    ),
  })

  return tiles
}

/**
 * Your year in spending as a set of full-screen tiles you scroll through, one at a time, like reels: the total, the category that took the
 * biggest bite, what went on phone bills, the heaviest month, the biggest buy, the place paid most, the weekday, and what the bills came to.
 * Each tile snaps into place and plays in (the figures count up, the bars grow) when it comes to the front; a row of marks at the top shows
 * how far through you are, and the year can be changed when more than one has spending. A tile with nothing to say is left out. It reads the
 * money sent only, and says everything in words as well as in the pictures.
 */
function Reels({ onClose, ledger, today }: Omit<Props, 'open'>) {
  const { expenses, income, categoryById, recurring, currency } = ledger
  const years = useMemo(() => yearsWithSpending(expenses), [expenses])
  const thisYear = today.getFullYear()
  const [year, setYear] = useState(() => (years.includes(thisYear) ? thisYear : (years[0] ?? thisYear)))
  const story = useMemo(() => yearStory(expenses, income, categoryById, recurring, year, today), [expenses, income, categoryById, recurring, year, today])
  const tiles = useMemo(() => (story ? tilesFor(story, categoryById, currency, today) : []), [story, categoryById, currency, today])

  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  // Where it cannot tell which tile is in front (no IntersectionObserver), they all show in full.
  const watching = typeof IntersectionObserver !== 'undefined'

  useEffect(() => {
    const root = scroller.current
    if (!root || !watching) return
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index))
      },
      { root, threshold: 0.6 },
    )
    root.querySelectorAll('[data-reel]').forEach((el) => seen.observe(el))
    return () => seen.disconnect()
  }, [tiles, watching])

  // A new year starts again at the first tile.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
    setActive(0)
  }, [year])

  const goTo = (i: number) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)
    el?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div className="relative h-dvh bg-black">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div role="progressbar" aria-label="How far through your year" aria-valuemin={1} aria-valuemax={Math.max(tiles.length, 1)} aria-valuenow={active + 1} className="flex gap-1">
          {tiles.map((t, i) => (
            <span key={t.id} data-mark={i <= active ? 'done' : 'todo'} className="h-1 flex-1 rounded-full" style={{ background: i <= active ? '#fff' : 'rgb(255 255 255 / 0.3)', transition: 'background 0.3s' }} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          {years.length > 1 ? (
            <label className="pointer-events-auto relative flex min-h-11 items-center gap-1 rounded-full bg-white/15 pl-4 pr-3 text-base font-semibold backdrop-blur-sm">
              <span className="sr-only">Year</span>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="appearance-none bg-transparent pr-5 font-semibold text-white outline-none [&>option]:text-black">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute right-3">
                <Icon name="chevDown" size={16} />
              </span>
            </label>
          ) : (
            <span className="rounded-full bg-white/15 px-4 py-2 text-base font-semibold backdrop-blur-sm">{year}</span>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm active:bg-white/25">
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        role="region"
        aria-label="Your year in spending, one tile at a time"
        tabIndex={0}
        className="reels h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-reel-replay]')) goTo(0)
        }}
      >
        {tiles.length === 0 ? (
          <section className="flex h-dvh flex-col justify-center px-7 text-white">
            <h2 id="reel-none" className="text-3xl font-extrabold">{`Nothing spent in ${year} yet.`}</h2>
          </section>
        ) : (
          tiles.map((t, i) => <Fragment key={`${year}-${t.id}`}>{t.node({ index: i, active: !watching || active === i, next: () => goTo(i + 1), last: i === tiles.length - 1 })}</Fragment>)
        )}
      </div>
    </div>
  )
}

export function YearReels({ open, onClose, ledger, today }: Props) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="reels-title" variant="page">
      <h1 id="reels-title" className="sr-only">
        Your year in spending
      </h1>
      {open && <Reels onClose={onClose} ledger={ledger} today={today} />}
    </Dialog>
  )
}
