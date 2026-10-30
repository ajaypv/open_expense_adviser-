# Expense tracker: test cases

Version 0.3.0. This lists what to check, how, and what is already checked by the automated tests.

## How to read this

- **Auto** says where a case is already checked by a test that runs on every change (`npm test`). A case marked **Auto** still deserves one look on a real phone if it says **Also on device**.
- **Device** means only a real phone or browser can check it: how it looks, how it feels under a thumb, and anything the phone itself does (install, notifications, the share sheet, the keyboard).
- Each case gives the steps and the result you should see. A case passes only if every result matches.

**Test on at least:** an Android phone with the app installed from Chrome, an iPhone with the app added to the Home Screen, and a desktop browser. Use a 360 px wide screen at least once, and check both light and dark themes.

**Start from a clean install** (clear site data) for the first-launch cases. For the rest, use an install with about three months of mixed entries.

## Automated coverage

| | |
|---|---|
| Test files | 77 |
| Tests | 1030 |
| Statements covered | 94.4% |
| Lines covered | 95.9% |

Two kinds of test:

- **Logic tests** (money, dates, suggestions, trends, recurring, reminders, backup file reading, migrations) run on plain data.
- **Flow tests** open the real screens in a simulated browser with a real in-memory database. They type, tap, and then check what was saved and what is on screen. They are the `*.flow.test.tsx` files.

I checked that the tests can fail by planting ten bugs one at a time. All ten were caught, including the ones that matter most: saving the wrong amount, any PIN unlocking, restore creating duplicates, and "Hide amounts" rebuilding the screen.

**What the automated tests cannot see:** layout and spacing, colours and contrast, animations, swiping and scrolling by touch, the on-screen keyboard, installing, notifications arriving, the share sheet, the location permission prompt, offline use, and updates coming from the server. Those are the **Device** cases below.

---

## 1. Install and update

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| INS-1 | Install on Android | Open the site in Chrome, accept the install offer | An "Install" line shows at the top. After installing, the app opens without browser bars | Device |
| INS-2 | Install hint on iPhone | Open the site in Safari | A line says to tap Share, then Add to Home Screen | Auto: `parts.flow` (banner), `hooks.flow`. Also on device |
| INS-3 | Dismiss the install line | Tap "Not now" | The line goes away and doesn't come back until the next visit | Auto: `parts.flow` |
| INS-4 | Update waiting | Deploy a new version, reopen the installed app | "A new version is ready" with a Reload button that can't be dismissed | Auto: `parts.flow`, `hooks.flow`. Also on device |
| INS-5 | Reload applies the update | Tap Reload | The app reloads on the new version. Settings → App updates shows the new version | Device |
| INS-6 | Check for updates | Settings → Check for updates | Shows "Checking…", then "You're on the latest version." or "Update now" | Auto: `settings.flow`. Also on device |
| INS-7 | Check offline | Turn on airplane mode, tap Check for updates | "You're offline. Connect to the internet and try again." | Auto: `settings.flow` |
| INS-8 | What's new after an update | Update from an older version | "What's new in 0.3.0" shows once, then not again | Auto: `app.flow` |
| INS-9 | Data survives an update | Update with existing entries | Every entry, account, budget and goal is still there | Auto: `migration.test`, `goals.test` (upgrade). Also on device |
| INS-10 | Home-screen shortcuts | Long-press the app icon | "Add expense" and "Add received money" open the Add form on the right tab | Device |
| INS-11 | Works offline | Open once online, then go offline and reopen | The app opens and entries can be added | Device |

## 2. First launch

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| WEL-1 | Welcome shows once | Open on a clean install | A "Welcome" sheet asks for currency, what you have today, and a monthly budget | Auto: `app.flow` |
| WEL-2 | Skip | Tap "Skip for now" | The sheet closes, Home says "Nothing logged yet.", and it never comes back | Auto: `app.flow` |
| WEL-3 | Save the answers | Pick USD, enter 5,000 and 30,000, tap Get started | Currency is USD, the account balance is 5,000, a 30,000 budget is set | Auto: `app.flow` |
| WEL-4 | Bad number | Enter "lots" as the balance, tap Get started | "Use numbers only. Leave a box empty to skip it." Nothing is saved | Auto: `app.flow` |
| WEL-5 | Existing user | Open with data already stored | No welcome; "What's new" shows instead | Auto: `app.flow`, `appState.test` |
| WEL-6 | Choose a currency inside the welcome | Tap Currency, pick one | The list closes but the **welcome stays open** | Auto: `app.flow`, `pickers.flow` |

## 3. Input bar

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| BAR-1 | Log a sentence | Type "450 lunch at Cafe", press Enter | An expense of ₹450 is added, a message says so, the bar clears | Auto: `app.flow` |
| BAR-2 | Several at once | Type "coffee 120, lunch 340" | Two expenses; "Added 2 entries, ₹460 sent" | Auto: `app.flow`, `localParser.test` |
| BAR-3 | Money received | Type "Salary 80,000" | Counted as received, not spent | Auto: `app.flow` |
| BAR-4 | Amount with commas | Type "1,200 rent" | One entry of ₹1,200, not two | Auto: `localParser.test` |
| BAR-5 | Undo | Tap Undo in the message | The entry goes to Recently deleted | Auto: `app.flow` |
| BAR-6 | No amount | Type "lunch at the cafe" | "No amount found…" and the text stays in the bar | Auto: `app.flow` |
| BAR-7 | Learns a category | Add "Chai Point" twice under Groceries, then type "60 Chai Point" | The new entry is filed under Groceries | Auto: `app.flow`, `learn.test` |
| BAR-8 | New line | Press Shift+Enter | A new line, nothing is sent | Auto: `parts.flow` |
| BAR-9 | Word being composed | On a phone keyboard that composes words (Japanese, Hindi), press Enter to accept a word | The word is accepted; nothing is sent | Auto: `parts.flow`. Also on device |
| BAR-10 | Send is off when empty | Open the app | The send button is dimmed until something is typed | Auto: `app.flow` |
| BAR-11 | Plus opens the full form | Tap + | The Add form opens | Auto: `app.flow` |
| BAR-12 | No glow | Tap into the bar | The edge gets firmer; there is no coloured or white glow | Device |
| BAR-13 | Keyboard | Tap the bar on a phone | The bar stays visible above the keyboard; suggestions above it hide while typing | Device |

