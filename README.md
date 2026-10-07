# Bananads Books

Accounts, daily expenses, GST and invoices for **Bananads** (6th Floor, Hilite Business Park, Calicut, Kerala 673014 · 9744220039).

React + Vite + Tailwind, with Firebase Auth and the Firebase **Realtime Database** (`asia-southeast1`) storing each user's data. Works on phones (it can be added to the home screen). After a refresh, your last copy shows instantly from the device while live data syncs, and entries made offline sync when the connection returns, as long as the tab stays open.

## What's inside

| Area | Features |
| --- | --- |
| **Add Entry** | Expense/Income, date (Today/Yesterday), category + sub-category dropdowns with inline **＋ Add new**, Cash/UPI/Card/Bank, account/ledger, notes, recent quick-picks, sums like `120+45` in the amount box, **GST bill toggle** (rate, incl./excl. GST, CGST+SGST or IGST, party, GSTIN, bill no.), Save & add another, Undo |
| **Daily Expenses** | Date picker + week strip, day totals, GST / non-GST filter, edit/duplicate/delete, **Download today's expenses** (Excel + PDF) |
| **Dashboard** | Today / week / month cards, income/expense/net for Today·Week·Month·Year·Custom, donut chart by category (tap a slice to see sub-categories), daily bars, 12-month income vs expense trend with growth %, GST snapshot, cash/bank balances, amount still to receive |
| **Reports** | Daily / Weekly / Monthly / Yearly / Custom with ◀ ▶ navigation, filters (type, category, sub-category, payment mode, GST), totals, savings, category and sub-category breakdown, charts, Excel + PDF |
| **GST** | GST and non-GST kept separate, output GST (from invoices and income), input GST (ITC), net payable, rate-wise tables, Month/Quarter/FY, Excel + PDF |
| **Invoices** | Tax Invoice (GST) or Invoice without GST, Bananads logo, auto numbering `BA/26-27/001`, customers saved as ledgers, HSN/SAC, qty/unit/rate/discount, CGST+SGST vs IGST from place of supply, round off, amount in words, bank/UPI, live preview, PDF, record payments (part/full), Paid/Overdue status |
| **Ledgers & Books** | Tally-style double entry: ledgers with opening balances, Payment/Receipt/Contra/Journal vouchers, Day Book, Cash Book, Bank Book, ledger statements, Trial Balance, Profit & Loss, Balance Sheet, all exportable |
| **Categories** | Add, rename, recolour and delete categories and sub-categories. When you delete a category that has entries, you choose where those entries move |
| **Settings** | Company profile and logo, bank/UPI, invoice format/notes/terms, GST rate list, currency (default ₹ INR), FY or calendar year, light/dark/auto theme, full JSON backup |

**Excel exports** (ExcelJS) come with a bold yellow header row, frozen header, auto-filter, auto-fitted columns, ₹ and date formats, and `SUM`/`SUMIF` formula totals. A report has several sheets: *Summary, Transactions, Category Summary, Sub-category Summary, Daily Summary, GST Summary*.
**PDF exports** (jsPDF) embed the Noto Sans font so the ₹ symbol prints correctly.

### How the accounting works
- Each **category** acts as an expense or income ledger automatically.
- A quick expense posts *Dr Category (+ Dr Input CGST/SGST/IGST) / Cr Cash or Bank*. A quick income posts the reverse, with Output GST.
- A finalised **invoice** posts *Dr Customer / Cr Sales Account + Output GST (± Round off)*.
- **Record payment** creates a Receipt voucher (*Dr Bank / Cr Customer*).
- Don't also add an invoice's money as an "Income" entry, or it will be counted twice.

## One-time Firebase setup (project `accounts-b041c`)

1. **Authentication**: open *Authentication → Sign-in method* and enable **Email/Password**.
2. **Realtime Database rules**: open *Realtime Database → Rules*, replace everything with the contents of [`database.rules.json`](database.rules.json), then click **Publish**:

   ```json
   {
     "rules": {
       ".read": false,
       ".write": false,
       "users": {
         "$uid": {
           ".read": "auth != null && auth.uid === $uid",
           ".write": "auth != null && auth.uid === $uid"
         }
       }
     }
   }
   ```

   With these rules each signed-in user can read and write only `users/<their uid>`. The database rejects everyone else, including people who aren't signed in.
   - Realtime Database rules are **JSON**. Firestore rules (`rules_version = '2'; service cloud.firestore …`) give *"Line 1: Parse error"* here.
   - Or use the CLI: `npx firebase-tools login`, then `npx firebase-tools deploy --only database`.
3. Optional: in *Authentication → Settings*, add your production domain to **Authorised domains**.

The database URL is already set in `src/lib/firebase.ts`: `https://accounts-b041c-default-rtdb.asia-southeast1.firebasedatabase.app`.

When you first sign in, the default categories (Travel, Food, Bills, Shopping, Health, Education, Entertainment, Salary, Business Income, Other) and the Cash, Bank Account and Capital Account ledgers are created for you.

> Anyone who can open the app can create an account. Each account gets its own separate books, so users cannot see each other's data. To share one set of books with your team, sign in with one shared account. If you don't want new sign-ups, turn them off in *Authentication → Settings → User actions*. This setting needs the free upgrade to Firebase Authentication with Identity Platform.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests: GST math, double entry, invoice totals, amount in words
npm run build      # production build → dist/
```

## Deploy (Firebase Hosting)

```bash
npm run build
npx firebase-tools login
npx firebase-tools deploy --only hosting,database
```

`firebase.json` already sets up the single-page-app rewrite. The same `dist/` folder also deploys to Netlify or Vercel (point every route to `index.html`). For Vercel, `vercel.json` already does this, so refreshing or opening a deep link like `/daily` works instead of a 404.

## Project layout

```
src/
  lib/          accounting engine, GST maths, analytics, dates, formatting, defaults, Firebase init
  store/        auth, theme, Realtime Database data provider (live sync, device cache, seeding)
  components/   UI kit, entry form, charts, invoice preview, layout (sidebar + mobile tab bar)
  pages/        Dashboard, AddEntry, Daily, Reports, Gst, Invoices, InvoiceEditor, Categories, Settings
  pages/accounts/  Ledgers, Vouchers, Day/Cash/Bank Book, Trial Balance, P&L, Balance Sheet
  export/       Excel (ExcelJS), PDF reports, invoice PDF
public/         logo, app icons, PDF fonts (Noto Sans, OFL licence)
```
