import { setDisplay, useDisplay, type TextSize } from '../../data/display'
import type { NumberFormat } from '../../db/money'
import type { ThemePref } from '../../theme/useTheme'
import { Icon, type IconName } from '../../ui/Icon'
import { card, Group, RadioList, Switch } from './parts'

const THEMES: { id: ThemePref; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'monitor' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
]

const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'default', label: 'Default' },
  { id: 'large', label: 'Large' },
  { id: 'xlarge', label: 'Largest' },
]

const NUMBER_FORMATS: { id: NumberFormat; label: string; detail: string }[] = [
  { id: 'auto', label: 'Match my device', detail: 'Uses your phone’s region settings.' },
  { id: 'indian', label: 'Indian grouping', detail: '₹1,00,000: lakhs and crores.' },
  { id: 'international', label: 'International grouping', detail: '₹100,000: thousands and millions.' },
]

/** One row of choices drawn as a segmented control. */
function Segmented<T extends string>({
  label,
  value,
  name,
  options,
  onChange,
}: {
  label: string
  value: T
  name: string
  options: { id: T; label: string; icon?: IconName }[]
  onChange: (id: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-[1.75rem] bg-surface-2 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <label
          key={o.id}
          className="flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full text-sm font-medium has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
        >
          <input type="radio" name={name} className="sr-only" checked={value === o.id} onChange={() => onChange(o.id)} />
          {o.icon && <Icon name={o.icon} size={20} />}
          {o.label}
        </label>
      ))}
    </div>
  )
}

export function DisplaySection({ theme, onTheme }: { theme: ThemePref; onTheme: (t: ThemePref) => void }) {
  const display = useDisplay()
  return (
    <Group id="look-h" title="Appearance">
      <div className={`${card} space-y-5 p-4`}>
        <Segmented label="Theme" name="theme" value={theme} options={THEMES} onChange={onTheme} />

        <div>
          <p className="mb-2 font-medium">Text size</p>
          <Segmented
            label="Text size"
            name="text-size"
            value={display.textSize}
            options={TEXT_SIZES}
            onChange={(textSize) => setDisplay({ textSize })}
          />
          <p className="mt-2 text-ink-2">
            The whole app follows this size.
          </p>
        </div>

        <Switch
          label="Hide amounts"
          detail="Replaces every amount with ₹•••• so the screen is safe to show. Turn it off to see them again."
          checked={display.privacy}
          onChange={(privacy) => setDisplay({ privacy })}
        />
      </div>

      <div className="mt-3">
        <RadioList
          name="number-format"
          label="Number format"
          value={display.numberFormat}
          options={NUMBER_FORMATS}
          onChange={(numberFormat) => setDisplay({ numberFormat })}
        />
      </div>
    </Group>
  )
}
