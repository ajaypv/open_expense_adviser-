import { Icon, type IconName } from './Icon'

export type Tab = 'home' | 'activity' | 'insights' | 'settings'

export const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'activity', label: 'Activity', icon: 'list' },
  { id: 'insights', label: 'Insights', icon: 'bars' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
]

export function BottomNav({ current, onSelect }: { current: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <nav
      aria-label="Main"
      className="border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.id === current
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium short:min-h-11 ${
                  active ? 'text-ink' : 'text-muted'
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full ${
                    active ? 'bg-surface-2' : ''
                  }`}
                >
                  <Icon name={tab.icon} size={21} />
                </span>
                <span className="short:sr-only">{tab.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
