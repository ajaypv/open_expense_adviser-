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
| Test files | 80 |
| Tests | 1072 |
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
| SUG-3 | Tap the tile | Tap a tile, anywhere except the plus | The add form opens filled in with that merchant, amount, category and way of paying, for you to check; nothing is saved until you save it | Auto: `app.suggestions.flow`, `SuggestionList.flow` |
| SUG-4 | Ranking | Log a merchant on Mondays; check on a Monday | It ranks high with "Usually on Mondays" | Auto: `suggestions.test` |
| SUG-5 | Near here | With location on, revisit a place | Places you paid near here rank higher | Auto: `suggestions.test`. Also on device |
| SUG-6 | The plus adds at once | Tap the plus on a tile | No form: it is saved straight away for today at the usual amount, category and way of paying; a message says "Added Cafe, ₹450" (or "Received ₹80,000 from Employer") with the category icon, and the plus turns to a tick for a moment | Auto: `app.suggestions.flow`, `SuggestionList.flow`; look by eye |
| SUG-7 | Undo | Tap Undo in the message after adding with the plus | It is removed completely, not left in the trash | Auto: `app.suggestions.flow` |
| SUG-8 | Never twice | Tap the plus twice quickly, or again just after the tick appears | Only one is added, however fast; if saving fails the tile stays a plus and can be tried again | Auto: `app.suggestions.flow`, `SuggestionList.flow` |
| SUG-9 | Which tiles have a plus | Look at tiles on Home, above the chat box and in the add form | Only the Home tiles have the plus button; the slim chips elsewhere still open the form, and a transfer is never offered for one-tap adding | Auto: `SuggestionList.flow` |
| AHD-1 | Next EMI | Set up a regular payment of type Loan EMI, then open Home | Under the Today, Yesterday and Last 7 days figures, Plan ahead shows Next EMI with its name, date, how soon (in 8 days, tomorrow, today, overdue by 3 days) and amount | Auto: `ahead`, `PlanAhead.flow`, `Home` |
| AHD-2 | Biggest payment | Have two or more payments going out in the next 30 days | The biggest one is shown with its date and amount; if it is the EMI, the EMI row says "and your biggest payment" instead of listing it twice; one payment alone is not called the biggest | Auto: `ahead`, `PlanAhead.flow` |
| AHD-3 | Money coming in | Set up a salary or other regular income | A row shows when it next arrives and how much, with a + | Auto: `ahead`, `PlanAhead.flow` |
| AHD-4 | Save this much | Set a balance too low for what is due | A box says "Save ₹X more by <date>" with about how much a day gets you there, in a warning colour and with a warning icon | Auto: `ahead`, `PlanAhead.flow` |
| AHD-5 | No balance set | Have payments set up but no balance | A box says how much goes out in the next 30 days and about how much a day to keep aside, and to add the balance to check it | Auto: `ahead`, `PlanAhead.flow` |
| AHD-6 | Covered | Set a balance that covers everything due | No save box (Coming up already says it is covered) | Auto: `ahead`, `PlanAhead.flow` |
| AHD-7 | When it is not shown | Open a past month, or have no regular payments set up or all switched off | Plan ahead is not there | Auto: `Home`, `PlanAhead.flow` |
| AHD-8 | One list button | Look at Home with payments set up | Only the Coming up card has See all upcoming payments; Plan ahead has no button of its own, so a screen reader hears it once | Auto: `PlanAhead.flow`, `app.flow` |
| SET-1 | A short list | Open Settings | A title, a Backup card (when it was last backed up, and Back up now), an App update card (version, Check for updates or Update now, What is new), then four rows: Money, Automatic, Appearance, Privacy and data, each with a line saying what is on it | Auto: `Settings`, `settingsNav.flow` |
| SET-2 | A page of its own | Tap a row | That page slides in with its title and a back button, and holds only its own settings: Money (currency, accounts and balance, budget), Automatic (regular payments, reminders, suggestions), Appearance (theme, text size, hide amounts, number format), Privacy and data (backup, export, restore, recently deleted, app lock, location) | Auto: `Settings`, `settingsNav.flow` |
| SET-3 | Back | On a page, tap the back button, or press the phone back button | Back to the list; pressing back again goes to Home; nothing is left behind in the history when closed with the button | Auto: `settingsNav.flow` |
| SET-4 | Straight to Money | Tap Set budget or Set balance on Home or Insights | Settings opens on the Money page; opening Settings from the tab bar later shows the list again | Auto: `settingsNav.flow` |
| SET-5 | Backup and update at hand | Open Settings on a fresh install | Backup says Never backed up and the button works; an update that is waiting shows Update ready and Update now without opening anything | Auto: `Settings`, `settings.flow` |
| SET-6 | Settings still work | Change a setting on its page (hide amounts, a budget, a reminder) | It saves as before | Auto: `settingsNav.flow`, `settings.flow`, `app.flow` |
| AI-1 | Ways in | On Insights tap AI insights at the top; on Home tap AI summary on the Understand your spending card | The AI insights sheet opens on the month being shown; nothing is offered before anything has been spent | Auto: `aiNav.flow` |
| AI-2 | Closing | Tap Close, or press the phone back button | It closes and you are where you were; nothing is left in the history | Auto: `aiNav.flow` |
| AI-3 | The sentence to open on | Open AI insights in a month with spending | The page fills the screen. It opens on one sentence: where the month will probably end, and how far inside or over the budget (or what has been spent, or that the budget has been passed), then how that compares with last month and how much of it leaves on its own, with what has gone and what is still to come | Auto: `AiSheet.flow`; look by eye |
| AI-4 | The month as one bar | Look under that sentence | One bar for the whole month: spent so far, what has already left on its own (EMIs, autopay, subscriptions), what is still to leave, and what you are likely to spend on top; a line for the budget with anything past it struck through, and an empty outline for room left; every part named underneath with its amount; the segments draw left to right when scrolled to | Auto: `AiSheet.flow`, `ai`; look by eye |
| AI-5 | Where the rest went | Scroll to it | The biggest categories as one coloured bar and as a list with amount, share and how each moved against the same days last month | Auto: `AiSheet.flow` |
| AI-6 | Where it is leaking | Scroll to it | The biggest leaks first (a category above its usual, something bought again and again, weekends that cost more, many small purchases), each with the evidence, what stopping it keeps a month and a year, and a switch; the total, the year and where the month would end follow the switches as they change | Auto: `AiSheet.flow`, `ai` |
| AI-7 | What next month looks like | Scroll to it | What next month will probably cost, the range it will most likely land in, the part that leaves on its own and the everyday part, what a year of it comes to, and the last five months as columns | Auto: `AiSheet.flow`, `ai` |
| AI-8 | Plays as you scroll | Open it and scroll down slowly | The page itself holds still; each line, bar, dot and number inside a part draws or counts as that part reaches the screen, and not while it is off screen; closing and reopening plays them again | Auto: `AiSheet.flow` (observer faked); Device |
| AI-9 | Honest about what it is | Read the top and the foot | It says it is worked out on the phone from your entries and sent nowhere, and that the figures are estimates, not advice | Auto: `AiSheet.flow` |
| AI-10 | Less motion | Turn on reduce motion, then open it | Everything is already in place; numbers show their final figures; nothing draws, grows, rises or breathes | Auto: style sheet; Device |
| AI-11 | Regular payments in the forecast | Set up an EMI due later this month, then open AI insights | Where it is heading includes it in full on its due day: the line steps up there, the month-end figure is higher by that amount, and a line says how much of regular payments is still to leave | Auto: `ai`, `AiSheet.flow`; look by eye |
| AI-12 | Not a habit | Have an EMI added by the recurring feature (or typed by hand under the same name as a regular payment) | The everyday pace leaves it out, so a payment on the 5th does not inflate the rest of the month | Auto: `ai` |
| AI-13 | Regular payments and EMIs | Set up regular payments and an EMI | A small part with what regular payments cost a month, what EMIs cost, what is still due this month, the next EMI and its date, and what share of the income goes on them and what is left | Auto: `ai`, `AiSheet.flow` |
| AI-14 | Too much committed | Set an EMI above 40% of income, or regular payments above 60% | A finding says so, first, with the amounts; a late payment is counted as leaving tomorrow | Auto: `ai`, `AiSheet.flow` |
| AI-15 | Save by a date | Set a balance too low for the payments due | A finding says how much to save by which day and about how much a day, ahead of the others | Auto: `ai` |
| AI-16 | Budget and payments together | Set a budget the payments still due would take past | What can be spent a day is worked out after the payments still due; if they alone take what is left, a finding says so | Auto: `ai` |
| AI-17 | What leaves on its own | Set up an EMI and a subscription, let one leave, then open the page | A timeline of the month with each payment where it falls (filled once gone, a ring while to come, red if late; bigger for bigger amounts), then a list with each one’s kind, date and where it stands; what they come to in an average month, against the income; the next EMI | Auto: `AiSheet.flow`, `ai` |
| AI-18 | Deductions are in the estimate | Compare the month’s end with and without an EMI still to leave | The month ends higher by that EMI, on its day; the bar has it as a hatched part; an EMI added by the recurring feature is not spread over the month as everyday spending | Auto: `ai`, `AiSheet.flow` |
| AI-19 | Nothing set up | Open it with no regular payment set up | Under What leaves on its own, a line says nothing is set up and that adding EMIs, subscriptions and autopays will make the estimate count them | Auto: `AiSheet.flow` |
| AI-20 | Estimate with a range | Open it with a few months of entries | Next month is split into what leaves on its own and everything else, with a range from the months’ own ups and downs | Auto: `ai`, `AiSheet.flow` |
| AI-21 | Full screen, held still | Open it and scroll | It comes up from just below and covers the screen with the theme’s own backdrop; a header with Close stays at the top; the page does not slide its parts up: only lines, bars, dots and numbers draw, each when reached | Auto: `AiSheet.flow`; Device |
| AI-22 | Typography | Open AI insights in any theme | The sentence it opens on, the section headings and the big figures (leak total, next month) are in Newsreader, a serif, larger than the type around them, with the rupee sign and level, lining figures that do not jump as they count; lines break evenly; the small type, lists and labels stay in the theme’s own typeface, and so does the word beside a big figure (a month); offline it is the same, since the font is in the app | Auto: `AiSheet.flow`, `fonts`; look by eye |
| THM-1 | The picker | Settings, Appearance | Colour theme has two groups: Colours (Classic, Ocean, Forest, Sunset, Lavender, Rose) and Glass and futuristic (Liquid Glass, Pearl, Aurora, Neon, Obsidian); each card is a small page drawn in that theme’s own colours, glass and typeface with its name and a line; the three that are always dark say so; the chosen one has an outline and a tick; light or dark is below, under Mode | Auto: `DisplaySection.flow`, `Settings`; look by eye |
| THM-2 | A theme applies everywhere | Choose Ocean, then visit Home, Activity, Insights, Settings and the add form | The page, cards, lines, buttons, switches, the selected tab and the pop-up all take its colours; nothing is left in the old ones | Device; look by eye |
| THM-3 | Light and dark | With each theme, choose System, Light and Dark (and change the phone setting) | Every theme has a light and a dark version, each readable; light or dark and the colour theme are chosen separately and keep each other | Auto: `useTheme`, `palettes`; look by eye |
| THM-4 | Categories stay put | Switch themes while looking at categories on Home, Activity and Insights | Every category keeps its own colour in every theme; good, warning and critical colours keep their meaning; charts that are not a category use the theme accent | Auto: `palettes` (the themes never set them); look by eye |
| THM-5 | Remembered | Pick a theme, close the app, open it again | It opens in that theme with no flash of the classic colours first; the browser bar takes the page colour; choosing Classic forgets the choice | Auto: `useTheme`, `settingsNav.flow`; Device |
| THM-6 | Readable | Look at text, outlines, buttons, the pop-up and charts in each theme, in light and dark | Text is 4.5:1 or more on every surface, control outlines 3:1, button words 4.5:1, pop-up words 7:1, accent 3:1 on cards | Auto: `palettes` (every theme, both modes) |
| THM-7 | Storage blocked | Open in a private window with storage blocked | A choice still applies for that visit; it opens in the classic colours | Auto: `useTheme` |
| THM-8 | Glass look | Choose Liquid Glass, then visit Home, Activity, Insights, Settings | The page has soft colour behind it that stays put as you scroll; cards are translucent with a bright top edge and a fine rim; the tab bar, sheets and pop-ups are frosted over what is behind them; text stays easy to read on all of it | Device; look by eye |
| THM-9 | Typeface | Choose Liquid Glass, Aurora, Neon, then Obsidian | The whole app changes typeface: Plus Jakarta Sans, Space Grotesk, Exo 2, Manrope; amounts keep their ₹ and line up in columns; figures count up without jumping | Auto: `palettes`, `fonts`; Device |
| THM-10 | Always dark | Choose Aurora, Neon or Obsidian, then set Mode to Light | The app stays dark and a line under Mode says so; the browser bar is dark; native controls are dark | Auto: `palettes`, `DisplaySection.flow`; Device |
| THM-11 | Liquid Glass has both | Choose Liquid Glass and switch Mode between Light and Dark | A bright airy light version and a deep blue dark version, each with its own backdrop | Auto: `palettes`; look by eye |
| THM-12 | Neon | Choose Neon | Black with a faint grid, a cyan edge on the cards, and buttons that glow | Device; look by eye |
| THM-13 | No blur, or less transparency | Open on a browser without backdrop-filter, or turn on Reduce transparency | Cards and bars are solid in the theme’s own colours and every word is still readable; nothing is lost but the frosting | Auto: `palettes` (the rules are gated); Device |
| THM-14 | Glass is readable | Look at every kind of text and every category colour on the glass cards of each theme, over the strongest colour in its backdrop | Text is 4.5:1 or more, category colours and the accent 3:1 or more | Auto: `palettes` (checked over the worst of the art, for each theme and mode) |
| THM-15 | Fonts offline | Choose a glass theme, go offline, reload | The typeface still loads from the app, with the ₹ sign | Auto: `fonts`; Device |
| THM-16 | Pearl | Choose Pearl in light, then dark | Light: a pale pearl page with soft lavender at the top, cream at the bottom left and a hint of peach on the right; frosted white cards with a bright rim; thin, tightly spaced titles in Geist; dark neutral buttons with violet accents. Dark: deep violet-black with the same glow | Auto: `palettes`, `DisplaySection.flow`; look by eye |
| WGT-1 | Add the widget | On Windows 11, install the app from Edge, press Windows + W, choose the plus, find Expense Tracker, add Spending | A Spending widget appears in the Widgets Board showing: the month so far, what has been spent, where the month is heading (coloured good, warning or attention), against the budget or last month, what can be spent a day, the next payment that leaves on its own, and when it was last updated; it has an Open Expense Tracker button | Device (Windows 11 + Edge); `widget.test` checks the template, data and manifest |
| WGT-2 | Before any figures | Add the widget before opening the app | It shows a placeholder (Open the app to load this month) rather than nothing | Auto: `worker`; Device |
| WGT-3 | Kept current | Add an expense in the app with the widget on the board | Within a second or so the widget shows the new figures and a new Updated time; with the app closed it keeps what it last had and says when that was | Auto: `useWidgetSnapshot`, `publish`, `worker`; Device |
| WGT-4 | The button | Press Open Expense Tracker on the widget | The app comes forward, or opens | Device |
| WGT-5 | Hide amounts | Turn on Hide amounts, then look at the widget | Amounts on the widget are dots too | Auto: `widget.test`; Device |
| WGT-6 | Settings, on Windows with Edge | Settings, Automatic, Widget | Says it is available here, how to add it in three steps, and that it updates when the app is opened; Update the widget now brings it up to date and says so, or says what to do if it could not | Auto: `WidgetSection.flow` |
| WGT-7 | Settings, on a phone | Open the same place on Android or iPhone | Says it is not on this device and why (web apps cannot add home-screen widgets), points at the shortcuts on the app icon (Add expense, Add received money) and at where it can work; no button that cannot work | Auto: `WidgetSection.flow`; Device |
| WGT-8 | Nothing extra on a phone | Use the app on a phone | It does no widget work at all: nothing is worked out or left for a widget | Auto: `useWidgetSnapshot` |
| WGT-9 | Works offline | Add the widget, go offline, restart Windows or Edge | The widget still draws from what is stored: its template and placeholder are saved with the app | Auto: `widget.test` (json precached); Device |
| ICO-1 | A bill has its own icon | Add an expense in Bills & Utilities (e.g. BESCOM); look at its row and the pop-up | A receipt, not a lightning bolt (the bolt stays for electricity, water, internet and gas categories) | Auto: `categoryIcon.test`, `toastIcons.flow`; Device |
| ICO-2 | A mobile recharge has its own icon | Add "299 jio recharge", or any merchant such as Airtel, Prepaid, DTH | A phone with a plus, in the row, the list and the pop-up, even though it is filed under Bills & Utilities | Auto: `categoryIcon.test`, `toastIcons.flow`; Device |
| ICO-3 | An EMI has its own icon | Add an expense whose merchant or category says EMI, loan or instalment; or a regular payment of type Loan EMI | A calendar of instalments, wherever it is shown | Auto: `categoryIcon.test`, `PaymentBadge.test`; Device |
| ICO-4 | Regular payments show their kind | Open Upcoming payments, Insights (Due next), AI insights (payments that leave on their own), Plan ahead | Each row has a round icon: calendar for EMI, receipt for a bill, phone for a recharge, circling arrow for UPI AutoPay, repeat for a subscription, arrow in for income; the type is still written beside it | Auto: `PaymentBadge.test`; Device |
| ICO-5 | Words only count at the start | A merchant such as Remit or Gemini | Not taken for EMI | Auto: `categoryIcon.test` |
| BIL-1 | Bills split | Insights, a month with an EMI, recharges, electricity and other bills | A section Bills, recharges and EMIs says what went on them and what share of the month; one bar is cut into parts, and each part is listed with its icon, payments, share of the bills, share of the month and amount, biggest first | Auto: `billSplit.test`, `Insights.bills.flow`; Device |
| BIL-2 | Filed anywhere | Add an EMI under Shopping, or a regular payment of type Loan EMI called anything | It counts as EMIs and loans, not as shopping; its category in the donut and bubbles is unchanged | Auto: `billSplit.test` |
| BIL-3 | Parts | Add BESCOM, Water bill, LIC, Health insurance, Society maintenance | Electricity, water, gas and internet; Insurance; and Other bills, each on its own line | Auto: `billSplit.test` |
| SET-CRED | Settings in the new style | Open Settings | A rounded panel at the top holds Backup and App update; below, quiet group titles (Your money, Make it work for you, Safe and private) over rows with a thin line icon, the page name, a one-line summary, the currency, regular-payment count or theme on the right, and a thin chevron; each page opens with a soft round back button; all in Plus Jakarta Sans | Auto: `Settings.test`; Device |
| SET-SUG | Suggestions has its own page | Open Settings | Suggestions is its own row (under Make it work for you, with where they show on its right); it opens a page with the three choices: On the Home screen, Above the input bar, Off; Automatic no longer holds it | Auto: `Settings.test` |
| TL-1 | Two pages on Home | Open Home | Two tabs at the top, Overview and Timeline; Overview is chosen; the rest of Home is as it was | Auto: `HomePager.flow`, `homeTimeline.flow`; Device |
| TL-2 | Press the tab | Press Timeline | The page slides left and the timeline comes in from the right, the tab marker sliding with it; Overview slides it back | Auto: `HomePager.flow`; Device |
| TL-3 | Swipe | Drag Home to the left with a finger, and drag the timeline to the right | The page follows the finger and lets go to the nearer page, or the way a quick flick was going; a short drag springs back; past either end it gives only a little | Auto: `HomePager.flow`; Device |
| TL-4 | Swipe does not steal | Drag across the Day by day chart, the summary card (changes month), or a row that scrolls | Those keep their own gesture; the page does not move; up and down scrolling is unaffected | Auto: `HomePager.flow`; Device |
| TL-5 | The days | Open the timeline | It begins straight with the days (no last-7-days summary card): a key from Spent less to Spent more, then newest first, a dot for each day on a line; each dot is the date (weekday small over the number) in a ring coloured by how much was spent that day against your biggest: calm teal for little or none, amber, warm coral for the most; each day has its total, a bar as long as the day is against the biggest, split by category colour, and chips for the top categories | Auto: `Timeline.flow`, `homeTimeline.flow`, `timeline.test`; Device |
| TL-6 | Days with no spending | Look at a gap of days with nothing spent, and a month change | A day with no spending has its date in a green dot and says No spending on that day, Nicely done; a run of days folds into one line with a tick in the dot and Well done; today with nothing yet says A good start; a month heading appears where the month changes, with what that month came to, and the line goes on through it | Auto: `Timeline.flow`, `timeline.test` |
| TL-7 | Open a day | Press a day | It opens by growing: every category with its icon, share and amount, then each expense (an EMI or recharge by its icon), and a button to see that day in Activity; one day open at a time | Auto: `Timeline.flow`; Device |
| TL-8 | Earlier days | Scroll to the bottom | Show earlier days adds 30 more, until the first expense | Auto: `Timeline.flow` |
| TL-9 | The line | Scroll the timeline slowly down, then back up | One continuous line is drawn as you scroll, a little behind the finger so it flows: the coloured river fills from the top down to about 60% of the way down the screen, with a bead of light riding its leading edge; each date is dark and small until the line reaches it, then fills in its colour with a small spring; scrolling back up un-draws it; opening a day does not break it | Auto: `useLineScroll.flow`, `Timeline.flow` (style rules); Device |
| TL-10 | The line's shape | Look at the line between days | It runs straight down from one date to the next, never bending or crossing itself or a date; it is narrow after a quiet day and broad after a big one, easing from one width to the next, and changes colour from one day's to the next; it carries on through a month heading | Auto: `river.test`, `Timeline.flow`; Device |
| TL-11 | Today's ring | Look at today's date | A thin ring gives out a ping now and then, small enough to stay in its own column: nothing is cut off on the left, and the card beside it does not cover it; with reduced motion it does not move | Auto: `Timeline.flow`, `HomePager.flow`; Device |
| TL-12 | Reduced motion | Turn on reduce motion, open the timeline | The whole line is drawn and every date lit at once; no bead, no ping, no spring; the pages swap without sliding | Auto: `useLineScroll.flow`, `Timeline.flow` |
| TL-13 | Today's water bar | Look at today's bar on the Timeline, then add an expense | Only today's bar is water: it is a little taller, as long as the day is against your biggest, and two waves roll along its surface and slosh up and settle when it comes into view; the expense added last floats on the end of the bar in its category's icon, bobbing and tipping, and the bar ends on that category's colour; adding another makes a new icon drop in with a bounce; every other day's bar is still and flat; with reduced motion nothing moves | Auto: `Timeline.flow`; Device |
| PERF-1 | Dragging between Overview and Timeline stays smooth | Drag Home sideways slowly and quickly on a phone, and watch the page and the tab marker | Both follow the finger at the screen's full rate with no stutter, however long the page is; they glide to their place when let go; the page is not redrawn while the finger moves (only a transform is written) | Auto: `HomePager.flow` (no redraw per move, no custom property); Device (Chrome performance panel: no style recalculation per move) |
| PERF-2 | The page not in view costs nothing | Be on Overview, scroll; then be on Timeline, scroll | The page that is out of view is not laid out, drawn or animated (its rings and bars are paused), so scrolling the one in view is as cheap as if the other did not exist; the timeline's line does no work at all while Overview is scrolled | Auto: `HomePager.flow` (style rules), `useLineScroll.flow` (out of sight) ; Device |
| PERF-3 | Opening the timeline does not stall | Open the app, wait a moment, press Timeline | It is built while the app is idle, so the slide starts at once instead of stalling to make thirty days of rows | Auto: `HomePager.flow` |
| PERF-4 | The line draws cheaply | Scroll the timeline | Where everything is is measured once (and again when the list changes size), not at every frame; a frame reads only the scroll position; only the stretches and dates that changed are written; it stops asking for frames when settled | Auto: `useLineScroll.flow` |
| PERF-5 | Opening a day redraws two rows | Open a day, then another | Only the day that opens and the one that shuts are redrawn, and the line's drawings are not made again; a new expense redraws only the stretches next to its day | Auto: `Timeline.flow` |
| BIL-4 | Nothing to split | A month with no bills | The section is not shown | Auto: `Insights.bills.flow` |
| BIL-5 | Bills divided in the charts | Insights, Where it went, in a month with an EMI, recharges and electricity as well as other categories | In Bubbles, Donut and List the one Bills and utilities bubble, segment or bar is replaced by EMIs, Recharges, Utilities (and Insurance, Other bills where there are some), each with its own icon, share and amount, in shades of the Bills colour; the line under the heading says bills are divided | Auto: `billSplit.test`, `Insights.bills.flow`; Device |
| BIL-6 | Tapping a part | Tap the EMIs bubble | Activity opens on the category most of it was filed under | Auto: `Insights.bills.flow` |
| BIL-7 | Nothing to divide | A month where bills are only one thing (say only electricity) | Bills and utilities stays as one bubble, as before | Auto: `Insights.bills.flow`, `billSplit.test` |
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
| HOM-17 | Swipe the bottom bar | On Home, swipe left along the bottom bar, then right | Left shows the Timeline and right shows the Overview, the same as the tabs at the top; a swipe towards a page that is not there changes nothing; the tab under the finger is not pressed | Auto: `BottomNav.swipe.flow`, `HomePager.flow`, `homeTimeline.flow`; Device |
| HOM-18 | Swipe from another screen | On Insights, Activity or Settings, swipe the bottom bar left, then right | Home opens on the Timeline (left) or the Overview (right); the bar never swipes to Activity, Insights or Settings, which are for tapping; Home opened any other way starts on the Overview | Auto: `homeTimeline.flow`, `HomePager.flow` |
| HOM-19 | Budget as water on the card's border | Set a monthly budget, then look at the Overview card | The card's outline is the budget: a line in blue (amber near the limit, red when over) grows round the border from the top left, clockwise, as far as the share spent (a quarter spent, a quarter of the way round), over a faint track all the way round; ripples of water run along the filled part one way and fainter ones the other; the first time the app shows it the line fills from nothing, and adding spending moves it on to the new share; over budget it goes all the way round in red with quicker ripples; there is no bar or tank under the amounts, only the words (₹ left, Over budget by, the percentage); the corners of the line follow the card's at any text size; with reduced motion nothing moves; with no budget the card has no gauge; in Insights the category budgets stay plain bars | Auto: `WaterBorder.flow`, `Meter.flow`; Device |

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
| LOC-6 | A fresh position | Move to a new place and add an entry (chat bar or the form) | The saved place is where you are now, never a position the phone worked out minutes ago | Auto: `location.test`. Check on device |
| LOC-7 | Only while entering | Open the app, switch to another app and back, open and close the add form | The position is read when an entry is saved and when the add form opens, and at no other time: not at launch, not on returning to the app, not when the form shuts | Auto: `useNearby.flow`. Check on device |
| LOC-8 | Nothing kept | Open the add form, close it, open it again | Nearby suggestions never use the last position: it is dropped when the form shuts and read again when it opens | Auto: `useNearby.flow` |

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
| VIS-14 | Even card edges | In dark mode, open Activity and look at the edge of each day's card (top, sides, bottom, corners) | The same fine edge all the way round, with no brighter line along the top or corners only | Auto: `TxRow` (the edge is drawn inside the card, where the per-day clipping cannot cut it); look by eye |

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
| HR-1 | The order | Open Home with a budget, a goal and a regular payment | Greeting, month, then one spending overview, then cash flow, what is coming up, suggestions, the day-by-day chart, recent transactions, where it went, one insight, and goals | Auto: `Home` |
| HR-2 | Greeting | Open Home in the morning, afternoon and evening | "Good morning" until noon, "Good afternoon" until five, "Good evening" after, with the full date beneath; a screen reader hears "Home" first | Auto: `HomeHeader`, `app.flow` |
| HR-3 | One headline number | Look at the overview | "Spent so far in October" and one number, 36 to 40 px, not larger; the comparison with last month in words and an arrow; the daily average and expenses logged side by side | Auto: `SpendingOverview` |
| HR-4 | The budget | With and without a budget | Without: "Your budget. Set a monthly budget to see how much you have left." and a Set budget button, as its own block lower down, after the cash flow and the payments coming up, not inside the spending card. With: the progress and how much is left, kept right under the daily average | Auto: `SpendingOverview` |
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

