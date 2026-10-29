import { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { checkForUpdate } from './checkForUpdate'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwa() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null)
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined)

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh: () => setUpdateReady(true),
      onOfflineReady: () => setOfflineReady(true),
      onRegisteredSW: (_url, reg) => {
        registration.current = reg
      },
    })
    setApplyUpdate(() => () => void update(true))

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstallEvent(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }, [installEvent])

  /** Look for a newer version now, rather than waiting for the browser's own schedule. */
  const checkNow = useCallback(() => checkForUpdate(registration.current), [])

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true

  return {
    canInstall: installEvent !== null,
    install,
    /** iOS has no install prompt; the user must use Share → Add to Home Screen. */
    showIosHint: isIos && !isStandalone,
    updateReady,
    applyUpdate,
    checkNow,
    offlineReady,
  }
}