## 4. Add form

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| ADD-1 | Save an expense | Type 1,250.50, pick Groceries, enter "Big Basket", tap Add expense | Saved as ₹1,250.50 under Groceries; the form closes | Auto: `AddSheet.flow` |
| ADD-2 | Default category | Enter only an amount | Filed under Other | Auto: `AddSheet.flow` |
| ADD-3 | Missing amount | Tap Add expense with nothing entered | "Enter an amount above 0.", the amount box shakes and is outlined in red, the cursor returns to it | Auto (message): `AddSheet.flow`. Also on device (shake) |
| ADD-4 | Error clears | Start typing an amount | The error disappears | Auto: `AddSheet.flow` |
| ADD-5 | Received | Choose Received, enter 80000 and "Employer" | Saved under Income | Auto: `AddSheet.flow` |
| ADD-6 | Large amount | Tap the amount box | The number is large and bold, grows no wider than the screen even with 10+ digits | Device |
| ADD-7 | Amount animation | Type digits | Each digit pops slightly. With "reduce motion" on, nothing moves | Device |
| ADD-8 | Pinned button | Scroll the form | "Add expense" stays at the bottom the whole time | Device |
| ADD-9 | Keyboard up | Tap the amount box on a phone | The button is still reachable | Device |
| ADD-10 | Categories row | Swipe the category chips | They scroll sideways; the chosen one is brought into view; the sheet itself does **not** slide sideways | Device |
| ADD-11 | More details | Tap More details | Date, Paid with, Note and Repeat appear. The closed row summarises, e.g. "Today, Card" | Auto: `AddSheet.flow` |
| ADD-12 | Payment method | Pick Cash, tap Cash again | The method is cleared | Auto: `AddSheet.flow` |
| ADD-13 | Date in the past | Pick an earlier date | Saved on that date; future dates can't be picked | Device |
| ADD-14 | Repeat monthly | Set Repeat to Every month, add "Rent" 18,000 | A recurring rule is created | Auto: `AddSheet.flow` |
| ADD-15 | Other currency | Tap the currency button, choose USD | "Recorded in USD…"; saved in USD | Auto: `AddSheet.flow` |
| ADD-16 | Search currencies | Open the currency list, type "franc" | Only the Swiss franc remains | Auto: `AddSheet.flow` |
| ADD-17 | Choosing in a list keeps the form open | In the Add form pick a currency, an account or a repeat option | Only the list closes; the form stays open with what you typed | Auto: `AddSheet.flow`, `pickers.flow` |
| ADD-18 | Transfer | With two accounts, choose Transfer, enter 2000 | Saved as a transfer; counts as neither spent nor received | Auto: `AddSheet.flow` |
| ADD-19 | Transfer to itself | Pick the same account twice | "Choose two different accounts." | Auto: `AddSheet.flow` |
| ADD-20 | One account only | With one account | There is no Transfer option | Auto: `AddSheet.flow` |
| ADD-21 | Edit | Tap a transaction, change the amount, Save changes | The change is saved, nothing duplicated | Auto: `AddSheet.flow` |
| ADD-22 | Delete | Edit, tap Delete | Moves to Recently deleted | Auto: `AddSheet.flow` |
| ADD-23 | Copy | Edit, tap Copy | A copy dated today | Auto: `AddSheet.flow` |
| ADD-24 | Close | Tap ×, tap the dark area, press Back (Android) | The form closes each way | Auto (×): `AddSheet.flow`, `parts.flow`. Also on device |
| ADD-25 | Short form fits | Open on a small phone | The amount, categories and merchant are reachable with little scrolling | Device |

## 5. Suggestions

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| SUG-1 | One-tap fill | Open the Add form with history, tap a suggestion | Amount, merchant, category and payment method fill in | Auto: `AddSheet.flow` |
| SUG-2 | From Home | Tap a suggestion on Home or above the bar | The form opens already filled | Auto: `AddSheet.flow` |
| SUG-3 | Received tab | Open Received after logging income before | Received suggestions show, even if expenses dominate | Auto: `suggestions.test` (per kind) |
| SUG-4 | Ranking | Log a merchant on Mondays; check on a Monday | It ranks high with "Usually on Mondays" | Auto: `suggestions.test` |
| SUG-5 | Near here | With location on, revisit a place | Places you paid near here rank higher | Auto: `suggestions.test`. Also on device |
| SUG-6 | Today's entries last | Log a merchant, reopen the form | It shows "Added earlier today" and sits last | Auto: `suggestions.test` |
| SUG-7 | Placement | Settings → Suggestions → Home / Off | Moves to Home or disappears everywhere, including the form | Auto: `settings.flow`, `AddSheet.test` |
| SUG-8 | Swipe row | Swipe the row above the bar | It scrolls smoothly, snapping to each chip | Device |

## 6. Home

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| HOM-1 | Spending total | Look at the big number | Equals money sent this month; received money isn't included | Auto: `Home.test` |
| HOM-2 | Comparison | With last month's data | "x% more/less than September", or "the same days in" mid-month | Auto: `Home.test`, `aggregates` tests |
| HOM-3 | Budget bar | Set a budget | A bar shows used / left, with words, not colour alone | Auto: `Home.test` |
| HOM-4 | Hide amounts | Tap the eye icon | Every amount becomes ₹••••. Tap again to show | Auto: `app.flow` |
| HOM-5 | Balance stays hidden | Open Home | The estimated balance is hidden until "Show balance" is tapped | Auto: `Home.test`, `components.test` |
| HOM-6 | Per account | With two accounts, show the balance | Each account's balance is listed | Auto: `components.test` |
| HOM-7 | Backup reminder | With 10+ entries and no backup | A card offers "Back up now" or "Later" | Auto: `parts.flow` |
| HOM-8 | Due now | With a recurring rule due | A card with Add and Skip for each; Add all when several | Auto: `parts.flow` |
| HOM-9 | Log nudge | After the reminder time with nothing logged | "Nothing logged today yet" with an Add button | Auto: `parts.flow` |
| HOM-10 | Latest | Look at the Latest list | The five newest, with See all | Auto: `Home.test` |
| HOM-11 | Day chart / Where it went | Tap a category bar | Opens Activity filtered to that category | Auto: `Home.test` |
| HOM-12 | Empty state | On a clean install | "Nothing logged yet." with tappable examples | Auto: `app.flow`, `Home.test` |
| HOM-13 | Recent spending | Look under the big number on the current month | Three figures: Today, Yesterday and Last 7 days, counting money sent only | Auto: `Home.test`, `aggregates.test`, `app.flow` |
| HOM-14 | Updates at once | Log an expense | Today and Last 7 days change straight away | Auto: `app.flow` |
| HOM-15 | Only for now | Switch to a past month | The strip is gone, because these are measured from today | Auto: `Home.test` |
| HOM-16 | Fits | View at 360 px with large amounts | Figures stay on one line (shortened, such as ₹1.2L) and never overlap | Device |