## The pop-up

The message that confirms what was just done drops in from the top like an island, and shows which category the money went to.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| POP-1 | Where it went | Type "450 lunch at Cafe", "1200 groceries", "230 uber", "999 electricity", "600 pharmacy", "500 netflix", "1500 amazon", "20 something" | The pop-up shows that category's icon (fork and knife, cart, car, bolt, heart, ticket, bag, tag) and says "Added ₹… to …" | Auto: `toastIcons.flow`, `categoryIcon` |
| POP-2 | The category's colour | Add something to a category | The icon sits in a bubble tinted with that category's own colour | Auto: `toastIcons.flow`. **Device** |
| POP-3 | Money in, several, delete, copy | Type "Salary 80,000"; "coffee 120, lunch 340"; delete a transaction; copy one | An arrow in (green), a list, a bin, two sheets | Auto: `toastIcons.flow`, `AddSheet.toast.flow` |
| POP-4 | From the add form | Save a transaction from the form | The same icon and colour as typing it; a swap icon for a transfer; an arrow in for money received | Auto: `AddSheet.toast.flow` |
| POP-5 | Brief | Watch how long it stays | About 3 seconds; 4.5 with an Undo; it shrinks away rather than just vanishing | Auto: `toast.flow`. **Device** |
| POP-6 | Opening motion | Add something | It starts as just the icon, opens out to show the words, the icon pops in with a little bounce, and the words fade in a moment later | **Device** |
| POP-7 | Pausing | Hold a finger on it, or focus Undo | It stays while held and goes about 2 seconds after; a finger landing while it shrinks brings it back | Auto: `toast.flow` |
| POP-8 | Less motion | Turn on "reduce motion" | It just appears and disappears, with no opening, bounce or shrink | Auto: `toast.flow`, `contrast` |
| POP-9 | Readable | View it in light and dark | Text is easy to read on the pill; the pill stands out from the page | Auto: `contrast`. **Device** |
| POP-10 | Safe areas | On a phone with a notch | It sits below the notch, not under it | **Device** |

