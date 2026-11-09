# Open Expense Adviser

A local-first expense tracker you install on your phone as a PWA (Android and iOS). Everything is stored on the device. There is no account and no server. The one thing that leaves the phone is the optional map in Insights: when you press **Show map**, its pictures are fetched from OpenStreetMap, which tells them roughly which area you are looking at. Your transactions are never sent.

Type what you spent or received in the bar at the bottom, as you would say it: `450 lunch at Cafe`, `Uber 230 yesterday`, `Salary 80000`.

## Features

- Chat-bar logging with an offline parser, plus a full add form
- Money sent and received, with an estimated balance that stays hidden until you reveal it
- Home, Activity, Insights and Settings screens, in light and dark themes
- Spending by category as bubbles sized by share, a donut with a legend, or a ranked list; the last 12 months as hatched pill bars with the change from the month before
- Spending pace (scroll through months and compare up to three), daily, category and weekday charts
- A globe of where each month's spending happened, drawn on the phone with no network
- A map of where each month's spending happened (OpenStreetMap, opt-in, only when you ask for it)
- Regular payments in Insights: what they cost a month and a year, what is left to pay this month, the next 30 days, what is due next, and spending that looks regular but is not set up yet
- What keeps coming back: the habits and monthly bills you pay again and again
- A trail of what changed your balance (by source, with the latest entries), and a label on entries added from regular payments or imported
- Budget tracking and CSV / JSON export
- Works offline once installed

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

## Roadmap

An AI assistant that uses your own API key, AI-generated charts, and reminders.
