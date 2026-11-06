# Setup Guide — Vacancy Tracker

## Firebase sign-in and database

The tracker is a static HTML/CSS/JavaScript app backed by Firebase
Authentication and Cloud Firestore. Each account's records are stored under
`users/{uid}` and protected by `firestore.rules`.

Admin sign-ins use tab-scoped session persistence. The viewer uses its own
in-memory Firebase session, separate from the admin account, and requires
Google or email/password sign-in plus the dorm code and password each time
the viewer page loads. Email users can create an account or request a password
reset from the viewer sign-in page.
Signed-in viewers can use **Switch server** beside the theme control to enter
another dorm code and password in the same Firebase project.

1. Create or open the Firebase project in
   [Firebase Console](https://console.firebase.google.com/).
2. Under **Build → Authentication → Sign-in method**, enable **Email/Password**
   and **Google**.
3. Create a Firestore database in production mode. Publish rules that restrict
   every user's data to their own UID, as in the included `firestore.rules`.
4. Register a Firebase web app and put its Firebase web configuration in
   `firebase-config.js`. That client configuration is used for Firebase
   Authentication and Firestore; do not put AI-provider credentials there.
5. Create an account in the app. Add the website's hosting domain under
   **Authentication → Settings → Authorized domains**.
6. Serve the site through HTTP/HTTPS, not by opening `index.html` as a
   `file://` URL. Google sign-in and secure dorm-password checks require
   HTTPS or localhost; when a popup is blocked, the app falls back to a
   redirect.

## Built-in Python tracker assistant (no AI API key)

The assistant uses a small, deterministic Python rule engine, not a Gemini,
OpenAI, or other language-model API. There is no model API key, model token
charge, or model call. It recognizes a practical set of tracker questions,
explains actual screens/workflows, reports facts from the signed-in user's
current Firestore records, and refuses questions outside this application.
It is intentionally limited: it does not understand arbitrary requests like a
large language model and may ask for a room number or other detail when a
request is ambiguous.

The Python Firebase HTTPS Function only reads the authenticated user's
Firestore data and returns an answer or a proposed action. It does not write
data. For a change, the browser shows a preview and requires confirmation
before passing the request to the tracker's existing validated workflow.
The function reads only relevant collections and limits record counts and
request frequency. No resident notes are sent to an AI provider.

1. Use a current Firebase CLI and sign in/select the Firebase project from
   this folder.
2. Enable Cloud Functions for the project. Firebase may require the
   Blaze/pay-as-you-go plan for deployment or usage. The rule engine itself
   has no per-token AI fees, but Firebase Functions and Firestore usage may
   have charges. Configure budget alerts and review current Firebase pricing.
3. From this project folder, deploy the Python function and Hosting rewrite:
   ```
   firebase deploy --only functions,hosting
   ```
   The Python function runs in `us-central1` and Hosting forwards
   `/api/assistant` to it. The Firebase Functions Python source and runtime
   dependencies are in `functions/`.
4. Sign in on the deployed HTTPS site and open the round assistant button.

The function verifies the Firebase ID token and queries only
`users/{verified-uid}`. It is rate-limited and never accepts a model-generated
database query or performs writes. Custom tracker actions are previewed in
the browser and must be confirmed. The existing Firebase web API key in
`firebase-config.js` is still needed by the app's Firebase client; it is not
an AI/model key and should not be removed as part of this change.

## Importing sample rooms

`seed-data.js` holds real resident names, so `firebase.json` excludes it (and
`practice.html`) from deployment. The **Import my existing rooms** button is
therefore hidden on the live site and only works when you open the project
from your own computer (for example `firebase serve` or a local web server).

## Overdue reminders, reservations and tenant history

- **Overdue tenants** stay marked *Overdue* until the admin acts. A reminder
  panel at the top of the Room Canvas lists them with **Extend** and
  **Check out** buttons.
- **Reserving a bed:** the admin chooses the bed for each incoming client. The
  scan lists compatible vacant beds and scheduled checkouts. The list shows
  when the current tenant leaves compared with the client's arrival. If the
  tenant leaves after the client arrives, the admin must confirm.
- **Extending a stay** on a bed that has a reservation asks the admin to
  cancel that reservation first; the client returns to *Searching*.
- **Tenant History** keeps tenants who were checked out, removed or replaced
  for 30 days. The app deletes expired records automatically (at most once an
  hour while someone is signed in). Optionally also enable a Firestore TTL
  policy: Firebase Console -> Firestore -> **TTL** -> add policy for
  collection group `tenant_history`, field `expireAt`.

## Main workflows

- **Theme:** Use the moon/sun control on the sign-in screen or workspace header
  to switch between light and dark mode. The choice is saved in this browser.
- **Rooms and beds:** Add or edit a room from the Room Canvas or Hallway Layout.
  Room settings include gender, resident-group zoning, tenancy mode, capacity,
  AC status, and bed/resident details. The app prevents deleting occupied or
  reserved rooms and protects linked temporary-client assignments.
- **Shared views:** Room Canvas, Hallway Layout, Bed Matrix, Analytics,
  Checkout Schedule, and Reserved Clients share the live room KPIs and
  search/status/gender filters. The checkout schedule shows three months and
  filters by departure proximity.
- **Reservations:** Use **Reserve Clients** to record an incoming client,
  target check-in, resident group, and optional preferred bed. Confirm an
  eligible reservation from the matching checkout.
- **Temporary stays:** Use **Temporary Dorm Clients** to assign a compatible
  vacant bed. Check the guest out from the same tab to release it.
- **Transfers:** Use a resident's transfer action and select a compatible
  vacant bed. Transfers preserve resident and contract data and append an
  audit entry.
- **Hallway layout:** Unlock the layout before moving rooms. Add or edit
  facilities and walkways with the shape controls.

The Python assistant can answer questions about these existing features and
basic live counts. Its action support is deliberately limited to the action
types and fields accepted by `assistant.js`; unsupported or ambiguous requests
should be completed using the normal application interface.

## Project layout

`app.js` was split into smaller files in `js/`, loaded in this order by
`index.html` (the order matters, and `99-main.js` must stay last):

| File | What it holds |
|---|---|
| `js/proof.js` | Shared code + password fingerprint helper (also used by the viewer page) |
| `js/01-state.js` | Shared settings and in-memory data |
| `js/02-auth-boot.js` | Start-up, sign in / sign up, login screen |
| `js/03-clock-and-sync.js` | Live clock and Firestore listeners |
| `js/04-helpers.js` | Date parsing, bed status, vacancy and matching rules |
| `js/05-dashboard.js` | Original room dashboard rendering |
| `js/06-rooms.js` | Add / edit / delete rooms |
| `js/07-transfers.js` | Resident transfers |
| `js/08-temporary-clients.js` | Bed pickers and temporary dorm clients |
| `js/09-hallway.js` | Hallway layout |
| `js/10-analytics-calendar.js` | Original analytics, matrix, checkout calendar rendering |
| `js/11-reservations.js` | Reserve Clients tab |
| `js/12-overdue-history.js` | Overdue reminders, check-out, extend stay, tenant history |
| `js/13-viewer-access.js` | Admin side of viewer access |
| `js/14-canvas-tabs.js` | Active Room Canvas, Bed Matrix, Analytics and Checkout Schedule views |
| `js/99-main.js` | Tabs, button wiring, `boot()` |

The old `app.js` is no longer used. Delete it from your project folder.

## Viewer access (read-only vacancy page)

1. Sign in as the admin and open the **Viewer Access** tab.
2. Choose a **dorm code** and a **password** (8+ characters) and turn it on.
3. Give viewers the link to `viewer.html`, the code and the password.
4. A viewer opens the page, signs in with Google or email/password, enters
   the code and password, and sees a read-only vacancy list, hallway layout, and summary
   analytics. The viewer app uses a separate, in-memory sign-in session and
   asks for the dorm code and password again on each visit. It never receives
   resident names, personal details, or checkout dates: the admin app publishes
   name-free room counts to `dorms/{code}/vacancy` and sanitized hallway data
   to `dorms/{code}/layout/public`.
5. In the same tab the admin can see everyone who joined, **Remove** a viewer
   (they lose access immediately and cannot rejoin until you choose
   **Allow again**), pause access, change the password (this removes all
   current viewers) or turn viewer access off completely.

Notes:

- Vacancy counts and hallway layout are updated while an admin has the app open. If nobody has
  it open, viewers see the last published state.
- Pausing access stops new joins and new page loads. A viewer who already has
  the page open may keep seeing live data until they reload it.
- The password is never stored. Only a one-way fingerprint is kept, and only
  the admin account can read it. Choose a long password and a code that is
  hard to guess; anyone who knows both can join.
- Each admin account has one dorm code. The code can be 4-30 characters
  (letters, numbers, dashes) and must be unused.
- Google sign-in must be enabled in Firebase Authentication, and your hosting
  domain must be in **Authorized domains** (see step 5 at the top).
- Viewers sign in with Google, then enter the dorm code and password on the
  read-only viewer page. Existing viewers must still enter the correct
  password when joining from a new browser.
- Viewers can also open `index.html` and sign in with Google, but they only
  get their own empty private workspace, never your data.

## Deploying and testing the new security rules

Viewer access needs the updated `firestore.rules`. Deploy them together with
the website:

```
firebase deploy --only hosting,firestore:rules
```

**Test before relying on it.** These rules were written carefully but could
not be run against the Firebase emulator when they were prepared. After
deploying, check with two different Google accounts (one admin, one viewer):

1. Viewer with the wrong password cannot join.
2. Viewer with the right password joins and sees the room list.
3. Viewer cannot open anything under `users/...` (try in the browser console:
   `firebase.app("vacancy-viewer").firestore().collection("users").get()` must fail).
4. Admin removes the viewer: the viewer page shows "Access ended" and
   joining again with the right password fails.
5. Admin clicks **Allow again**: the viewer can join again.
6. Viewer views the vacancy list, hallway, and analytics but cannot edit rooms
   or the hallway; admin sign-in state is not carried into the viewer page.

If any of these behaves differently, turn viewer access off in the tab and
tell the developer before sharing the code with anyone.
