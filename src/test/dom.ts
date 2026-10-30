/**
 * Shared set-up for tests that click and type in a browser-like page. A test file opts in with
 * `// @vitest-environment jsdom` on its first line, then imports this file.
 *
 * It gives the page what jsdom lacks (the <dialog> behaviour, matchMedia, an in-memory IndexedDB),
 * clears the page between tests, and resets the database to a brand-new install.
 */
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { db } from '../db/schema'
import { resetGoalGlow } from '../ui/GoalsButton'
import { resetBackStack } from '../ui/backStack'
import { resetMotion } from '../ui/motion'

// <dialog>: opening sets the attribute, closing removes it and fires "close", as a browser does.
const dialog = HTMLDialogElement.prototype
dialog.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
dialog.show = dialog.showModal
dialog.close = function close(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

Element.prototype.scrollTo ??= function scrollTo() {}
Element.prototype.scrollIntoView ??= function scrollIntoView() {}

/** A new install: every table empty except the default categories and the first account. */
export async function resetDb() {
  db.close()
  await db.delete()
  await db.open()
}

beforeEach(async () => {
  resetBackStack()
  resetGoalGlow()
  resetMotion()
  localStorage.clear()
  await resetDb()
})

// Let saves that the app starts without waiting for (a place being attached, old trash being purged)
// finish before the next test replaces the database, or they would fail against a closed one.
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 30))

afterEach(async () => {
  cleanup()
  await settle()
})

// Older jsdom builds lack Blob.text(); the app reads chosen backup files with it.
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}