## 7. Month picker

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| MON-1 | Open | Tap the month name | A "Choose a month" sheet with 12 months | Auto: `pickers.flow` |
| MON-2 | Pick | Tap March | The screen shows March and the sheet closes | Auto: `pickers.flow`, `app.flow` |
| MON-3 | Future months | Look at later months | Greyed out; tapping does nothing | Auto: `pickers.flow` |
| MON-4 | Years | Use the year arrows | Back as far as your first entry; never past this year | Auto: `pickers.flow` |
| MON-5 | Dots | Look at months with entries | A dot marks them (on Insights, months with expenses) | Auto: `pickers.flow`, `Home.test` |
| MON-6 | Back to now | From another month tap "This month" | Returns to the current month | Auto: `pickers.flow` |
| MON-7 | Arrows | Tap ‹ and › | Steps one month, across a year boundary; › is off at this month | Auto: `pickers.flow` |
| MON-8 | Looks and feels | Open on a phone | The grid is easy to tap and reads clearly in both themes | Device |

## 8. Goals

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| GOL-1 | First goal | Tap Goals at the top right of Home; with no goals, tap Set a goal | The goals sheet opens, then the New goal form on top of it | Auto: `goals.flow`, `app.flow` |
| GOL-2 | Make a goal | Enter "Goa trip", 25,000, saved 5,000, a date | Appears under Goals with "₹5,000 saved of ₹25,000", 20%, and "₹20,000 to go" | Auto: `goals.flow`, `app.flow` |
| GOL-3 | Ideas | Tap "Emergency fund" | The name fills in | Auto: `goals.flow` |
| GOL-4 | Validation | Leave the name or cost empty, or enter a negative saved amount | A plain message; nothing is saved | Auto: `goals.flow` |
| GOL-5 | Time left and pace | Set a date three months out | "Due 28 Jan, 3 months left" and "Save ₹x a month to get there on time". Under about two months it says a week | Auto: `goals.test`, `GoalsOverview.test` |
| GOL-6 | Overdue | Set a past date | "Overdue by n days, was due 28 Oct" in red with a warning icon, and no savings suggestion | Auto: `goals.test`, `GoalsOverview.test` |
| GOL-7 | Add money | Tap Add money, enter 5,000 | The bar and amount update; a message offers Undo | Auto: `goals.flow`, `app.flow` |
| GOL-8 | Take out | Choose Take out, enter more than saved | Goes to zero, never negative; message says what actually came out | Auto: `goals.flow` |
| GOL-9 | Fill the rest | Tap "Fill the rest" then Add | Reaches the goal; "Goal reached: …" | Auto: `goals.flow` |
| GOL-10 | Reached | Fill a goal | Shows "Goal reached"; Add money and "to go" disappear | Auto: `GoalsOverview.test` |
| GOL-11 | No effect on balance | Add money to a goal | No transaction is created and no balance changes | Auto: `goals.flow` |
| GOL-12 | Edit | Tap a goal, change cost, remove the date | Saved | Auto: `goals.flow` |
| GOL-13 | Delete and undo | Delete a goal, tap Undo | It returns as the same goal | Auto: `goals.flow` |
| GOL-14 | Order | Make several, fill one | Goals still being saved first (soonest date first, undated next), then reached goals under their own "Reached" heading. Every goal is shown | Auto: `goals.test`, `GoalsOverview.test` |
| GOL-15 | In backups | Back up, clear data, restore | Goals return with what was saved | Auto: `importBackup.test`, `data.flow` |
| GOL-16 | Progress for screen readers | Use a screen reader on a goal | Reads "₹5,000 of ₹25,000 saved, 20%" | Auto: `goals.flow` |
| GOL-17 | Looks | Open the goals sheet with and without goals | Total card on top, then "In progress" and "Reached"; comfortable spacing in both themes; the sheet scrolls when there are many goals | Device |
| GOL-18 | Total saved | Make two goals and add money to one | A card shows everything saved against everything it will cost, with a bar and "2 goals" (and "1 reached" once one is reached). Money saved past a target doesn't inflate the total | Auto: `goals.test`, `GoalsOverview.test`, `app.flow` |
| GOL-19 | Header button | Look at the top of Home | The date is at the left and a "Goals" button with a flag at the right, above the month switcher. Goals are not a tab and not on the page itself | Auto: `app.flow`, `HomeHeader.test`, `GoalsButton.test`, `BottomNav.test`, `Home.test` |
| GOL-21 | Progress on the button | Save towards a goal | A ring around the flag fills and the percentage beside "Goals" updates at once | Auto: `GoalsButton.test`, `app.flow`. Also on device |
| GOL-22 | Glow once | Open the app; then go to Settings and back to Home | The button gives one soft glow a moment after the app opens, then stays calm, including when you return to Home | Auto (plays once per open): `goals.flow`, `app.flow`. **Device** (how it looks) |
| GOL-23 | Reduced motion | Turn on "reduce motion", open the app | No glow at all | Device |
| GOL-24 | Header fits | View Home at 360 px and at the largest text size | The date shortens before the Goals button is ever pushed off the screen; the button stays 44 px tall | Device |
| GOL-25 | What goal money is | Open the goals sheet, with and without goals | A line under the title says money added to a goal is a note to yourself and does not change the balance or spending | Auto: `GoalsOverview.test` |
| GOL-26 | How it works | Open the goals sheet with no goals | Three short steps: name it and say what it costs, pick a date and see how much to save, add money as you set it aside. They are gone once a goal exists | Auto: `GoalsOverview.test` |
| GOL-27 | Total at a glance | Make two goals and add money to one | Under the bar: "24% saved" on the left and "₹65,000 to go" on the right; "All saved" instead once every goal is reached | Auto: `GoalsOverview.test`, `app.flow` |
| GOL-28 | Each goal says where it stands | Look at a goal with a date, one without, one overdue | Always: name, "saved of", the percentage, "₹x to go". With a date: "Due 8 Nov, 9 days left" and "Save ₹x a week to get there on time". A chevron shows the card opens | Auto: `GoalsOverview.test`, `goals.test`. **Device** (spacing, tap area) |
| GOL-20 | Before any entries | On a clean install, tap Goals at the top right | The "Saving for something?" prompt works even with nothing logged | Auto: `app.flow`, `Home.test` |