## Spending pace

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| PAC-1 | At rest: last month in full | Spend only at the end of one month, then open Insights early in the next | "November (so far)" beside "October (whole month)" with October's real total, never the zero of its first day, and a line such as "22% of what October came to in all" (or "₹X more than October came to in all", "Level with…", "October had no spending.") | Auto: `PaceChart.flow`, `PaceChart.previous` |
| PAC-2 | Pointing at a day | Touch, drag or use the arrow keys on the chart | It switches to the same day of both months ("Day 1", "October ₹0", "₹2,794 more than October") and still says "October came to ₹12,520 in all."; letting go returns to the whole-month view | Auto: `PaceChart.flow` |
| PAC-3 | The last day counts | Spend on the 31st of a 31-day month, then look at the next month (30 days) | Last month's line and total include the 31st; the chart is as wide as the longer month and this month stops where it is up to | Auto: `PaceChart.previous` |
| PAC-4 | First month | Open Insights in the first month of use | Nothing is said about a previous month | Auto: `PaceChart.flow`, `PaceChart.previous` |
| PAC-5 | The table | Tap Show as table | The last-month column is headed "October by then" (the running total up to that day), and the last row is "October, whole month" with what it really came to; neither appears in the first month of use | Auto: `PaceChart.previous`, `PaceChart` |
| PAC-6 | Scrolling through months | Open Insights with several months of spending; swipe along the strip of months above the chart and tap one | Each month shows what it came to (a dash when nothing was spent), the chosen one is highlighted and centred, the whole screen moves to it, and the chart is drawn afresh for that month | Auto: `MonthStrip`, `Insights.pace.flow` |
| PAC-7 | Comparing several months | With three earlier months of spending, choose Last 3 months | The chart adds a dashed line for each earlier month (each dashed differently), the legend lists every month with its whole-month total, and the sentence compares this month with the average of the three; pointing at a day reads every month at that day | Auto: `PaceChart.older.flow` |
| PAC-8 | Only real history | Look at a month whose earlier months include one with no spending, or the first months of use | The choice appears only for months that have history, offers "Last 2 months" when there are two, and stops at the first month with no spending, so there is never a hole | Auto: `Insights.pace.flow` |
| PAC-9 | Table with several months | Choose Last 3 months, then Show table | A column for each earlier month ("September by then"…) and a whole-month row for each; the table scrolls sideways instead of squeezing | Auto: `PaceChart.older.flow` |
| PAC-10 | Lines arriving | Change month, or open Insights | The lines are drawn from the first day to the last; with reduced motion they simply appear | Auto: `PaceChart.older.flow` (class only); look by eye |

