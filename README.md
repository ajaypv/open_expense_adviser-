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

## How the chat bar understands what you type

There is no AI and no network call. A small set of rules in [`src/ingest/localParser.ts`](src/ingest/localParser.ts) runs on the device, in this order:

1. **Date.** Words like `yesterday`, `3 days ago`, `last friday`, `5th`, `28 oct` or `01/10/2026` are found, removed from the text and used as the date. With none, it is today.
2. **Amount.** Numbers are read with `₹`, `Rs`, `450/-`, `18k`, `2 lakh`, `1 crore` and commas (`80,000`). With several numbers, the one with a currency mark wins, otherwise the largest.
3. **Money in or out.** `salary`, `received`, `refund`, `credited`, `cashback`, `bonus`, `got paid`, `paid me` and `got … from` mean money came in. Anything else is spending. Wages you pay are spending: `maid salary 8000`, `salary to driver`.
4. **Name.** Filler words (`spent`, `paid`, `on`, `at`, `to`, `for`, `the`) are dropped. Payment words (`cash`, `card`, `UPI`, `gpay`) set the payment method. What is left, in title case, is the name.
5. **Category.** The words are matched against a keyword list per category and the first match wins, for example `lunch`, `cafe`, `swiggy` → Food & Dining and `uber`, `petrol`, `metro` → Transport. Nothing matched means Other.
6. **Your own choice wins.** If you have changed the category for a name before, the app uses your category the next time ([`src/ingest/learn.ts`](src/ingest/learn.ts)).

| You type | Date | Amount | Name | Category |
| --- | --- | --- | --- | --- |
| `450 lunch at Cafe` | today | ₹450 | Lunch Cafe | Food & Dining (`lunch`, `cafe`) |
| `Uber 230 yesterday` | yesterday | ₹230 | Uber | Transport (`uber`) |
| `Salary 80000` | today | ₹80,000 received | Salary | Income (`salary`) |

Several entries can go in one message, separated by commas, `and`, `;` or new lines. `coffee 120, lunch 340 yesterday` adds two entries, both dated yesterday.

It matches words, not meaning, and only whole words: `coffee` is known but `coffees` is not. A name it does not know lands in Other. Tap **Undo** in the pop-up, or open the entry to change its category, and the app remembers the change. To teach it more words, add them to `CATEGORY_KEYWORDS` in the parser.

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
