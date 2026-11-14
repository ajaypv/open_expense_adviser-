import { SettingsButton } from './ScreenBar'

let dateFormat: Intl.DateTimeFormat | undefined

interface Props {
  today: Date
  /** Opens Settings, from the round button on the right. */
  onOpenSettings: () => void
}

/** "Good morning" until noon, "Good afternoon" until five, then "Good evening" (and through the small hours). */
export function greetingFor(now: Date): string {
  const h = now.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The top of Home, laid out like an app bar: a greeting and today's date on the left, the one action that belongs
 * to the whole app (Settings) on the right, as on every screen. The month switcher sits below, since it changes what the page shows
 * rather than being part of the title.
 */
export function HomeHeader({ today, onOpenSettings }: Props) {
  const date = (dateFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })).format(today)
  return (
    <header className="flex items-center justify-between gap-3 pt-3">
      <div className="min-w-0">
        <h1 className="type-greeting truncate">
          <span className="sr-only">Home. </span>
          {greetingFor(today)}
        </h1>
        <p className="truncate text-sm text-ink-2">{date}</p>
      </div>
      <SettingsButton onClick={onOpenSettings} />
    </header>
  )
}