## 9. Activity

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| ACT-1 | Grouped by day | Open Activity | Days labelled Today / Yesterday / date, each with a total | Auto: `activity.flow` |
| ACT-2 | Search | Type a merchant, note or category | Only matches; shows "n transactions: ₹x sent" | Auto: `activity.flow` |
| ACT-3 | Nothing matches | Search for nonsense | "Nothing matches." with Clear filters | Auto: `activity.flow` |
| ACT-4 | Category chip | Tap a chip, tap it again | Filters, then clears | Auto: `activity.flow` |
| ACT-5 | Type filter | Filters → Received | Only money received; the button shows "1 on" | Auto: `activity.flow` |
| ACT-6 | Amount and date | Set Smallest/Largest and dates | Only matching rows | Auto: `activity.flow` |
| ACT-7 | Clear filters | Tap Clear filters | Everything returns | Auto: `activity.flow` |
| ACT-8 | Show more | With over 80 rows | The first 80, then "Show more" | Auto: `activity.flow` |
| ACT-9 | Select several | Select, tap rows | Rows tick instead of opening; the count updates | Auto: `activity.flow` |
| ACT-10 | Bulk delete | Select rows, Delete | Moved to trash; Undo restores | Auto: `activity.flow` |
| ACT-11 | Bulk move | Select, Move to…, pick a category | Only expenses move; received money is refused with a message | Auto: `activity.flow` |
| ACT-12 | Swipe a row | Swipe a row left | Copy and Delete appear; Copy makes today's copy; Delete trashes it; both offer Undo | Auto (buttons): `activity.flow`. **Device** (the swipe) |
| ACT-13 | No swipe while selecting | In select mode, swipe | Nothing is revealed | Auto: `activity.flow` |
| ACT-14 | Row look | View rows | Avatar, merchant, category, time, amount; transfers read "Main to Cash" with no plus sign | Auto: `components.test`. Also on device |
| ACT-15 | Other currency row | View a USD entry | Shows $10 with "≈ ₹835" beneath, or "No USD rate set" | Auto: `components.test` |

## 10. Insights

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| INSI-1 | Money in and out | Open Insights with income | Received, sent, and "You kept ₹x, y% of what came in" | Auto: `more.test`, `logic.test` |
| INSI-2 | Spent more than received | Spend more than you received | "₹x more than came in so far" | Auto: `more.test` |
| INSI-3 | Category limits | Set a limit for Transport | A meter shows the limit with words | Auto: `more.test`, `trends` tests |
| INSI-4 | Bigger than usual | Log one very large purchase | It's listed with "n times the usual" | Auto: `more.test`, `logic.test` |
| INSI-5 | Trends | With two months of data | Trends by category and a 12-month view | Auto: `more.test` |
| INSI-6 | First month | With one month only | No empty charts | Auto: `more.test`, `Insights.test` |
| INSI-7 | Show as table | Open "Show as table" under a chart | The same numbers as a table | Auto: `Insights.test` |
| INSI-8 | Charts by touch | Drag across the pace chart | Reads each day; arrow keys work on desktop | Device |
| INSI-9 | Colour | View in light and dark | Charts stay readable; colour never carries meaning alone | Device |

## 11. Settings

### 11.1 Appearance

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| DSP-1 | Theme | Choose System / Light / Dark | The app changes immediately and remembers it | Auto: `settings.flow`, `hooks.flow`. Also on device |
| DSP-2 | Text size | Choose Largest, then Small | The whole app scales; remembered | Auto: `settings.flow` |
| DSP-3 | Hide amounts | Switch on Hide amounts | Every amount on every tab is masked. **The page stays where it was and open sections stay open** | Auto: `app.flow` |
| DSP-4 | Number grouping | Choose Indian, then International | ₹1,00,000 versus ₹100,000 | Auto: `settings.flow`, `money.test` |
| DSP-5 | Masked before first paint | Turn on Hide amounts, reload | Amounts are never visible, even for a moment | Device |
| DSP-6 | System theme | Set the phone to dark with System chosen | The app follows | Device |

### 11.2 Currency and exchange rates

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| CUR-1 | Main currency | Tap Main currency, search, pick one | Saved; list shows code with name | Auto: `settings.flow` |
| CUR-2 | Add a currency | Tap Add a currency, pick EUR | A row "1 EUR = ___ INR" appears | Auto: `settings.flow` |
| CUR-3 | Save a rate | Type 90.5 and leave the field | "EUR rate saved" | Auto: `settings.flow` |
| CUR-4 | Remove a rate | Empty the field and leave it | The rate is removed | Auto: `settings.flow` |
| CUR-5 | Bad rate | Enter abc, 0 or -3 | The field is marked; nothing saved | Auto: `settings.flow` |
| CUR-6 | Rate needed | Log a USD entry with no rate | "Rate needed" warning until you set one | Auto: `settings.flow` |
| CUR-7 | Totals convert | Set the rate | Totals and charts include the entry at that rate | Auto: `buildLedger.test` |

### 11.3 Budgets

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| BUD-1 | Overall budget | Enter 30,000, Save | "Budget saved"; status shows On | Auto: `settings.flow` |
| BUD-2 | Invalid | Enter nothing, 0, -5 or text | "Enter a budget above 0, or use Remove budget." | Auto: `settings.flow` |
| BUD-3 | Remove | Tap Remove budget | Cleared | Auto: `settings.flow` |
| BUD-4 | Category limit | Limits by category → type 2500 → leave field | "Groceries limit saved" | Auto: `settings.flow` |
| BUD-5 | Clear a limit | Empty it and leave | "limit removed" | Auto: `settings.flow` |

### 11.4 Accounts

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| ACC-1 | Add | Type "Cash", Add | Listed | Auto: `settings.flow` |
| ACC-2 | Blank name | Add with nothing | "Give the account a name" | Auto: `settings.flow` |
| ACC-3 | Balance | Edit Main, enter 5,000 | The estimate becomes 5,000, counting entries already logged | Auto: `settings.flow` |
| ACC-4 | Privacy | Reopen the account | The balance box is empty; only "Saved. For privacy it isn't shown here." | Auto: `settings.flow` |
| ACC-5 | Negative balance | Enter -250 | Accepted | Auto: `settings.flow` |
| ACC-6 | Rename / archive | Rename, then Archive | Saved; archived accounts leave the pickers | Auto: `settings.flow` |
| ACC-7 | Delete unused | Delete an account with no entries | Asks to confirm, then deletes | Auto: `settings.flow` |
| ACC-8 | Delete used | Delete an account with entries | Refused: "Archive it instead." | Auto: `settings.flow` |

### 11.5 Recurring

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| REC-1 | List and pause | View a rule; switch Active off | Shows "Paused" and stops appearing as due | Auto: `settings.flow` |
| REC-2 | Delete | Delete a rule | Asks to confirm; entries already added stay | Auto: `settings.flow` |
| REC-3 | Found in history | Log the same merchant and amount in 3 months in a row | "Found in your history" with Repeat monthly | Auto: `settings.flow`, `logic.test` |
| REC-4 | Due now | Let a rule come due | Home offers Add / Skip; Add makes the entry and moves the date on | Auto: `parts.flow`, `recurringOps.test` |
| REC-5 | Catch up | Leave a rule for three months | "(3 due)"; Add does one at a time, Add all does the rest | Auto: `parts.flow` |
| REC-6 | Undo | Undo an Add or Skip | The entry is removed and the due date restored | Auto: `parts.flow` |