## Keeps coming back

What the Insights screen says you keep paying for.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| REP-1 | A habit | In one month, pay the same name at least three times (any capital letters) | Insights shows "Keeps coming back" with the name, a badge such as "12×", how often ("almost every day", "about every week") and the usual amount, most often first | Auto: `repeats`, `Insights.repeats` |
| REP-2 | A monthly bill | Pay the same name once a month for three of the last four months, including the month in view | It is listed after the habits as "Every month, usually ₹6,000"; a name seen in only two of the four months, or not in the month in view, is not | Auto: `repeats` |
| REP-3 | The total | Look at the line under the list | "Together ₹X, N% of what you spent in October." using only what is listed | Auto: `Insights.repeats` |
| REP-4 | What is left out | Blank names, other months, trashed entries, money received and transfers | None of them is counted; with nothing repeating the whole section is missing | Auto: `repeats`, `Insights.repeats` |
| REP-5 | Following the month | Switch month | The list and its wording follow the month in view; a month that is over is judged on all of its days, the current one on the days so far | Auto: `repeats`, `Insights.repeats` |

## Regular payments in Insights

What regular payments cost and when they fall due, on the Insights screen (current month only).

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| REG-1 | The totals | Set up a few regular payments (monthly and weekly) and open Insights | "Regular payments" shows what they cost every month (a weekly one counts 52 weeks over 12 months) and in a year, what is still to pay this month, and the next 30 days | Auto: `regular`, `Insights.regular.flow`, `app.flow` |
| REG-2 | What is next | Look under the totals | "Next: Rent, ₹6,000 on …, in 3 days."; a list of the next five (money coming in marked with +); a bar list by kind of payment (Loan EMI, Bill…) when there are two or more kinds | Auto: `regular`, `Insights.regular.flow` |
| REG-3 | Share of income | Also set up a regular salary | "Regular payments take 24% of the ₹80,000 you expect each month." | Auto: `Insights.regular.flow` |
| REG-4 | Late and short | Leave a payment unadded past its date; set a low balance | "1 payment is late and has not been added."; with a balance set, either "covers all of it, with about ₹X left" or "would be short by ₹X from …"; nothing about the balance when none is set | Auto: `regular`, `Insights.regular.flow` |
| REG-5 | Not set up yet | Pay the same name for three months running without setting it up | "Looks regular, not set up yet" lists it with the amount and when it is next due, and what it would add a month; names already set up are not suggested | Auto: `Insights.regular.flow` |
| REG-6 | Nothing set up | Open Insights with none | An invitation and an Add regular payments button that opens the Upcoming list | Auto: `Insights.regular.flow`, `app.flow` |
| REG-7 | Looks ahead only | Look at an earlier month | The section is not there; it also shows before anything has been spent this month | Auto: `Insights.regular.flow` |
| REG-8 | Other currencies | Set up a payment in a currency with no exchange rate | It is counted at face value, and the section says which currency | Auto: `regular`, `Insights.regular.flow` |

