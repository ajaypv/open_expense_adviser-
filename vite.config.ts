import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// A project site on GitHub Pages is served from /<repo>/, so the deploy workflow sets BASE_PATH.
// Locally it stays '/'. It must start and end with a slash.
const base = process.env.BASE_PATH ?? '/'

// Shown in Settings so people can tell which version they are running. The commit comes from the
// deploy workflow (GITHUB_SHA); local builds say "local".
const version: string = JSON.parse(readFileSync('./package.json', 'utf8')).version
const build = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'
const buildDate = new Date().toISOString().slice(0, 10)

// The widget for the Windows 11 Widgets Board (no phone lets a web app add one). It is drawn by Windows from an Adaptive Cards
// template and the figures the app leaves for it; see src/widget. Held apart from the manifest object below because the
// plugin's manifest type does not know this member yet.
const widgets = {
  widgets: [
    {
      name: 'Spending',
      short_name: 'Spending',
      description: 'This month’s spending, where it is heading, and the next payment that leaves on its own.',
      tag: 'spending',
      template: 'spending',
      ms_ac_template: 'widgets/spending-template.json',
      data: 'widgets/spending-data.json',
      type: 'application/json',
      screenshots: [{ src: 'widgets/spending-screenshot.png', sizes: '300x304', label: 'The Spending widget, showing this month so far' }],
      icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
      auth: false,
      multiple: false,
    },
  ],
}

// https://vite.dev/config/
export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(build),
    __APP_BUILD_DATE__: JSON.stringify(buildDate),
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change far less often than app code. Separate chunks keep their hashes stable
        // between deploys, so an update only re-downloads the small app chunk, and the browser can
        // parse the chunks in parallel.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'dexie', test: /node_modules[\\/]dexie(-react-hooks)?[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Expense Tracker',
        short_name: 'Expenses',
        description: 'Local-first AI expense tracker. Your data stays on your device.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#121314',
        theme_color: '#121314',
        categories: ['finance', 'productivity'],
        ...widgets,
        // Long-press the icon to jump straight to the add form (handled by ?add= in App).
        shortcuts: [
          {
            name: 'Add expense',
            short_name: 'Expense',
            description: 'Log money you sent',
            url: `${base}?add=expense`,
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Add received money',
            short_name: 'Received',
            description: 'Log money you received',
            url: `${base}?add=income`,
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // json: the widget's template and placeholder data, which the worker fetches, so they must work offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // The first test in a file that opens a screen pays for loading it (the screens are fetched on first use), and with a
    // hundred and thirty files running at once that can pass five seconds on a busy machine or a slow runner. A real hang
    // still fails, only later.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
