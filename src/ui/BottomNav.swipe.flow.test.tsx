// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomNav } from './BottomNav'

/** A touch (or mouse) pointer event with the fields the bar reads. */
function pointer(type: 'pointerdown' | 'pointerup' | 'pointercancel', x: number, y: number, pointerType = 'touch') {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  return e
}

/** A finger down on `target` at (0, 0) and lifted at (dx, dy). */
function swipe(target: Element, dx: number, dy = 0, pointerType = 'touch') {
  fireEvent(target, pointer('pointerdown', 0, 0, pointerType))
  fireEvent(target, pointer('pointerup', dx, dy, pointerType))
}

function setup(withSwipe = true) {
  const onSelect = vi.fn()
  const onSwipe = vi.fn()
  render(<BottomNav current="home" onSelect={onSelect} goals={[]} onOpenGoals={() => {}} onSwipe={withSwipe ? onSwipe : undefined} />)
  return { onSelect, onSwipe, home: screen.getByRole('button', { name: 'Home' }), insights: screen.getByRole('button', { name: 'Insights' }) }
}

describe('BottomNav: swiping along the bar', () => {
  it('says left when the finger goes left, and right when it goes right', () => {
    const { onSwipe, home } = setup()
    swipe(home, -80)
    expect(onSwipe).toHaveBeenLastCalledWith('left')
    swipe(home, 80)
    expect(onSwipe).toHaveBeenLastCalledWith('right')
    expect(onSwipe).toHaveBeenCalledTimes(2)
  })

  it('does not press the tab the finger ends on', () => {
    const { onSelect, onSwipe, home, insights } = setup()
    swipe(home, -80)
    // The click the browser sends after a drag is swallowed.
    fireEvent.click(insights)
    expect(onSwipe).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still selects a tab on a plain tap', () => {
    const { onSelect, onSwipe, insights } = setup()
    swipe(insights, 4, 2)
    fireEvent.click(insights)
    expect(onSwipe).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith('insights')
  })

  it('ignores a short drag, and a drag that is more up and down than sideways', () => {
    const { onSwipe, home } = setup()
    swipe(home, -30)
    swipe(home, -80, 70)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('ignores a mouse, and a touch that was cancelled', () => {
    const { onSwipe, home } = setup()
    swipe(home, -80, 0, 'mouse')
    fireEvent(home, pointer('pointerdown', 0, 0))
    fireEvent(home, pointer('pointercancel', -80, 0))
    fireEvent(home, pointer('pointerup', -80, 0))
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('does nothing, and claims no touch gesture, where nobody listens', () => {
    const { onSelect, home } = setup(false)
    swipe(home, -80)
    fireEvent.click(home)
    expect(onSelect).toHaveBeenCalledWith('home')
    expect(screen.getByRole('navigation', { name: 'Main' }).className).not.toContain('touch-pan-y')
  })

  it('leaves vertical scrolling to the browser while it listens for sideways swipes', () => {
    setup()
    expect(screen.getByRole('navigation', { name: 'Main' }).className).toContain('touch-pan-y')
  })
})