## Category bubbles

The Where it went section of Insights, shown as bubbles.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| BUB-1 | Bubbles by default | Open Insights in a month with spending | "Where it went" has a Bubbles / List choice with Bubbles chosen; each category is a glassy bubble with its icon, name and share to one decimal (32.8%) and, in the bigger ones, the amount (₹25.3K); the area of the bubble matches its share, and nothing else is drawn inside it | Auto: `bubblePack`, `CategoryBubbles.flow`, `Insights.bubbles.flow`; look by eye |
| BUB-2 | Tap to open | Tap a bubble | Activity opens on that category for the month, as the list rows do | Auto: `CategoryBubbles.flow`, `Insights.bubbles.flow` |
| BUB-3 | Small shares | Have a category with only a few percent among many | Under 2% it is not a bubble of its own but part of one grey Everything else bubble (the three biggest always keep theirs); a bubble that is left is still big enough to tap and to hold its name | Auto: `bubblePack`, `CategoryBubbles.flow` |
| BUB-4 | Many categories | Spend in more than eight categories | At most the eight biggest (and only those of 2% or more, though always the top three) are bubbles; the rest are one grey Everything else bubble that opens nothing; the List shows every one | Auto: `CategoryBubbles.flow` |
| BUB-5 | Nothing hidden | Switch to Donut or List, and use a screen reader on the bubbles | The list shows the same categories ranked with bars and amounts; each bubble is read as name, share and amount | Auto: `Insights.bubbles.flow`, `CategoryBubbles.flow` |
| BUB-6 | Looks right in both themes | View it in light and dark, at 360 px and on a wider screen | Bubbles keep their proportions and their text stays readable on every colour; they arrive one after another (at once with reduced motion) | Device |