### 11.6 Reminders

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| REM-1 | Switch on | Turn on "Remind me to log" | A time field appears | Auto: `settings.flow` |
| REM-2 | Set the time | Tap the time, choose 8, 30, Set time | The field shows 8:30 (or 20:30); nothing changes until Set time | Auto: `settings.flow`, `pickers.flow` |
| REM-3 | Time picker | Check midnight and noon | 12 AM is 00:00, 12 PM is 12:00; a 24-hour phone shows 00–23 | Auto: `pickers.flow`, `timeParts.test` |
| REM-4 | Close without setting | Open the picker, change, close | The time is unchanged | Auto: `pickers.flow` |
| REM-5 | Permission | Tap Allow notifications | The phone's prompt appears only now, after the tap | Auto (only on tap): `settings.flow`. **Device** (the prompt) |
| REM-6 | Reminder arrives (app open) | After the time, with nothing logged | The nudge card shows on Home; a notification if allowed; once a day | Auto: `parts.flow`. **Device** (the notification) |
| REM-7 | Reminder arrives (app closed) | Close the app on Android Chrome | A notification may arrive; the phone decides when | **Device**. iPhone does not wake the app |
| REM-8 | Badge | With something due | A number shows on the app icon where supported | Auto (calls): `parts.flow`. **Device** |
| REM-9 | Budget alerts | Cross 80%, then 100% | One message each, once per month per budget; none for spending already past when the app opened | Auto: `parts.flow`, `logic.test` |
| REM-10 | Tap a notification | Tap one | The app opens | Device |

### 11.7 Location

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| LOC-1 | Turn on | Switch on, allow in the prompt | "Location will be saved with new transactions" | Auto: `settings.flow`. **Device** (prompt) |
| LOC-2 | Blocked | Deny in the prompt | A clear message; it stays off | Auto: `settings.flow` |
| LOC-3 | Saved with entries | Add an entry | Edit it: "Added at this location" with View map and Remove | Auto: `location.test`. Also on device |
| LOC-4 | Remove all | Tap Remove location from n transactions | After confirming, places are removed | Auto: `settings.flow` |
| LOC-5 | Never slows saving | Add an entry with a slow GPS | The entry saves at once; the place is added when it arrives | Auto: `location.test` |

### 11.8 Updates

See INS-4 to INS-8.

## 12. Your data

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| DAT-1 | Back up | Back up everything | The phone's share sheet opens (Files, Drive, WhatsApp). The message says "Backup shared" | Auto (file contents): `data.flow`. **Device** (the share sheet) |
| DAT-2 | Closing the sheet | Close the share sheet | Not recorded as a backup | Auto: `data.flow` |
| DAT-3 | Download fallback | On desktop | The file downloads | Auto: `data.flow` |
| DAT-4 | File contents | Open the JSON | Version 2, entries (not trashed), accounts, categories, goals, rates | Auto: `data.flow`, `importBackup.test` |
| DAT-5 | Export | Export transactions | A CSV with a header and one row per entry | Auto: `data.flow`, `exporters.test` |
| DAT-6 | Both off when empty | With no entries | Back up and Export are dimmed | Auto: `data.flow` |
| DAT-7 | Restore: preview | Choose a backup file | Shows the file name and "n transactions in this file, m new" before changing anything | Auto: `data.flow` |
| DAT-8 | Add what's missing | Tap it | Adds only missing entries; "Restored n transactions" | Auto: `data.flow` |
| DAT-9 | Restore twice | Restore the same file again | "none of them new"; nothing duplicated | Auto: `data.flow`, `importBackup.test` |
| DAT-10 | Replace everything | Tap Replace everything | Asks to confirm; then matches the file | Auto: `data.flow` |
| DAT-11 | Bad file | Choose a text file, a wrong-shaped file, a newer-version file | A plain message each; nothing changes | Auto: `data.flow`, `importBackup.test` |
| DAT-12 | Huge file | Choose a file over 25 MB | "That file is too large to be a backup." | Auto: `data.flow` |
| DAT-13 | Old backup | Restore a version-1 backup | Works; the old single balance goes to the first account | Auto: `importBackup.test` |
| DAT-14 | Recently deleted | Delete an entry | Listed with "n days left"; Restore brings it back | Auto: `data.flow`, `trash.test` |
| DAT-15 | Delete for good / empty | Delete one, then Empty the trash | Asks to confirm for emptying; non-deleted entries are untouched | Auto: `data.flow` |
| DAT-16 | 30 days | Leave a deleted entry for over 30 days | It is removed for good when the app opens | Auto: `trash.test` |
| DAT-17 | Last backup date | After a backup | Settings shows "Last backup today" | Auto: `data.flow` |
| DAT-18 | Backup reminder | See HOM-7 | Reappears after 30 days; "Later" waits 7 days | Auto: `backupState.test`, `parts.flow` |

## 13. App lock

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| LCK-1 | Turn on | Set a PIN of 4 to 8 digits twice | "App lock is on"; stays unlocked for now | Auto: `security.flow` |
| LCK-2 | Bad PIN | Too short, or two different | "Use 4 to 8 digits." / "The two PINs don't match." | Auto: `security.flow` |
| LCK-3 | Digits only | Type letters | Ignored | Auto: `security.flow` |
| LCK-4 | PIN keyboard | Tap the PIN box on a phone | A number keypad appears | **Device** |
| LCK-5 | Lock now | Tap Lock now | Only the PIN screen shows; nothing else is on screen | Auto: `security.flow`, `app.flow` |
| LCK-6 | Unlock | Type the PIN | Unlocks as soon as the last digit is typed | Auto: `security.flow`, `app.flow` |
| LCK-7 | Wrong PIN | Type a wrong PIN | "Wrong PIN. 4 tries left before a short wait." | Auto: `security.flow` |
| LCK-8 | Lockout | Five wrong tries | "Too many wrong tries. Try again in n seconds."; the box is off; even the right PIN is refused until the wait ends | Auto: `security.flow`, `lock.test` |
| LCK-9 | Locks on leaving | Switch to another app for longer than the chosen time | The lock screen shows on return | Auto (logic): `lock.test`. **Device** |
| LCK-10 | Timing option | Choose Right away / After 1 minute / After 5 minutes | Saved; behaves as chosen | Auto: `security.flow` |
| LCK-11 | Change PIN | Needs the current PIN | Wrong current PIN is refused; the new one works | Auto: `security.flow` |
| LCK-12 | Turn off | Needs the current PIN | Refused if wrong; works if right | Auto: `security.flow` |
| LCK-13 | Forgot PIN | Open "Forgot your PIN?" | Explains it can't be recovered; Erase all stays off until ERASE is typed | Auto: `security.flow`. **Device** (the erase itself) |
| LCK-14 | Not encryption | Read the Settings note | Says it keeps others out of the app but does not scramble stored data | Auto: `more.test` |
| LCK-15 | Locked at first paint | Lock the app, close it, reopen | The PIN screen shows straight away, with no flash of the app | Device |

