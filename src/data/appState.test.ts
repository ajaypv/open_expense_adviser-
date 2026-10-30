import { describe, expect, it } from 'vitest'
import { startupNotice } from './appState'

const base = { loading: false, hasData: false, onboarded: false, seenVersion: null as string | null, version: '0.3.0' }

describe('startupNotice', () => {
  it('shows nothing while things are still loading', () => {
    expect(startupNotice({ ...base, loading: true })).toBeNull()
    expect(startupNotice({ ...base, onboarded: undefined })).toBeNull()
    expect(startupNotice({ ...base, seenVersion: undefined })).toBeNull()
  })

  it('welcomes someone with no data who has not been welcomed', () => {
    expect(startupNotice(base)).toBe('welcome')
  })

  it('does not welcome someone who already has data, and tells them what is new instead', () => {
    expect(startupNotice({ ...base, hasData: true })).toBe('whats-new')
  })

  it('shows what is new once per version', () => {
    const existing = { ...base, hasData: true, onboarded: true }
    expect(startupNotice({ ...existing, seenVersion: '0.2.0' })).toBe('whats-new')
    expect(startupNotice({ ...existing, seenVersion: '0.3.0' })).toBeNull()
  })

  it('does not repeat itself for a brand-new person: finishing the welcome marks the version as seen', () => {
    expect(startupNotice({ ...base, onboarded: true, hasData: false, seenVersion: '0.3.0' })).toBeNull()
  })

  it('keeps welcoming someone who closed the app before finishing, until they do', () => {
    expect(startupNotice({ ...base, onboarded: false, hasData: false, seenVersion: null })).toBe('welcome')
  })
})