## Month bars, donut and status pills

The Insights look taken from the dark dashboard reference: hatched pill bars, a donut with a legend, and status pills.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| DSN-1 | Month bars | Open Insights and look at The last 12 months | A big total for the chosen month (the latest to begin with) with its change on the month before as an arrow, a percentage and words (▲ 12%, read as "Up 12% on September"), and "vs ₹5,000 in September"; hatched pill bars with a short cap line; the chosen bar solid with the change in a badge above it; a scale up the side and a label under every bar | Auto: `MonthColumns.flow`; look by eye |
| DSN-2 | Choosing a month | Tap a bar, drag a finger along them, hover with a mouse, or use the arrow keys | A tap or drag keeps its month until another is chosen; a mouse only looks and goes back when it leaves; the arrows stop at both ends | Auto: `MonthColumns.flow` |
| DSN-3 | A quiet month | Have a month with nothing spent | It is a thin flat bar, and the next month says "Nothing was spent in …" instead of a percentage | Auto: `MonthColumns.flow` |
| DSN-4 | Donut | In Where it went, choose Donut | A ring of rounded segments in the category colours with a gap between, the total in the middle, a legend of every category with share and amount, and a sentence such as "Most of it went on Groceries and Shopping, 70.0% together." | Auto: `CategoryDonut.flow`, `Insights.bubbles.flow`; look by eye |
| DSN-5 | Looking at one category | Tap a segment, or hover or focus a legend row | That segment gets thicker and the rest fade, and the middle shows its amount, name and share; tapping the segment again, or leaving the row, goes back to the total | Auto: `CategoryDonut.flow` |
| DSN-6 | Donut opens a category | Tap a legend row | Activity opens on that category; the grey Everything else row opens nothing | Auto: `CategoryDonut.flow` |
| DSN-7 | Status pills | Set up regular payments due soon, later, late, and a salary | In Due next each row has a pill with a dot and the words (In 2 days, Overdue by 3 days); the dot is amber within three days, red when late, green for money coming in | Auto: `Insights.regular.flow` |
| ANI-1 | Bubbles arrive | Open Where it went on Bubbles | The biggest bubble rises and pops in first and the others follow a beat apart; a band of light crosses the glass once, and each percentage counts up from 0 to its figure | Auto: `categoryMotion.flow`; look by eye |
| ANI-2 | Bubbles move | Change month while on Bubbles | A bubble that is in both months glides to its new place and size; one that is new pops in; pressing a bubble shrinks it a little | Auto: `categoryMotion.flow`; look by eye |
| ANI-3 | Donut draws | Choose Donut | The ring is drawn round, segment by segment in order, then the legend rows and the sentence rise in; the middle pops in | Auto: `categoryMotion.flow`; look by eye |
| ANI-4 | Donut responds | Tap a segment or hover a legend row | The middle pops in with the new reading; the ring is not drawn again | Auto: `categoryMotion.flow` |
| ANI-5 | List grows | Choose List, or open Places you spend most | Rows fade up one after another and each bar grows from the left; after ten rows the rest arrive together; a bar changes length smoothly when the figures change; pressing a row shrinks it a little | Auto: `categoryMotion.flow`; look by eye |
| ANI-6 | Less motion | Turn on reduce motion in the phone settings, then open all three views | Everything is already in place with nothing moving | Auto: style sheet check in `categoryMotion.flow`; Device |
| ANI-7 | Starts when seen | Open Insights and leave Where it went below the fold, then scroll down to it (try Bubbles, Donut and List) | Nothing plays while it is off screen; the animation starts from its first frame as it scrolls into view, and does not play again on scrolling away and back | Auto: `categoryMotion.flow` (observer faked); Device |
| DAY-1 | Columns | Open Home in a month with spending | Below cash flow and what is coming up, Day by day shows a column for each day of the month, as tall as the day was big; days that have not happened are thin ticks; weekend days sit on a light band; a dashed line marks the average day; the first of each week is labelled | Auto: `DayChart.flow`; look by eye |
| DAY-2 | Arrives when seen | Scroll Home down to the chart from the top | Nothing moves while it is off screen; as it comes into view the columns rise one after another, left to right, then the average line is drawn across | Auto: `DayChart.flow` (observer faked); Device |
| DAY-3 | Reading a day | Tap, drag a finger across, hover with a mouse, or use the arrow keys, Home and End | The chosen column lifts and the rest dim; its amount floats above it; below, the date, the amount and how it compares with the average (40% above, 2.3×, About your average, Nothing spent); a tap keeps it and a second tap puts it away; a mouse only looks; days that have not happened cannot be chosen | Auto: `DayChart.flow` |
| DAY-4 | What the day was | Choose a day with several expenses | The three biggest are listed with their category colour and amount, then "and N more"; Previous and Next day step through; See these opens Activity on that one day; Close puts it away | Auto: `DayChart.flow` |
| DAY-5 | What the days say | Look at the chart with no day chosen | Up to four short sentences: the biggest day (tap it to show that day), days above the daily budget, whether weekends or weekdays cost more, and quiet days or how long nothing has been spent | Auto: `days`, `DayChart.flow` |
| DAY-6 | Budget line | Set a monthly budget, then look | A red dashed line marks the daily share of the budget and any day above it wears a red cap; with no budget there is neither; the line is left out if every day is far below it | Auto: `DayChart.flow` |
| DAY-7 | By category | Choose By category | Each column becomes a stack in category colours, the same order every day, with a legend; the colours change smoothly, and the chosen day stays chosen | Auto: `DayChart.flow`; look by eye |
| DAY-8 | Another month | Change month on Home | The chart is drawn afresh for that month with no day chosen; a finished month counts every day and has no marker for today | Auto: `DayChart.flow`; look by eye |
| DAY-9 | Less motion | Turn on reduce motion, then open Home | The columns and lines are already in place; nothing rises or draws | Auto: style sheet; Device |
| DAY-10 | Same figures as a table | Choose Show as table under the chart | Every day with spending and its amount | Auto: `DayChart.flow` |
| SUG-1 | Tiles | Open Home in the current month with some regular spending | Suggested for now has a line saying what to do, then tiles: the category icon, a plus, the merchant, the amount large, and the reason in full; money received has a + and green; they come in one after another when scrolled into view | Auto: `SuggestionList`, `Home`; look by eye |
| SUG-2 | First tile in full | Look at the first tile at rest, then swipe along and back | The first tile sits clear of the left edge with its whole outline visible, lined up with the cards above, and returns there after a swipe | Auto: `SuggestionList` (scroll padding); Device |
| SUG-3 | Tap | Tap a tile | The add form opens filled in with that merchant, amount and category | Auto: `app.flow` |
| SUG-4 | Slim chips elsewhere | Look above the chat box and in the add form | They are still the slim one-line chips, with the same side clearance | Auto: `SuggestionList`; look by eye |
| SUG-5 | Budget below | Have no monthly budget set | The "Set a monthly budget" card sits below the suggestions (and with no suggestions, below what is coming up), above the day-by-day chart | Auto: `Home` |

