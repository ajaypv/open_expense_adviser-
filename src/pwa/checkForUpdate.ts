export type UpdateCheck = 'available' | 'latest' | 'unsupported' | 'offline' | 'error'

/** How long to wait for a newly found version to finish downloading. */
const DOWNLOAD_TIMEOUT_MS = 20_000

/**
 * Asks the browser to look for a newer version of the app, and says what it found. A new version
 * is "available" once it has downloaded and is waiting to take over; applying it is a separate step.
 */
export async function checkForUpdate(
  registration: ServiceWorkerRegistration | undefined,
  online: () => boolean = () => navigator.onLine,
): Promise<UpdateCheck> {
  if (!registration) return 'unsupported' // no service worker: dev mode, or a browser without support
  if (registration.waiting) return 'available' // already downloaded earlier
  if (!online()) return 'offline'

  try {
    await registration.update()
  } catch {
    return online() ? 'error' : 'offline'
  }
  if (registration.waiting) return 'available'

  const worker = registration.installing
  if (!worker) return 'latest'

  // A newer version was found and is still downloading; wait for it to be ready.
  return new Promise<UpdateCheck>((resolve) => {
    const finish = (result: UpdateCheck) => {
      clearTimeout(timer)
      worker.removeEventListener('statechange', onChange)
      resolve(result)
    }
    const onChange = () => {
      if (worker.state === 'installed' || worker.state === 'activated') finish('available')
      else if (worker.state === 'redundant') finish('error')
    }
    const timer = setTimeout(() => finish('error'), DOWNLOAD_TIMEOUT_MS)
    worker.addEventListener('statechange', onChange)
    onChange() // it may have finished between update() resolving and now
  })
}
