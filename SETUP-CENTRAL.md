# Setup: Super Admin platform

Uses the same Firebase project, API key and database as the branch app. Data lives in separate
collections locked by `firestore.rules`: superAdmins, pairing, branches, directory, audit.
No new database and no payment card.

## 1. Publish the rules
Paste the whole `firestore.rules` into Firebase console -> Firestore -> Rules -> Publish
(or `firebase deploy --only firestore`). It contains your original branch rules plus the Super Admin ones.
Do NOT paste a smaller rules file over it: that would block the branch app.

## 2. Deploy the site
`firebase deploy --only hosting`

## 3. Anyone can be a Super Admin
Open `superadmin.html`, sign in (Google or email), press "Activate Super Admin access". No console steps.
Each Super Admin sees only the dormitories they connected (the branch record stores `requestedBy`).

## 4. Marketing Viewers
`marketing.html` is read-only and reads only `directory/*` (name, location, bed counts), which exists
only while a branch has Directory approved.

## 5. Connect a dormitory
1. Branch Admin: Central Link tab -> Generate pairing code (single use, 10 minutes).
2. Super Admin: Dormitories -> code + purpose -> Connect server.
3. Branch Admin approves or rejects Directory and Analytics separately.
4. While the Branch Admin has the app open, counts sync about once a minute when they change,
   and an analytics snapshot is stored about every 15 minutes.

Not built yet: Gmail sending, private room access, live session kick/block (needs a server),
two-factor sign-in, server shutdown/change approval workflow.