## What changed your balance

Settings, Accounts and balance: a trail of what has been moving the balance.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| TRL-1 | The last week by source | Enter some entries by chat, with the form, from the Due now card and from an imported file, then open Settings, Accounts and balance | "What changed your balance" adds up the last 7 days by where entries came from (typed in the chat bar, added with the form, added from a regular payment, imported from a file), each with its total and how many entries | Auto: `balanceTrail`, `BalanceTrail.flow` |
| TRL-2 | The latest changes | Look under the weekly totals | The latest entries that moved the balance, newest entered first (by when they were entered, not the date they carry), each with its source, when it was entered and what it did (−₹6,000 or +₹80,000); transfers and trashed entries are not listed | Auto: `balanceTrail`, `BalanceTrail.flow` |
| TRL-3 | It says how the balance moves | Read the note | The balance only moves when an entry is added, edited, deleted or restored, when a file is imported, or when an exchange rate changes; regular payments never post by themselves | Auto: `BalanceTrail.flow` |
| TRL-4 | The balance stays private | Hide the balance on Home, then open the panel | The panel shows what changed, never the balance itself | Auto: `BalanceTrail.flow` |
| TRL-5 | Entries not typed by you | Add a payment from the Due now card; import a file | In Activity and Home the row carries a Recurring or Imported label (and a screen reader says so); entries you typed carry none | Auto: `TxRow` |

## Where you spent

