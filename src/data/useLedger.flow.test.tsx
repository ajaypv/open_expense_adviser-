// @vitest-environment jsdom
import '../test/dom'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '../db/schema'
import { useLedger } from './useLedger'

describe('useLedger', () => {
  it('is not "loaded" until every part has arrived, so nothing flashes in the wrong currency', async () => {
    await db.settings.put({ key: 'currency', value: 'USD' })
    await db.settings.put({ key: 'rates', value: { INR: 0.012 } })
    const seen: { loading: boolean; currency: string }[] = []
    const { result } = renderHook(() => {
      const ledger = useLedger()
      seen.push({ loading: ledger.loading, currency: ledger.currency })
      return ledger
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Every frame drawn as loaded already knew the currency the person chose.
    expect(seen.filter((s) => !s.loading).every((s) => s.currency === 'USD')).toBe(true)
  })

  it('uses rupees when the saved currency is not a real one, instead of failing on every amount', async () => {
    await db.settings.put({ key: 'currency', value: 'rupees!' })
    const { result } = renderHook(() => useLedger())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.currency).toBe('INR')
  })

  it('picks up a change made after it loaded', async () => {
    const { result } = renderHook(() => useLedger())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await db.settings.put({ key: 'currency', value: 'EUR' })
    await waitFor(() => expect(result.current.currency).toBe('EUR'))
  })
})
