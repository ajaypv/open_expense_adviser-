import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')
const app = readFileSync('src/App.tsx', 'utf8')

/**
 * Visually hidden controls (the switches and radio buttons that use `sr-only`) are positioned out of the flow.
 * With no positioned ancestor they sit at their natural spot on the *page*, not inside the scrolling area, so on
 * a long screen like Settings the page itself grows taller and scrolls: the whole app, tab bar and all, slides up
 * and leaves a black gap. jsdom has no layout, so these check the two rules that prevent it.
 */
describe('the page does not scroll, only the screen inside it', () => {
  it('makes the scrolling area the containing block for the hidden controls inside it', () => {
    const main = app.match(/<main\s+className="([^"]*)"/)?.[1] ?? ''
    expect(main.split(/\s+/)).toContain('relative')
    expect(main.split(/\s+/)).toContain('overflow-y-auto')
  })

  it('stops the page itself from scrolling, whatever ends up below the screen', () => {
    const rule = css.match(/html,\s*body,\s*#root\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/height:\s*100%/)
    expect(rule).toMatch(/overflow:\s*hidden/)
  })
})

describe('a hidden control stays beside the label it belongs to', () => {
  it('anchors every label that wraps a visually hidden input, so focusing it can never scroll the page', () => {
    // Tapping "Remind me to log" focuses its hidden switch; if that sits at the bottom of the page the browser
    // scrolls the page to it, and the whole app slides out of view.
    expect(css).toMatch(/label:has\(input\.sr-only\)\s*\{[^}]*position:\s*relative/)
  })
})