## 14. Upgrade and storage

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| MIG-1 | v1 to now | Open a database from the first release | Categories merged, no entry lost | Auto: `migration.test` |
| MIG-2 | Accounts | Open a v3 database with a balance | It becomes the first account's balance | Auto: `migration.test` |
| MIG-3 | Goals | Open a v4 database | Everything intact; Goals empty | Auto: `goals.test` |
| MIG-4 | Storage kept | After heavy use | The browser doesn't clear the data (persistent storage requested) | Device |
| MIG-5 | iPhone separate storage | Use Safari, then the Home Screen app | They hold separate data; back up and restore to move | Device |

## 15. Accessibility

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| A11Y-1 | Screen reader names | Use TalkBack or VoiceOver on buttons and fields | Every control has a clear name (e.g. "Add money to Goa trip") | Auto: queries by name across all flow tests. Also on device |
| A11Y-2 | Keyboard | Tab through Home, the Add form and Settings on desktop | Every control is reachable; focus is visible; Escape closes sheets | Device |
| A11Y-3 | Touch size | Tap small controls | All tap targets are at least 44 px | Device |
| A11Y-4 | Colour | Check status with colour removed | Status is also stated in words and icons | Device |
| A11Y-5 | Reduce motion | Turn on "reduce motion" | Slides, pops and shakes are skipped | Device |
| A11Y-6 | Large text | Set the phone and the app text to largest | Nothing is cut off or overlaps | Device |
| A11Y-7 | Contrast | Check text on cards in both themes | Readable | Device |

## 16. Layout and feel

| ID | Check | Steps | Expected | Auto |
|---|---|---|---|---|
| VIS-1 | Safe areas | On a phone with a notch and home bar | Nothing sits under them; the bottom bar clears the home indicator | Device |
| VIS-2 | Tab slide | Switch tabs | A short directional slide (instant with reduce motion) | Device |
| VIS-3 | Sheets | Open and close the Add form and pickers | They rise from the bottom and the page behind doesn't scroll | Device |
| VIS-4 | No sideways scroll | Use every screen at 360 px, especially Settings | No screen scrolls, drifts or slides sideways, however you swipe | Auto (the rule that stops it): `app.flow`. **Device** (the feel) |
| VIS-8 | Four tabs | Look at the bottom bar at 360 px | Home, Activity, Insights and Settings fit with readable labels and 44 px tap targets | Auto: `BottomNav.test`. **Device** |
| VIS-9 | Numbers count up | Open the app; then log an expense; then switch month | The big number, Today / Yesterday / Last 7 days, Sent and Received count up to their value in under a second and land exactly on it. They count again only when the figure changes, not each time you return to Home. No decimals flicker while counting | Auto: `motion.flow`. **Device** (how it feels) |
| VIS-10 | Reduce motion | Turn on "reduce motion", open the app | Every figure shows its final value at once; the budget bar is simply there | Auto: `motion.flow`. Also on device |
| VIS-11 | Budget bar wipes in | Set a budget, open the app, go to Settings and back | The bar wipes in from the left once when the app opens, not when you come back to Home | Auto: `Meter.flow`. **Device** |
| VIS-12 | Typeface | Look at every screen, including the ₹ and other currency signs | Manrope everywhere, digits line up in columns, no missing-glyph boxes; the same with no network | Auto: `fonts.test`. **Device** |
| VIS-13 | Hidden amounts while counting | Turn on Hide amounts | Amounts stay hidden (₹••••); nothing counts up in view | Auto: `Home.test`, `app.flow` |
| VIS-5 | Dark and light | View every screen in both | No white flashes, no unreadable text | Device |
| VIS-6 | Rotate | Rotate the phone | Layout stays usable | Device |
| VIS-7 | Speed | Scroll Activity with 1,000+ entries | Smooth; typing in search stays responsive | Device |

---

## Not covered, on purpose

- **Notifications when the app is fully closed** need a server. Without one, an Android phone may wake the app now and then and an iPhone will not; the in-app nudge and the icon badge still work.
- **Translations:** the app is in English only.
- **Encryption of stored data:** the PIN lock is a screen lock, not encryption.

## Running the automated tests

```
npm test                       run everything (about 40 seconds)
npx vitest run --coverage      run with a coverage report
npx vitest run src/ui          run one folder
```

## Audit fixes

