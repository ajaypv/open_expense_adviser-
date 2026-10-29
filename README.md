# Open Expense Adviser

A local-first expense tracker you install on your phone as a PWA (Android and iOS). Everything is stored on the device. There is no account and no server.

Type what you spent or received in the bar at the bottom, as you would say it: `450 lunch at Cafe`, `Uber 230 yesterday`, `Salary 80000`.

## Features

- Chat-bar logging with an offline parser, plus a full add form
- Money sent and received, with an estimated balance that stays hidden until you reveal it
- Home, Activity, Insights and Settings screens, in light and dark themes
- Spending pace, daily, category and weekday charts
- Budget tracking and CSV / JSON export
- Works offline once installed

## Stack

React 19, Vite, TypeScript, Tailwind CSS v4, Dexie (IndexedDB) and vite-plugin-pwa (Workbox).

## Run it

```
npm install
npm run dev        # development
npm test           # unit tests
npm run build && npm run preview   # production build, installable as a PWA
```

## Roadmap

An AI assistant that uses your own API key, AI-generated charts, and reminders.
