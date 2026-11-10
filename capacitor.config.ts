import type { CapacitorConfig } from '@capacitor/cli'

// The Android app is the built web app (dist) inside a WebView. The data stays on the phone, as it does in the browser.
// The appId is the app's permanent identity on a phone: changing it later installs a second app instead of updating the first.
const config: CapacitorConfig = {
  appId: 'com.expensetracker.app',
  appName: 'Expense Tracker',
  webDir: 'dist',
  android: {
    // The page is served over https://localhost, so IndexedDB and the service worker behave as in a browser.
    backgroundColor: '#121314',
  },
}

export default config