Cases added after the full review in [AUDIT.md](AUDIT.md). "Auto" names the test file that proves it.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| AUD-1 | Indian amounts | Type "2 lakh rent", "1.5 lakh", "10 lac", "1 crore", "2L", "1cr", "12,34,567 rent" | The full amount is saved, and the word is not left in the merchant | Auto: `localParser.more` |
| AUD-2 | Currency marks | Type "Rs.99 chai", "450/- lunch", "450rs lunch", "₹450lunch", "coffee .5" | Read correctly | Auto: `localParser.more` |
| AUD-3 | Dates in the sentence | Type "on 5th dinner 400", "coffee 120 on 28 oct", "12/03 dinner 800", "uber 230 mon", "18k rent last month" | Filed on that day; the date words are not in the merchant | Auto: `localParser.more` |
| AUD-4 | Several numbers | Type "2 coffees 100", "iphone 12 pro 79900", "dinner for 4 1200" | The price is the amount, not the quantity or model | Auto: `localParser.more` |
| AUD-5 | Two entries with "and" | Type "coffee 120 and lunch 340"; "coffee 120, lunch 340 yesterday" | Two entries; the trailing day covers both | Auto: `localParser.more` |
| AUD-6 | Money in or out | "got 500 from Ravi" is received; "maid salary 8000", "income tax 5000 paid" are spent | As described | Auto: `localParser.more` |
| AUD-7 | Currency typed | Type "$5 coffee" | Saved as 5 USD, and the message shows $5 | Auto: `localParser.more`, `app.flow` |
| AUD-8 | The message names the day | Type "Uber 230 yesterday" | "Added ₹230 to Transport, yesterday" | Auto: `app.flow`, `localParser.more` |
| AUD-9 | Too-large amounts | Type 99999999999999999999 | Refused; a backup can always be read back | Auto: `localParser.more`, `currencySetting` |
| AUD-10 | Damaged backup | Restore a file with a made-up currency, a day like 2026-13-45, a huge amount or a strange colour | Refused with a plain message, or the colour replaced; the app is never left unusable | Auto: `importBackup` |
| AUD-11 | Bad saved currency | A saved currency that is not a currency | The app falls back to rupees; if anything else breaks it shows "Something went wrong" with Reload, never a blank page | Auto: `currencySetting`, `useLedger.flow`, `ErrorBoundary.flow` |
| AUD-12 | Restore and the trash | Delete a transaction, restore the same backup (merge) | It comes back, not skipped; two identical lines in a file without times both count | Auto: `importBackup` |
| AUD-13 | Recurring added twice | Tap Add twice, or Add then Add all | One occurrence is added | Auto: `recurringOps` |
| AUD-14 | Rent on the 31st | A monthly rule made for the 31st, applied month after month | 31 Jan, 28 Feb, 31 Mar, 30 Apr, 31 May | Auto: `recurringOps` |
| AUD-15 | Double tap on Add | Tap Add twice in the same instant | Saved once | Auto: `AddSheet.flow` (fails without the guard) |
| AUD-16 | Undo of a chat entry | Add by typing, then Undo | Gone; not left in Recently deleted | Auto: `app.flow`, `trash` |
| AUD-17 | Bulk delete | Delete a selection that includes something already in the trash | Only the live rows are deleted, and Undo does not bring back the old one | Auto: `trash` |
| AUD-18 | Quick dates in Activity | On the row beside Filters and Select (it scrolls sideways when narrow), tap This month, Last month, Last 30 days, Any time | The list narrows to that range, and the chip shows pressed | Auto: `activity.flow`, `filters` |
| AUD-19 | Month carried from Home | Tap a category bar on Home while viewing a month | Activity opens on that category and that month; leaving and coming back starts fresh | Auto: `app.flow` |
| AUD-20 | Filters in use | Turn on any filter | A chip names it and removes it; "Clear search and filters" clears everything | Auto: `activity.flow` |
| AUD-21 | Day totals | More than 80 rows in one day | The day's total counts all of them; "Showing 80 of 85" says how many are out of view | Auto: `activity.flow` |
| AUD-22 | Search | Type words in any order, an amount, or an account name | Matches; "No transactions match “…”" names the search | Auto: `activity.flow`, `filters` |
| AUD-23 | Selection and filters | Select rows, then narrow the list | Only what is still showing counts and is deleted; Select all picks what is showing | Auto: `activity.flow` |
| AUD-24 | Move can be undone | Move a mix of spent and received to a category | Only spending moves, the message says what was left, and Undo puts the categories back | Auto: `activity.flow` |
| AUD-25 | Insights headline | Open Insights | "You spent ₹X in October", then what the biggest part was | Auto: `Insights.more` |
| AUD-26 | Empty month | Open a month with no expenses when others have some | "No expenses logged in October" and a button to the latest month with data | Auto: `Insights.more` |
| AUD-27 | Trends are fair | A person with two months of use | No "+400%"; the change appears only with two earlier months, and not at all while the month is in progress | Auto: `trends.more` |
| AUD-28 | Where it went, first | Open Insights | It sits right after the first numbers, and tapping a row opens those expenses for that month | Auto: `Insights.more`, `app.flow` |
| AUD-29 | Chart edges | View a 30-day month against a 31-day one | The grey line stays inside the chart | Auto: `PaceChart` |
| AUD-30 | Settings layout | Open Settings | Five headings (Your data and privacy, Money, Automatic, Appearance, More), a jump bar, and More folded away; it opens by itself when an update is waiting | Auto: `Settings` |
| AUD-31 | Currency change | Change the main currency with transactions present | A question first that says what will happen | Auto: `settings.flow` |
| AUD-32 | Message that waits | Hover or focus a message with Undo | It stays while you are on it, and leaves 3 seconds after; with an Undo it stays 9 seconds | Auto: `toast.flow` |
| AUD-33 | Screen titles | Switch tabs | The browser title names the screen | Auto: `app.flow` |
| AUD-34 | Loading | Open the app on slow storage | A grey outline of the page, never a blank page or "nothing here yet" | Auto: `ScreenSkeleton` |
| AUD-35 | Contrast | Every text, control edge, warning and category colour in light and dark | Text 4.5:1, edges and bars 3:1 | Auto: `contrast` |
| AUD-36 | Backup reminder | Say Later three times; look at an old month | A week, then a month, then three months; never shown on an old month | Auto: `backupSnooze`, `app.flow` |
| AUD-37 | Spreadsheet export | Export CSV and open it in Excel | ₹ and accented names read correctly | Auto: `exporters`. **Device** |
| AUD-38 | Looks | Look at the new Activity chips, Settings jump bar and skeleton at 360 px, both themes | Nothing clipped; readable | **Device** |
| AUD-39 | Tap a figure on Home | Tap Today, Yesterday or Last 7 days under the big number | Activity opens on the spending behind that figure for that day or week, with chips such as "Today" and "Spent" that take the filter off; a day with nothing spent is plain text, not a button; coming back later starts fresh | Auto: `app.flow`, `Home`, `activity.flow`, `filters` |

## Upcoming payments

