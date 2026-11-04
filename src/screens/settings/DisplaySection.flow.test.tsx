// @vitest-environment jsdom
import '../../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GLASS_PALETTES, PALETTES } from '../../theme/palettes'
import { DisplaySection } from './DisplaySection'

function mount(over: Partial<React.ComponentProps<typeof DisplaySection>> = {}) {
  const onPalette = vi.fn()
  const onTheme = vi.fn()
  render(<DisplaySection theme="system" onTheme={onTheme} palette="classic" onPalette={onPalette} {...over} />)
  return { onPalette, onTheme }
}

const group = () => screen.getByRole('radiogroup', { name: 'Colour theme' })

describe('The colour theme picker', () => {
  it('offers every theme as a choice with its name and a line about it', () => {
    mount()
    const radios = within(group()).getAllByRole('radio')
    expect(radios).toHaveLength(PALETTES.length)
    for (const p of PALETTES) {
      const radio = within(group()).getByRole('radio', { name: new RegExp(`^${p.name}`) })
      expect(radio.closest('label')).toHaveTextContent(p.detail)
    }
  })

  it('shows the chosen one as chosen, and only that one', () => {
    mount({ palette: 'forest' })
    expect(within(group()).getByRole('radio', { name: /^Forest/ })).toBeChecked()
    expect(within(group()).getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1)
  })

  it('passes on the one that is picked', () => {
    const { onPalette } = mount()
    fireEvent.click(within(group()).getByRole('radio', { name: /^Sunset/ }))
    expect(onPalette).toHaveBeenCalledExactlyOnceWith('sunset')
  })

  it('shows each theme in its own colours, before it is chosen, with the colours that carry meaning unchanged', () => {
    mount()
    const previews = Array.from(group().querySelectorAll<HTMLElement>('[data-preview]'))
    expect(previews.map((p) => p.dataset.palette)).toEqual(PALETTES.map((p) => p.id))
    // Pictures: the name and line beside them say the same, so they are hidden from a screen reader.
    expect(previews.every((p) => p.getAttribute('aria-hidden') === 'true')).toBe(true)
    // The dots are the accent and two category colours, which are the same whatever the theme.
    expect(previews[1].innerHTML).toContain('var(--s2)')
    expect(previews[1].innerHTML).toContain('var(--s3)')
  })

  it('sets the flat colours first and the glass and futuristic ones after, each under a heading', () => {
    mount()
    const text = group().textContent!
    expect(text.indexOf('Colours')).toBeLessThan(text.indexOf('Glass and futuristic'))
    const glass = within(group()).getByText('Glass and futuristic').nextElementSibling as HTMLElement
    expect(Array.from(glass.querySelectorAll('input')).length).toBe(GLASS_PALETTES.length)
    expect(within(glass).getByRole('radio', { name: /^Liquid Glass/ })).toBeInTheDocument()
    expect(within(glass).getByRole('radio', { name: /^Neon/ })).toBeInTheDocument()
  })

  it('shows a sample of each theme’s own typeface in its preview, and the app’s own for the flat ones', () => {
    mount()
    const font = (id: string) => (group().querySelector(`[data-preview][data-palette="${id}"]`) as HTMLElement).style.fontFamily
    expect(font('neon')).toContain('Exo 2 Variable')
    expect(font('aurora')).toContain('Space Grotesk Variable')
    expect(font('liquid')).toContain('Plus Jakarta Sans Variable')
    expect(font('pearl')).toContain('Geist Variable')
    expect(font('classic')).toContain('Manrope Variable')
    expect(group().querySelectorAll('[data-preview]')[0]).toHaveTextContent('₹12,480')
  })

  it('says which themes are always dark, on the card', () => {
    mount()
    for (const name of ['Aurora', 'Neon', 'Obsidian']) {
      expect(within(group()).getByRole('radio', { name: new RegExp(`^${name}`) }).closest('label')).toHaveTextContent('Always dark')
    }
    expect(within(group()).getByRole('radio', { name: /^Liquid Glass/ }).closest('label')).not.toHaveTextContent('Always dark')
    expect(within(group()).getByRole('radio', { name: /^Ocean/ }).closest('label')).not.toHaveTextContent('Always dark')
  })

  it('tells you, under Mode, that light and dark make no difference with a dark-only theme', () => {
    mount({ palette: 'aurora' })
    expect(document.querySelector('[data-note="dark-only"]')).toHaveTextContent('Aurora is always dark, so light and dark make no difference with it.')
  })

  it('says nothing of the kind with a theme that has both', () => {
    mount({ palette: 'liquid' })
    expect(document.querySelector('[data-note="dark-only"]')).toBeNull()
  })

  it('can be reached and changed with the keyboard, as radio buttons are', () => {
    mount()
    expect(within(group()).getAllByRole('radio').every((r) => r.tagName === 'INPUT')).toBe(true)
  })

  it('keeps light or dark as a choice of its own', () => {
    const { onTheme } = mount()
    const mode = screen.getByRole('radiogroup', { name: 'Mode' })
    for (const name of ['System', 'Light', 'Dark']) expect(within(mode).getByRole('radio', { name })).toBeInTheDocument()
    fireEvent.click(within(mode).getByRole('radio', { name: 'Dark' }))
    expect(onTheme).toHaveBeenCalledExactlyOnceWith('dark')
  })

  it('does nothing when no way to change it is given, rather than failing', () => {
    mount({ onPalette: undefined })
    expect(() => fireEvent.click(within(group()).getByRole('radio', { name: /^Ocean/ }))).not.toThrow()
  })
})
