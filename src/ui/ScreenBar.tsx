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

/** The round button beside Settings that opens your year as reels: a tile with a play mark, the same size and look as Settings. */
export function ReelsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Your year in reels"
      aria-haspopup="dialog"
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-[0_0_0_1px_var(--ring)] active:opacity-70 [@media(hover:hover)]:hover:bg-surface-2"
    >
      <Icon name="reels" size={20} />
    </button>
  )
}

/** The round buttons at the top right of a screen: your year as reels (when there is a year to show), then Settings, which is always last. */
export function HeaderActions({ onOpenSettings, onOpenReels }: { onOpenSettings?: () => void; onOpenReels?: () => void }) {
  if (!onOpenSettings && !onOpenReels) return null
  return (
    <div className="flex shrink-0 items-center gap-2">
      {onOpenReels && <ReelsButton onClick={onOpenReels} />}
      {onOpenSettings && <SettingsButton onClick={onOpenSettings} />}
    </div>
  )
}

/**
 * The top of Activity and Insights, laid out like the top of Home: the name of the screen on the left in the title face, the round
 * buttons on the right (reels, then Settings). Without a handler (a screen drawn on its own) there is only the title.
 */
export function ScreenBar({ title, onOpenSettings, onOpenReels }: { title: string; onOpenSettings?: () => void; onOpenReels?: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 pt-3">
      <h1 className="type-greeting min-w-0 truncate">{title}</h1>
      <HeaderActions onOpenSettings={onOpenSettings} onOpenReels={onOpenReels} />
    </header>
  )
}
