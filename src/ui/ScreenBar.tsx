import { Icon } from './Icon'

/** The round button at the top right of a screen that opens Settings: the one place Settings is reached from. */
export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Settings"
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-[0_0_0_1px_var(--ring)] active:opacity-70 [@media(hover:hover)]:hover:bg-surface-2"
    >
      <Icon name="sliders" size={20} />
    </button>
  )
}

/**
 * The top of Activity and Insights, laid out like the top of Home: the name of the screen on the left in the title face, the round
 * Settings button on the right. Without a handler (a screen drawn on its own) there is only the title.
 */
export function ScreenBar({ title, onOpenSettings }: { title: string; onOpenSettings?: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 pt-3">
      <h1 className="type-greeting min-w-0 truncate">{title}</h1>
      {onOpenSettings && <SettingsButton onClick={onOpenSettings} />}
    </header>
  )
}
