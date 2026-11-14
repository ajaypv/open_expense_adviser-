import { setDisplay, useDisplay, type TextSize } from '../../data/display'
import type { NumberFormat } from '../../db/money'
import { DEFAULT_PALETTE, FLAT_PALETTES, fontStack, GLASS_PALETTES, PALETTES, type Palette, type PaletteId } from '../../theme/palettes'
import type { ThemePref } from '../../theme/useTheme'
import { Icon, type IconName } from '../../ui/Icon'
import { card, Group, IconCircle, RadioList, Switch } from './parts'

/** A setting's name with its round icon above the choices. */
function Label({ icon, children }: { icon: IconName; children: string }) {
  return (
    <p className="mb-2 flex items-center gap-2.5 font-semibold">
      <IconCircle icon={icon} size={32} />
      {children}
    </p>
  )
}

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

/** One theme as a card: a small page drawn in that theme's own colours, art, glass and typeface, then its name and a line. */
function PaletteCard({ p, palette, onPalette }: { p: Palette; palette: PaletteId; onPalette: (p: PaletteId) => void }) {
  return (
    <label className="relative flex cursor-pointer flex-col rounded-2xl bg-surface p-2 shadow-[0_0_0_1px_var(--ring)] transition-shadow has-[:checked]:shadow-[0_0_0_2.5px_var(--btn)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 motion-reduce:transition-none">
      <input type="radio" name="palette" className="sr-only" checked={palette === p.id} onChange={() => onPalette(p.id)} />
      <span data-palette={p.id} data-preview aria-hidden="true" className="block rounded-xl bg-bg p-2 shadow-[0_0_0_1px_var(--line)]" style={{ fontFamily: fontStack(p) }}>
        <span className="block rounded-lg bg-surface p-2 shadow-[0_0_0_1px_var(--ring)]">
          <span className="block text-[0.6875rem] font-medium leading-none text-ink-2">Spent</span>
          <span className="mt-1 block text-base font-bold leading-none tracking-tight text-ink tabular-nums">₹12,480</span>
          <span className="mt-2 flex items-center justify-between">
            <span className="h-4 w-10 rounded-full bg-btn" />
            <span className="flex gap-0.5">
              {['var(--accent)', 'var(--s2)', 'var(--s3)'].map((c) => (
                <span key={c} className="size-2 rounded-full" style={{ background: c }} />
              ))}
            </span>
          </span>
        </span>
        <span className="mt-1.5 flex gap-1">
          <span className="h-2 flex-1 rounded-full bg-surface-2" />
          <span className="h-2 flex-1 rounded-full bg-surface-2" />
          <span className="h-2 w-5 rounded-full bg-surface-2" />
        </span>
      </span>
      <span className="mt-2 flex items-center justify-between gap-2 px-1">
        <span className="font-semibold">{p.name}</span>
        <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-btn text-btn-ink opacity-0 transition-opacity [label:has(:checked)_&]:opacity-100 motion-reduce:transition-none">
          <Icon name="check" size={13} />
        </span>
      </span>
      <span className="px-1 pb-1 text-sm leading-snug text-ink-2">
        {p.detail}
        {p.darkOnly && <span className="mt-0.5 block text-xs font-medium">Always dark</span>}
      </span>
    </label>
  )
}

/**
 * The themes, as cards that each show a small page in its own look (drawn with that theme's own tokens, so what you see is
 * what you get, in light or dark as the app is now). The flat colour themes come first, then the glass and futuristic ones.
 * The category colours in every preview are the same, which is the point of them.
 */
function PalettePicker({ palette, onPalette }: { palette: PaletteId; onPalette: (p: PaletteId) => void }) {
  return (
    <div role="radiogroup" aria-label="Colour theme" className="space-y-5">
      {(
        [
          ['Colours', FLAT_PALETTES],
          ['Glass and futuristic', GLASS_PALETTES],
        ] as const
      ).map(([title, list]) => (
        <div key={title}>
          <p className="mb-2 px-1 font-medium">{title}</p>
          <div className="grid grid-cols-2 gap-3">
            {list.map((p) => (
              <PaletteCard key={p.id} p={p} palette={palette} onPalette={onPalette} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The colour theme, and the plain settings of how the app is read: light or dark, the size of the text, hiding amounts and how numbers are
 * grouped. The colour theme is on the Appearance page; the rest is on the Settings page itself, at hand, so `part` says which is wanted. With
 * none given, both are drawn.
 */
export function DisplaySection({
  theme,
  onTheme,
  palette = DEFAULT_PALETTE,
  onPalette = () => {},
  part = 'all',
}: {
  theme: ThemePref
  onTheme: (t: ThemePref) => void
  palette?: PaletteId
  onPalette?: (p: PaletteId) => void
  part?: 'all' | 'theme' | 'basics'
}) {
  const display = useDisplay()
  const darkOnly = PALETTES.find((p) => p.id === palette)?.darkOnly ?? false
  return (
    <>
      {part !== 'basics' && (
      <Group id="palette-h" title="Colour theme" hint="Pick the look that suits you. A theme changes the colours of the whole app; the glass ones also change the typeface and draw translucent cards.">
        {/* The sentence above names the choices; the cards show them. */}
        <PalettePicker palette={palette} onPalette={onPalette} />
      </Group>
      )}

      {part !== 'theme' && (
      <Group id="look-h" title="Mode, text and numbers">
        <div className={`${card} space-y-5 p-4`}>
          <div>
            <Label icon="sun">Mode</Label>
            <Segmented label="Mode" name="theme" value={theme} options={THEMES} onChange={onTheme} />
            {darkOnly && (
              <p data-note="dark-only" className="mt-2 text-ink-2">
                {`${PALETTES.find((p) => p.id === palette)!.name} is always dark, so light and dark make no difference with it.`}
              </p>
            )}
          </div>

          <div>
            <Label icon="sliders">Text size</Label>
            <Segmented label="Text size" name="text-size" value={display.textSize} options={TEXT_SIZES} onChange={(textSize) => setDisplay({ textSize })} />
            <p className="mt-2 text-ink-2">The whole app follows this size.</p>
          </div>

          <Switch
            icon="eyeOff"
            label="Hide amounts"
            detail="Replaces every amount with dots, so you can show your screen. Turn it off to see them again."
            checked={display.privacy}
            onChange={(privacy) => setDisplay({ privacy })}
          />
        </div>

        <div className="mt-3">
          <Label icon="swap">Number format</Label>
          <RadioList name="number-format" label="Number format" value={display.numberFormat} options={NUMBER_FORMATS} onChange={(numberFormat) => setDisplay({ numberFormat })} />
        </div>
      </Group>
      )}
    </>
  )
}
