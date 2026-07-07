# Kinetic Flow — Screen Notes
## 2026-07-06T19:41:26.972Z

- Screen: kinetic-flow — feild-clock
- Role: worker
- Account: Existing Account
- Phone size: 430 × 932

The before you clock out section should be a checklist above the clockout button that shows if you are clocked in.

> ✅ Done — clock-out checklist renders above the Clock Out button, only while clocked in (c371c08).

---

## 2026-07-06T19:43:17.285Z

- Screen: kinetic-flow — review-time
- Role: worker
- Account: Existing Account
- Phone size: 430 × 932

Add navigation animations, it should be clear when you are entering a new page or exiting a page.

> ✅ Done — page enter/exit slide animations, direction-aware for Back (c371c08).

---

## 2026-07-06T20:10:04.167Z

- Screen: kinetic-flow — task-select
- Role: worker
- Account: Existing Account
- Phone size: 430 × 932

This page should Not be here I will leave another note where it should be.

> ✅ Done — task-select page removed (c371c08).

---

## 2026-07-06T20:11:07.781Z

- Screen: kinetic-flow — feild-clock
- Role: worker
- Account: Existing Account
- Phone size: 430 × 932

This is where the task select should be, when click to record a task it should pull up the list of relavant tasks for you to select.

> ✅ Done — Task button on Field Clock opens the task picker sheet (c371c08).

---


## 2026-07-06T21:28:58.478Z

- Screen: kinetic-flow — kits
- Role: worker
- Account: Existing Account
- Phone size: 390 × 720

If there are no kits there should be a button to take you to add kits

> ✅ Done — empty Kits page shows "+ Create a Kit", which creates a real kit and selects it (bb87627).

---

## 2026-07-06T21:30:12.999Z

- Screen: kinetic-flow — companies
- Role: worker
- Account: Existing Account
- Phone size: 390 × 720

This needs to be data base drive, only show  companies your a part of.

> ✅ Done — Companies lists only companies you belong to (home company or a role, pending requests badged); others joinable via + (bb87627).

---

## 2026-07-06T21:33:34.054Z

- Screen: kinetic-flow — label-generator
- Role: worker
- Account: Existing Account
- Phone size: 390 × 720

This should not generate labels, in the future it will open another app that I made with the details of the labels. This page will also have saved templates and previews of labels from my other app

> ✅ Done — no PDF generation; "Open in Label Maker" handoff stub + mock Saved Templates rail until that app is installed (bb87627).

---

## 2026-07-06T21:45:55.326Z

- Screen: kinetic-flow — feild-clock
- Role: worker
- Account: Existing Account
- Phone size: 430 × 932

The sumbit timesheet button should be changed to be a button that takes you to the daily score card that will then take you to review your time sheet, then sumbit it.

> ✅ Done — button is now "Daily Scorecard & Timesheet": scorecard first, then review-time, then submit (bb87627).

---

## 2026-07-06T21:46:54.844Z

- Screen: kinetic-flow — feild-clock
- Role: worker
- Account: Existing Account
- Phone size: 430 × 932

Clockout button should be clearly disabled if checklist not complete

> ✅ Done — Clock Out is visibly disabled (dimmed) until all three checklist items are complete (bb87627).

---

## 2026-07-06T21:48:31.477Z

- Screen: kinetic-flow — feild-clock
- Role: worker
- Account: Existing Account
- Phone size: 430 × 932

When I try to open another app and go back to kinetic flow, it brings me back to the other app.

> ✅ Done — shell bug fixed: reopening an app re-renders it instead of showing the other app’s leftover screen (c0b4465).

---

## 2026-07-07T15:07:00.424Z

- Screen: kinetic-flow — customer-home
- Role: customer
- Account: Existing Account
- Phone size: 390 × 720

When a bit is created and it should create a PDF of the bid the invoice the schedule and everything The customer needs to see. That PDF will be sent to the customer.  The only time that the customer will use the app is when they scan a QR code to see the floor plan or what paints or trim or other things were used for the  Building.

> ✅ Done — Send to Customer generates a real PDF (bid, divisions, schedule, payment plan) and downloads it (a17b8c5).

---

## 2026-07-07T15:08:35.815Z

- Screen: kinetic-flow — customer-home
- Role: customer
- Account: Existing Account
- Phone size: 390 × 720

And actually the customer will not use the app they will be using a website when they scan the QR Code to see the floor plan and details of the building.  We just need to make sure that the managers or workers can edit the or add a floor plan and add Do the building of the job or customer that they're working for.

> ✅ Done — customers use the simulated QR website (property-link picker → read-only property page); workers/managers edit floor plan & details via Customer Home Details (a17b8c5).

---

## 2026-07-07T15:10:42.811Z

- Screen: kinetic-flow — sign-in
- Role: supplier
- Account: Existing Account
- Phone size: 390 × 720

Let's create a supplier account for supplying materials and tools for companies. It will not be a different type of account but it will have different permissions  And rolls in the companies. Is a user has a role in a company as the supplier then they should not see the jobs in that company.

> ✅ Done — supplier is a company role (seeded role + supplier@kineticflow.com), not an account type (75028eb). Job visibility per the 15:14 revision.

---

## 2026-07-07T15:14:10.230Z

- Screen: kinetic-flow — inventory
- Role: supplier
- Account: Existing Account
- Phone size: 390 × 720

There should not be A different type of account for suppliers. before I said Suppliers do not need to see the jobs but maybe you would have them see the jobs so they can get the x German materials for specific jobs and they'd be able to see the schedule to know when to order or ship the materials.

> ✅ Done — supplier nav includes Jobs and Schedule for material planning; no create-job, clock-in, or finance (75028eb).

---

## 2026-07-07T15:16:37.649Z

- Screen: OS home
- Role: Worker
- Account: Existing Account
- Phone size: 390 × 720

When you switch between customer and worker or supplier in the header controls then it should log the previous user out so it doesn't Show the wrong page.

> ✅ Done — switching Worker ↔ Customer hard-signs-out the previous session (a17b8c5). Supplier control removed per 15:26.

---

## 2026-07-07T15:22:23.156Z

- Screen: kinetic-flow — schedule
- Role: worker
- Account: Existing Account
- Phone size: 390 × 720

The schedule should only have work days.   You will not be able to complete tasks on Sunday.

> ✅ Done — schedule shows Monday–Saturday only; Sunday is the locked day of rest (f2ee83d).

---

## 2026-07-07T15:26:17.053Z

- Screen: OS home
- Role: Customer
- Account: Existing Account
- Phone size: 390 × 720

And the website header with the worker customer and supplier controls we should probably remove the supplier control because it should just be an account not a setting. And for the customer option if it is selected then this sign in should only show customer URLS that Show the customer's Floor plan and building details of materials used

> ✅ Done — Supplier header control removed; Customer mode shows tokenized property links to floor plan/building details (a17b8c5). Bonus: Existing/New Account toggle also removed later (48a8db5).

---

