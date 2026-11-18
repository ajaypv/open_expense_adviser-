import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { createLaunchSplash } from './ui/launchSplash'

const launch = createLaunchSplash(document.querySelector<HTMLDialogElement>('#launch-splash')!)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary onError={launch.dismiss}>
      <App onReady={launch.ready} />
    </ErrorBoundary>
  </StrictMode>,
)
