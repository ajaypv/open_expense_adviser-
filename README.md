# Open Expense Adviser

A local-first expense tracker you install on your phone as a PWA (Android and iOS). Everything is stored on the device. There is no account and no server. The one thing that leaves the phone is the optional map in Insights: when you press **Show map**, its pictures are fetched from OpenStreetMap, which tells them roughly which area you are looking at. Your transactions are never sent.

Type what you spent or received in the bar at the bottom, as you would say it: `450 lunch at Cafe`, `Uber 230 yesterday`, `Salary 80000`.

## Features

- Chat-bar logging with an offline parser, plus a full add form
- Money sent and received, with an estimated balance that stays hidden until you reveal it
- Home, Activity, Insights and Settings screens, in light and dark themes
- A cinematic launch: the original three-fold logo fades/scales in, expands into a full-screen green light bloom, then dissolves into the ready app. A cold launch takes about 2.5 seconds; repeat loads in the same tab and reduced-motion users get a short fade. The minimal welcome keeps its clearly labelled Continue button.
- Home's Timeline has softly layered water and a shaded duck on quiet days, with a floating wake and landing ripples when tapped. Insights has detailed gold coins in a dimensional wood-and-brass treasure chest with a raised, hinged lid, wood grain and soft shadows; tilt your phone or drag through the coins to move them. These illustrations stay still with reduced motion enabled.
- Spending by category as bubbles sized by share, a donut with a legend, or a ranked list; the last 12 months as hatched pill bars with the change from the month before
- Spending pace (scroll through months and compare up to three), daily, category and weekday charts
- A globe of where each month's spending happened, drawn on the phone with no network
- A map of where each month's spending happened (OpenStreetMap, opt-in, only when you ask for it)
- Regular payments in Insights: what they cost a month and a year, what is left to pay this month, the next 30 days, what is due next, and spending that looks regular but is not set up yet
- What keeps coming back: the habits and monthly bills you pay again and again
- A trail of what changed your balance (by source, with the latest entries), and a label on entries added from regular payments or imported
- Budget tracking and CSV / JSON export
- Works offline once installed

### Motion in the illustrations

Phone tilt and movement drive the Timeline water and duck, and the coins in Insights. Sensor directions follow the screen in portrait and landscape. Tilt is smoothed, tiny movement noise is ignored, and old acceleration fades out rather than continuing to push the artwork. Coins respond to both sideways and vertical movement and use fixed simulation steps for consistent behavior at different screen refresh rates.

On iPhone, the first tap requests motion permission. Without permission or sensors, the illustrations use gentle automatic movement; with reduced motion enabled, they stay still. Browsers that only provide acceleration including gravity use a filtered movement estimate.

## How the chat bar understands what you type

There is no AI and no network call. A small set of rules in [`src/ingest/localParser.ts`](src/ingest/localParser.ts) runs on the device, in this order:

1. **Date.** Words like `yesterday`, `3 days ago`, `last friday`, `5th`, `28 oct` or `01/10/2026` are found, removed from the text and used as the date. With none, it is today.
2. **Amount.** Numbers are read with `₹`, `Rs`, `450/-`, `18k`, `2 lakh`, `1 crore` and commas (`80,000`). With several numbers, the one with a currency mark wins, otherwise the largest.
3. **Money in or out.** `salary`, `received`, `refund`, `credited`, `cashback`, `bonus`, `got paid`, `paid me` and `got … from` mean money came in. Anything else is spending. Wages you pay are spending: `maid salary 8000`, `salary to driver`.
4. **Name.** Filler words (`spent`, `paid`, `on`, `at`, `to`, `for`, `the`) are dropped. Payment words (`cash`, `card`, `UPI`, `gpay`) set the payment method. What is left, in title case, is the name.
5. **Category.** The words are matched against a keyword list per category and the first match wins, for example `lunch`, `cafe`, `swiggy` → Food & Dining and `uber`, `petrol`, `metro` → Transport. Nothing matched means Other.
6. **It learns from you** ([`src/ingest/learn.ts`](src/ingest/learn.ts)):
   - **Your corrections win.** If you filed a name under a different category than the keywords guessed, the app uses your category next time. An entry that only agrees with the guess teaches nothing, and the chat bar's own fall-back to Other is not counted as a choice, so a keyword added later still works.
   - **Newer choices count more.** A choice loses half its weight every 90 days, so a few recent corrections beat many old ones.
   - **Words count too.** If two or more entries agree on a distinctive word (`Zudio kurta` and `Zudio shirts` both Shopping), a later `zudio 500` goes there as well. The exact name is tried first.
   - **How you pay.** If the message names no payment method, the app uses the one you usually use for that name.

| You type | Date | Amount | Name | Category |
| --- | --- | --- | --- | --- |
| `450 lunch at Cafe` | today | ₹450 | Lunch Cafe | Food & Dining (`lunch`, `cafe`) |
| `Uber 230 yesterday` | yesterday | ₹230 | Uber | Transport (`uber`) |
| `Salary 80000` | today | ₹80,000 received | Salary | Income (`salary`) |

