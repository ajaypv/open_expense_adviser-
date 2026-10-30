# Audit: what was found, what was fixed, what is left

Five reviews ran over the whole app: data and speed, Activity and Insights, Settings and the Add flow,
type and colour and wording, and a bug hunt in the logic. Nothing here was seen on a real screen; the
checks are code reading, scripts and the automated tests ([TEST_CASES.md](TEST_CASES.md), section "Audit fixes").

IDs match the reports: **D** data, **L** logic, **P** performance, **A** Activity, **I** Insights, **S** Settings,
**F** Add and chat, **H** Home and Welcome, **C** contrast, **T** type, **X** accessibility, **W** wording.

## Fixed

### Wrong results and lost data
| ID | Problem | Fix |
|---|---|---|
| F1–F4, L3 | The input bar saved wrong data without saying so: "2 lakh" was ₹2, "on 5th" filed today with "5th" in the name, "got 500 from Ravi" was spent, "maid salary" was received, "2 coffees 100" was ₹2 | Parser rewritten: lakh/lac/crore/L/cr/m, `/-`, `rs`, dates (ordinals, `28 oct`, `12/03`, weekdays, `yest`, `3 days back`, `last month`), the price chosen over quantities, "and" splits entries, a trailing day covers all entries |
| F3 | "$5 coffee" was saved as ₹5 | The typed currency is kept |
| L2 | One huge amount made a backup that could not be restored | A shared maximum amount, enforced when saving, in the parser and on restore |
| L1 | A backup with a made-up currency could leave a white screen on every launch | Currency, rates, dates, amounts and colours are checked on restore; a bad saved currency falls back to rupees; an error screen replaces a blank one |
| L5, L6, D7 | Restore skipped transactions that were in the trash, merged identical purchases, accepted days like 2026-13-45, and kept old rates | Fixed; each has a test |
| D1 | Tapping Add twice (or Add then Add all) on a recurring item added it twice | The rule is read again inside the saving step |
| L4 / D2 | A monthly rule for the 31st slid to the 28th for good | The day it keeps to is stored with the rule |
| D4 | A double tap on Add saved two transactions | Guarded (proved by a test that fails without it) |
| D5 | Bulk delete could overwrite changes and re-stamp the trash; Undo after typing an entry filled the trash | One step; only live rows; Undo removes outright |
| D6 | The background reminder counted recurring entries as "logged today" | Matches the app |
| L8 | CSV opened in Excel with garbled ₹ | Byte-order mark added |
| L9 | A missing auto-lock setting meant "lock instantly" | Defaults to one minute |
| A3 | A day's total was wrong until "Show more" was tapped | Totals count the whole day |
| A4 | Hidden rows stayed selected and could be deleted | The selection follows what is showing |
| I1, I2 | New users saw "+400%"; "this month" was written for every month | The usual month ignores months before logging began, needs two earlier months, and is skipped while a month is in progress; lines name the month |
| I3 | The grey line ran off the chart for 30-day against 31-day months | Both lines share one scale |

### Understanding
| ID | Fix |
|---|---|
| A1, A2, A7, A11 | Quick dates (Any time, This month, Last month, Last 30 days); a category opened from Home keeps its month; removable chips show every filter in use; leaving Activity forgets stale filters |
| A5, A6, A8, A12–A15 | Undo for Move and a note on what it left; Select all; search by any words, amount, account; a clear total for transfers; "Showing 80 of 85"; spoken day totals; warmer empty states; an inline warning when smallest is above largest |
| I4–I8, I11, I13 | "You spent ₹X in October" leads; Where it went moves up and opens Activity; "rough guess" for the month-end estimate; "So far this month you kept" without a rate until the month is over; a warning when amounts are counted at face value; a line under each section saying what it is |
| S1, S10, S12 | Settings in five parts with a jump bar, rarely used things folded under More, and the "coming soon" blocks removed |
| S2, S9 | A question before changing the main currency; the app lock wording says it does not encrypt |
| H1, H2, H3, H5 | Clearer first-run text; the backup reminder waits longer each time and never shows on an old month |
| H4 | The "Spent" tile that repeated the big number is gone |
| W1–W5 | One vocabulary (Spent, Received, Add, transaction); the chat bar says it takes any transaction; "Merchant", "No category", "Set a rate" |
| X2, X3, X8 | Messages with Undo stay 9 seconds and wait while hovered or focused; rows say category, date and note; the page title names the screen |

### Reading and colour
- **C1–C6** Control outlines, the warning colour, the secondary text, the amount placeholder and the light category colours were below the readable minimum. New `--edge` and `--warn-ui` colours; the category colours pass the palette checker. A test now computes every pair in both themes.
- **T1, T3** Headings are bolder and larger; budget status reads firmer as a month nears its limit; row amounts are stronger.
- **X1** One page heading on the empty Home screen.

### Speed
- **P7** Insights and Settings load on demand and in the idle moment after the first screen: the main file went from 197 KB to 148 KB (measured by the build).
- **P4** "Bigger than usual" sorts each category once instead of once per transaction (same answers, checked against the old calculation on random data; speed not measured). The Insights numbers are computed once per change.
- **P5** The "logged today" scan runs once per change.
- **P9** A grey outline of the page while data loads, so no blank page and no false "nothing yet".
- **P8** The main font file is fetched with the page.
- **D3** The first screen waits for currency, budgets and rules too, so nothing jumps or flashes the wrong currency (this race could not be reproduced in tests, so the test is a safety net, not proof).

## Not done

Left on purpose or for lack of time; each is described in the reports and can be picked up.

| ID | What | Why it waits |
|---|---|---|
| F5, F7, F8, F9 | A preview of what the input bar understood; the Add form using the learned category; Today / Yesterday chips on the form; one-tap logging of a regular | Each is a new interaction that deserves a design look on a phone |
| A9, A10, A16, A17 | Export the filtered list; account filter and sort; small accessibility details; 360 px fit of the type filter | Not checked on a device |
| I9, I10, I12 | Marking the partial month in the 12-month chart; busiest-day averages; a few smaller notes | Need a chart redesign |
| S3–S8, S11, S13, S14 | Messages for invalid budget and rate boxes; Undo for removing a budget; a question before deleting trash items; a safety copy before "Replace everything"; editing recurring rules; reminder permission shown inline | Each is a small flow of its own |
| H4, H6, H7 | One nudge at a time on Home; a way to dismiss "Set a budget" and the log reminder | Needs a decision on priority |
| P1, P2, P3, P6, P10–P12 | Staged recalculation of the whole ledger, suggestion work on every change, keeping Activity's sort between visits, a database index for the trash, memo details | Only matter with very large histories; measure first |
| T2, T4–T6 | Collapsing the font sizes to one scale; 12 px chart labels; checking that the font keeps its tabular digits | Visual review needed |
| X4–X7 | Chat box focus ring, error icons, chart readout announcements, styled confirmation dialogs in place of the browser's | Small, mostly on the Device list |
| L7, L9 (rest) | Lock hardening (the "enabled" flag lives in browser storage, more PBKDF2 rounds); midnight rollover; the notification fallback | Security design choices to make deliberately |
| W6–W8 (rest) | A few error and button wordings | Low value each |

## Things to check on a phone
Spacing of the new date chips and the Settings jump bar at 360 px and largest text; the grey loading outline; how the count-up and the toast feel; the Excel round trip of an exported CSV; and that Android and iPhone show the new icon.