The map at the bottom of Insights.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| MAP-1 | Places listed | Turn on Save where I add transactions, add a few entries, open Insights | "Where you spent" is the last section, with the biggest places as a list (name, how many times, total) and a Show map button; fixes within about 75 m are one place | Auto: `places`, `PlacesMap.flow`, `Insights.places.flow` |
| MAP-2 | Nothing loads until asked | Open Insights without pressing Show map | No map code and no picture from OpenStreetMap is fetched; a note says showing the map tells OpenStreetMap roughly which area is being looked at | Auto: `PlacesMap.flow`, `Insights.places.flow`; check the network tab by eye |
| MAP-3 | The map | Press Show map | An OpenStreetMap appears with a pin for each place (bigger, with a count, for more visits, in the category colour), the OpenStreetMap credit is visible, and tapping a pin says what was spent there; the map shows again straight away for the rest of the visit | Auto: `leafletMap`, `PlacesMap.flow`; look by eye |
| MAP-4 | Scrolling past it | Drag a finger down the page over the map | The page scrolls (one finger); two fingers move and zoom the map; the mouse wheel does not zoom, the + and − buttons do | Look by eye on a phone |
| MAP-5 | Offline | Turn the connection off and press Show map | "The map needs an internet connection." instead of a grey box; the list still works | Auto: `PlacesMap.flow` |
| MAP-6 | Empty states | Look at a month with nothing recorded; look when no place has ever been recorded | "No places were recorded in October."; or an explanation of the setting with an Open settings button | Auto: `Insights.places.flow` |
| MAP-7 | Names are text | Give an entry a name such as <img src=x onerror=alert(1)> and open its pin | It is shown as written, never run | Auto: `leafletMap` |

## Swiping between months

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| SWP-1 | Back a month | On Home, swipe right on the spending card | The previous month, with the figures sliding in from the left | Auto: `swipeMonths.flow`, `SpendingOverview.swipe.flow`. **Device** |
| SWP-2 | Forward a month | After going back, swipe left on the card | The next month, sliding in from the right | Auto: `swipeMonths.flow`. **Device** |
| SWP-3 | Nothing after now | In the month in progress, swipe left | Nothing happens | Auto: `swipeMonths.flow`, `SpendingOverview.swipe.flow` |
| SWP-4 | Keep going | Swipe right several times | One month back for each swipe | Auto: `swipeMonths.flow` |
| SWP-5 | Not a swipe | Tap the eye or a day tile; slip a finger a little; scroll up and down from the card | Nothing changes month, and the page still scrolls | Auto: `useSwipe.flow`, `swipeMonths.flow`. **Device** |
| SWP-6 | Only on the card | Swipe on the cash flow or the lists | The month does not change | Auto: `swipeMonths.flow` |
| SWP-7 | Other ways still work | Use the arrows or the month list at the top | They change the month as before | Auto: `swipeMonths.flow` |
| SWP-8 | Mouse and motion | Drag with a mouse; turn on reduce motion | The mouse is ignored (text can still be selected); the figures change without sliding | Auto: `useSwipe.flow`, `contrast` |

## Sending money to people

Money sent to a person is an ordinary expense (it counts in your spending), with their name as the merchant, who it went to, and whether they have it yet.

| ID | Case | Do | Expect | Covered by |
|---|---|---|---|---|
| PPL-1 | Switch on | In a new transaction on Spent, tick Sent to a person | The Merchant box becomes Sent to, with a Sent on date and Has it reached them? (Not received yet chosen); the switch is not there for Received or Transfer | Auto: `AddSheet.people.flow` |
| PPL-2 | Suggestions as you type | Tick it, then type the first letters of a name you sent money to before | The people who fit are listed under the box, names starting with the letters first; with nothing typed the people sent to most recently are shown; tapping one (or the arrow keys and Enter) fills the name in without saving | Auto: `AddSheet.people.flow`, `people.test` |
| PPL-3 | Save a payment | Choose Shweta, enter 500 and a past date, tap Add | Saved as ₹500 spent on that date, under Other unless another category is chosen, named Shweta, linked to her, Not received yet; the pop-up says Sent ₹500 to Shweta; a second quick tap does not save it twice | Auto: `AddSheet.people.flow` |
| PPL-4 | Already received | Choose Received by them before saving | It is saved as received, with when | Auto: `AddSheet.people.flow` |
| PPL-5 | A new name | Type a name nobody has, enter an amount, tap Add | They are remembered (once, whatever the case) and shown the next time as you type; a name that matches someone known, in any case, is that person | Auto: `AddSheet.people.flow` |
| PPL-6 | No name | Tick it, enter an amount, leave the name empty | "Enter who you sent it to.", nothing is saved | Auto: `AddSheet.people.flow` |
| PPL-7 | Edit | Open a payment to a person; change it to Received by them, back again; turn the switch off | It opens with the person, date and state; each change is saved (received also records when); with the switch off it is a plain purchase again and forgets the person | Auto: `AddSheet.people.flow` |
| PPL-8 | In the list | Look at Activity and the Timeline | A payment to a person has a person's icon and a chip: Not received yet (outlined) or Received (with a tick); a screen reader hears the state; ordinary purchases and received money are unchanged | Auto: `TxRow.people.flow` |
| PPL-9 | Choose from contacts | On Chrome for Android, tick it and tap Contacts | The phone's own contact picker opens; the one chosen fills in the name and is remembered with their number; closing it changes nothing; a refusal says so and keeps what was typed. On iPhone, desktop and Firefox the button is not shown | Auto: `AddSheet.people.flow`, `contacts.test`; Device (Android) |
| PPL-10 | People in Settings | Settings, Money, People | Each person with what was sent to them and what is not received yet (most recent first), a total waiting, and Add a person by name or Add from contacts (several at once, saying how many were new); the app never reads contacts on its own | Auto: `PeopleSection.flow`; Device (Android) |
| PPL-11 | Mark received | Open a person, press Mark received on a payment, or Mark all received | It is saved as received and the pop-up offers Undo; when all are in, it says so | Auto: `PeopleSection.flow` |
| PPL-12 | Remove a person | Open a person, Remove, and confirm | They are gone from the list; their payments stay in your history with the name | Auto: `PeopleSection.flow`, `people.test` |
| PPL-13 | Backup and restore | Export a backup and restore it (merge or replace) | People, who each payment went to and whether it was received come back; a person already here (by name) is not doubled; restoring twice adds nothing; older backups still restore; the spreadsheet has a delivery column | Auto: `importBackup.test`, `exporters.test` |
| PPL-14 | Upgrade | Open the app after updating | Everything already saved is untouched; the new People list starts empty | Auto: `people.test` (database upgrade) |
| PPL-15 | @ in the input bar | Type @ and a few letters of a name in the input bar (for example @shw) | The people who fit are listed above the bar (the most recent when only @ is typed); tapping one, or the arrow keys and Enter, fills in the whole name ("@Shweta Rao ") and leaves the caret ready for the amount; nothing is listed for an address, once the amount is being typed, or when nobody fits; Escape or leaving the bar closes it | Auto: `ChatBar.people.flow`, `mention.test` |
| PPL-16 | Log it from the input bar | Send "@Shweta Rao 500", "@ankit 350 lunch yesterday", "500 to shweta" or "@Kavya Nair 200" | Each is saved as money sent to that person, not received yet, on the day said, with the leftover words as a note; a new name is remembered once; the pop-up says Sent ₹500 to Shweta Rao and Undo removes it; a first name shared by two people is not guessed; "@Shweta paid me 500" is received money; ordinary lines are unchanged | Auto: `app.people.flow`, `mention.test` |