Several entries can go in one message, separated by commas, `and`, `;` or new lines. `coffee 120, lunch 340 yesterday` adds two entries, both dated yesterday.

It matches words, not meaning. A plural is read as its singular (`coffees` as `coffee`, `taxis` as `taxi`), and a leading count is left out of the name (`2 coffees 100` is "Coffees", ₹100). A name it does not know lands in Other.

Fixing a guess teaches the app:
- When an entry lands in Other, the pop-up has a **Change** button next to **Undo** that opens the entry.
- When you give an entry a new category in the edit form, the app offers to move the earlier entries with the same name too (**Move**). Only the exact name counts.
- Both feed the learning above, so the next entry with that name goes to the right place. 

### Teaching it more words

The words live in their own file, [`src/ingest/keywords.ts`](src/ingest/keywords.ts), apart from the parser. It holds the category words in packs (`GENERAL`, `INDIA`, `KARNATAKA`), plus the filler and payment words.

- **Add a word:** put it in the pack and category it belongs to, as one lowercase word, for example `'ksrtc'` under `Transport` in `KARNATAKA`.
- **Add a region:** make a new pack the same shape as `KARNATAKA` and add it to `PACKS`.
- A word can appear only once across all packs, and the order in `CATEGORY_ORDER` decides ties. `src/ingest/keywords.test.ts` checks both.

## Stack

React 19, Vite, TypeScript, Tailwind CSS v4, Dexie (IndexedDB) and vite-plugin-pwa (Workbox).

## Run it

```
npm install
npm run dev        # development
npm test           # unit tests
npm run build && npm run preview   # production build, installable as a PWA
```

### App identity

The original three-fold logo lives in [`public/brand-mark.svg`](public/brand-mark.svg). The welcome screen uses that vector directly in the current theme's ink. After editing it, run `npm run icons:generate` to regenerate the cream-on-green favicon, 192/512 px app icons, 512 px maskable icon, and 180 px Apple touch icon. The local SVG renderer is a development dependency; no remote assets or rendering services are used.

The maskable mark fits inside the central 80%-diameter safe circle. Maskable and Apple icons have opaque square backgrounds so the operating system can apply its own shape. Installed icons may take time to refresh after a PWA update, or require reinstalling the shortcut.

### Launch animation

The web splash is in [`index.html`](index.html), outside the React root so it does not restart when JavaScript mounts. [`src/ui/launchSplash.ts`](src/ui/launchSplash.ts) coordinates it with the first ready screen, including onboarding and the PIN lock. The bloom uses a small gradient texture and only animates transforms/opacity, targeting 60fps without per-frame JavaScript or layout changes.

The logo rotates smoothly clockwise during the reveal and expansion, independently of its background tile. The three-fold mark loops seamlessly every 120 degrees. Warm loads and reduced motion keep it still and use only the short fade.

Tweak these commented CSS variables on `.launch-screen` in `index.html`:

| Variable | Default | Controls |
| --- | --- | --- |
| `--launch-intro` | `1100ms` | Logo reveal and brief hold (reveal completes at 70%) |
| `--launch-expand` | `950ms` | Logo-to-full-screen bloom |
| `--launch-dissolve` | `450ms` | Crossfade into the app |
| `--launch-short` | `180ms` | Warm-load/reduced-motion fade |
| `--launch-rotation` | `3s` | Time per 120-degree logo turn; increase to slow rotation |
| `--launch-reveal-ease`, `--launch-expand-ease`, `--launch-fade-ease` | See CSS | Reveal, expansion and dissolve easing |
| `--launch-primary`, `--launch-secondary`, `--launch-glow`, `--launch-logo` | Forest, green, sage, cream | Brand artwork and bloom colors |
| `--launch-bg`, `--launch-ink` | Theme-aware | Starting background and wordmark |

Durations accept `ms` or `s`. Replace the shared vector in `public/brand-mark.svg` to change the logo and regenerate icons as above. The animation covers portrait/landscape corners, stays centered away from notches, and restores keyboard focus after dissolving. A slow startup holds the logo until the real first screen is ready, so total time can exceed 2.5 seconds on a slow device. Errors expose the recovery screen immediately; a stalled startup removes the overlay after 12 seconds with a console warning.

Successful launches set only a `launch-complete` flag in session storage. Reloading the same tab uses the short fade; switching back to an already open app does not replay the splash. To preview a cold launch, use an isolated browser profile/tab or remove only that session-storage flag, not app data. If session storage is unavailable, the full sequence still works and reports a warning.

Validation: `npm test -- src/ui/launchSplash.test.ts src/ui/ErrorBoundary.flow.test.tsx src/ui/Intro.flow.test.tsx src/app.flow.test.tsx`, then `npm run build`. Check actual mobile frame pacing on target devices before release.

## Roadmap

An AI assistant that uses your own API key, AI-generated charts, and reminders.
