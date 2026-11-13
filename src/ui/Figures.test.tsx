import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Figures } from './Figures'

const html = (text: string, figures: string[]) => renderToStaticMarkup(<Figures text={text} figures={figures} />)

describe('Figures', () => {
  it('sets each figure in bold and leaves the words as they are', () => {
    expect(html('₹450 over 13 days', ['₹450', '13'])).toBe('<b class="num text-ink">₹450</b> over <b class="num text-ink">13</b> days')
  })

  it('is plain text when it has no figures, or none of them is in the text', () => {
    expect(html('Nothing here', [])).toBe('Nothing here')
    expect(html('Nothing here', ['₹5'])).toBe('Nothing here')
  })

  it('bolds a whole figure and never a piece of a bigger one', () => {
    // The 6 of ₹6,000 and of 60% is not the 6 of "6 days".
    expect(html('6 days over ₹6,000 and 60%', ['6'])).toBe('<b class="num text-ink">6</b> days over ₹6,000 and 60%')
  })

  it('bolds the first place a figure stands, once', () => {
    expect(html('₹5 and ₹5', ['₹5'])).toBe('<b class="num text-ink">₹5</b> and ₹5')
  })

  it('finds a percentage or a multiple as written', () => {
    expect(html('about 164% more than weekdays', ['164%'])).toBe('about <b class="num text-ink">164%</b> more than weekdays')
    expect(html('about 2.5× what weekdays do', ['2.5×'])).toBe('about <b class="num text-ink">2.5×</b> what weekdays do')
  })
})