Loans, UPI AutoPay, subscriptions, bills and salary: what is due, when, and whether the balance covers it.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| UPC-1 | Invitation | Open Home with nothing set up | One quiet line, "Track loans, auto-payments and salary", opens the upcoming payments. It is not shown while looking at an old month | Auto: `UpcomingCard.flow`, `app.flow` |
| UPC-2 | Add a loan | From the sheet tap Add, name it "Home loan", amount 12,500, type Loan EMI, date | It is saved with its type, and the day of the month it keeps to; the sheet lists it "In 6 days" and Home shows it | Auto: `RuleSheet.flow`, `app.flow` |
| UPC-3 | Weekly and money in | Choose Every week; choose Coming in | Repeats weekly; money in is filed under Income with the type "Salary or income" | Auto: `RuleSheet.flow` |
| UPC-4 | Which account | With two accounts, choose HDFC | The payment is checked against HDFC. With one account there is no question | Auto: `RuleSheet.flow` |
| UPC-5 | Mistakes | Leave out the name, amount or date; type 12abc | A plain message beside a warning icon; nothing is saved | Auto: `RuleSheet.flow` |
| UPC-6 | Change, pause, delete | Open a payment, change its amount or date; pause it; delete it | Saved; a paused one is left out of what is coming and listed under Paused; delete asks first and a no keeps it | Auto: `RuleSheet.flow`, `UpcomingSheet.flow` |
| UPC-7 | The schedule | Open Upcoming payments with a loan, a UPI AutoPay and a salary | Date order; each row says its type, how many days away ("Today", "Tomorrow", "In 6 days"), and the amount, with money in marked + | Auto: `UpcomingSheet.flow`, `upcoming` |
| UPC-8 | Weekly and month-end | A weekly payment; a monthly one for the 31st | The weekly one repeats through the window; the 31st one returns to the 31st after a short month | Auto: `upcoming` |
| UPC-9 | Look ahead | Choose 30, 60 or 90 days | The list and the totals follow; a monthly payment appears again | Auto: `UpcomingSheet.flow` |
| UPC-10 | Late payments | A payment whose date has passed and was not added | Shown first as "Overdue by 2 days" with a warning icon, and counted from today | Auto: `UpcomingSheet.flow`, `upcoming` |
| UPC-11 | This month | Look at the summary | What is still to go out and come in this month, how many payments are left, or "Nothing else is due this month" | Auto: `UpcomingSheet.flow`, `upcoming` |
| UPC-12 | Is it enough? | Balance higher than what is coming; lower; salary arriving before the payment | "Your balance covers these payments" with how low it gets; or "short by ₹X from 5 Nov. Add at least ₹X"; a salary that arrives first counts | Auto: `UpcomingSheet.flow`, `UpcomingCard.flow`, `upcoming` |
| UPC-13 | Same day | A payment and money in on the same day | The payment is counted first, so a warning is never missed | Auto: `upcoming` |
| UPC-14 | Each account | Several accounts, each with a balance set | One line per account that has payments: enough, or short by how much; "move or add money" when one is short | Auto: `UpcomingSheet.flow`, `upcoming` |
| UPC-15 | No balance set | Open it before ever setting a balance | No claim of a shortage (the estimate would start at zero); it says to set the balance | Auto: `UpcomingSheet.flow`, `UpcomingCard.flow` |
| UPC-16 | Another currency | A payment in USD with and without a rate | Converted when there is a rate; counted at face value with a plain warning when there is not | Auto: `UpcomingSheet.flow`, `upcoming` |
| UPC-17 | In a backup | Back up and restore | The type and the day of the month come back; an unknown type is refused; older files still load | Auto: `importBackup` |
| UPC-18 | From Settings | Settings, Automatic, Recurring | A button leads to the upcoming payments | Auto: `Settings` |
| UPC-19 | Looks | View the sheet and card at 360 px and the largest text, both themes | Nothing clipped; amounts stay on one line; the warning reads clearly | **Device** |

## Home redesign

Home answers four questions in order: where do I stand, am I doing okay, where did it go, what can I improve.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| HR-1 | The order | Open Home with a budget, a goal and a regular payment | Greeting, month, then one spending overview, then cash flow, what is coming up, the day-by-day chart, recent transactions, where it went, one insight, and goals | Auto: `Home` |
| HR-2 | Greeting | Open Home in the morning, afternoon and evening | "Good morning" until noon, "Good afternoon" until five, "Good evening" after, with the full date beneath; a screen reader hears "Home" first | Auto: `HomeHeader`, `app.flow` |
| HR-3 | One headline number | Look at the overview | "Spent so far in October" and one number, 36 to 40 px, not larger; the comparison with last month in words and an arrow; the daily average and expenses logged side by side | Auto: `SpendingOverview` |
| HR-4 | The budget | With and without a budget | Without: "Your budget. Set a monthly budget to see how much you have left." and a Set budget button. With: the progress and how much is left | Auto: `SpendingOverview` |
| HR-5 | Compact days | Look under the budget | Today, Yesterday and Last 7 days as small tiles that do not compete with the headline; each with something behind it opens those transactions; a day with nothing is plain text | Auto: `SpendingOverview`, `app.flow` |
| HR-6 | Cash flow | Look below the overview | What was received (green) and the estimated balance side by side in one card; the balance stays hidden until Show balance | Auto: `WalletPanel`, `Home` |
| HR-7 | Recent transactions | Scroll Home | Recent transactions come before Where it went, flat headings without extra boxes | Auto: `Home`, `app.flow` |
| HR-8 | One real insight | Look near the bottom | "Understand your spending" with a true statement from the month's transactions, such as the biggest category's share, and a button to Insights; nothing when nothing was spent | Auto: `InsightCard`, `app.flow` |
| HR-9 | Goals with context | Have a goal | A Goals block with the nearest goal, what is saved of what it costs, a progress bar in amber, what is left or how long, and how many more goals; the header button keeps its ring but not a bare percentage; no block when there are no goals | Auto: `GoalsSummary`, `GoalsButton`, `Home` |
| HR-10 | Soft dark theme | Use the app in dark mode at night | A charcoal page with lighter cards and off-white text, not black on bright white; every text, edge and colour still passes the contrast check | Auto: `contrast`. **Device** (how it feels) |

## The back button

On a phone, back moves back through the app instead of leaving it. It leaves the app only from Home with nothing open.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| BAK-1 | From a tab | Open Activity, Insights or Settings, then press back | You are on Home, not out of the app | Auto: `backButton.flow`. **Device** |
| BAK-2 | From Home | On Home with nothing open, press back | The phone leaves the app as it always did | Auto: `backButton.flow`. **Device** |
| BAK-3 | Tab to tab | Home, then Activity, then Insights; press back | One press goes to Home | Auto: `backButton.flow` |
| BAK-4 | A sheet | Open the goals, the add form, upcoming payments, a picker or the month list; press back | Only that closes; you stay where you were | Auto: `backButton.flow`, `backStack.flow` |
| BAK-5 | Sheet in a sheet | Open Goals, then New goal on top; press back twice | The first press closes New goal, the second closes Goals | Auto: `backButton.flow` |
| BAK-6 | A list in the form | Open the add form, then the Currency list; press back | The list closes and the form stays | Auto: `backButton.flow` |
| BAK-7 | In Activity | Open the filters, or select mode; press back | That closes first; a second press goes to Home | Auto: `backButton.flow` |
| BAK-8 | Closed another way | Close something with its Close button, Escape, or the tab bar | Nothing is left behind: the next back press is not wasted | Auto: `backStack.flow`, `backButton.flow` |
| BAK-9 | Many times | Open and close a sheet again and again | Back does not pile up or need extra presses | Auto: `backStack.flow`, `backButton.flow` |
| BAK-10 | After a reload | Reload the page while a sheet is open, then press back | The first press is not wasted | Auto: `backStack.flow`. **Device** |
