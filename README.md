# NotesVerse (local, SQLite + Node.js)

A personal spaced-repetition notes app that runs entirely on your own
machine. Organize anything into subjects → microthemes → sections → bullets,
track what's due for revision, time your study sessions, and export clean
PDFs — all backed by a real SQLite file (`db/vault.sqlite3`), not the
browser, so your notes survive clearing browser data and back up by copying
one file.

It ships pre-loaded with a full UPSC civil services syllabus structure
(GS1–GS4, Essay, Prelims) as a ready-made example, but nothing about the app
is UPSC-specific — rename the subjects, delete them, or add your own from
scratch, and it works just as well for any exam, course, or general
note-taking.

## Project structure
```
notesverse/
├── server.js              # Thin entry point: starts the server,
│                           #   schedules auto-backups, handles clean shutdown
├── package.json
├── config.example.json     # Committed template — copy to config.json
├── config.json              # Your real secrets (gitignored, not committed)
├── .gitignore
│
├── src/                     # Application code
│   ├── app.js               # Assembles the Express app: middleware + routers
│   ├── config.js             # Loads config.json with safe defaults
│   ├── paths.js              # Central place for every folder path used
│   ├── middleware/
│   │   └── auth.js           # Optional single-password lock (session cookies)
│   ├── routes/                # One file per resource — thin, focused, testable
│   │   ├── auth.routes.js       # /api/auth-status, /api/login, /api/logout
│   │   ├── tree.routes.js       # GET /api/tree (the big nested read)
│   │   ├── subjects.routes.js
│   │   ├── microthemes.routes.js
│   │   ├── sections.routes.js
│   │   ├── items.routes.js
│   │   ├── people.routes.js     # Key Thinkers + their bullets
│   │   ├── pyqs.routes.js
│   │   ├── aspects.routes.js    # Mastery tracker + recall grading
│   │   ├── quotes.routes.js
│   │   ├── summary.routes.js
│   │   ├── attachments.routes.js # Uploaded images/PDFs
│   │   ├── notes.routes.js       # Sidebar to-do sticky note
│   │   ├── chat.routes.js        # Gemini AI relay
│   │   └── planner.routes.js     # Micro Plan: subjects, topics, daily targets
│   └── utils/
│       ├── id.js              # uid() — random ID generation
│       └── files.js           # File-extension detection for uploads
│
├── db/                       # Data layer
│   ├── schema.sql              # Table definitions
│   ├── index.js                # Opens/creates the SQLite file + migrations
│   ├── seed.js                  # One-time structure + worked example
│   ├── planner-seed.js          # First-run starter lists for the Micro Plan
│   ├── planner-seed.json        # …the lists themselves (edit before first run)
│   ├── planner-sync.js          # Keeps Micro Plan ⇄ notes subjects/microthemes in sync
│   ├── reset-notes.js           # `npm run reset-notes` — empty the notes tree
│   ├── backup.js                # `npm run backup` — manual snapshot
│   └── vault.sqlite3            # Your real data (gitignored)
│
├── uploads/                   # Uploaded attachments (gitignored, kept via .gitkeep)
├── backups/                   # Auto + manual backups (gitignored, kept via .gitkeep)
│
└── public/                    # Frontend — plain HTML/CSS/JS, no build step
    ├── index.html
    ├── login.html
    ├── style.css
    ├── planner.js               # Micro Plan page (loaded before app.js)
    └── app.js                   # All other frontend logic (fetch-based)
```

**Why this shape:** `server.js` only starts things up — it doesn't know what
a "subject" or "microtheme" is. `src/app.js` wires the pieces together. Each
file in `src/routes/` owns exactly one resource and is small enough to read
in one sitting. `src/config.js` and `src/paths.js` are the only places that
know about the filesystem, so if you ever move folders around, that's the
only place to update.

## What's inside
- **Node.js + Express** REST API, organized by resource (see structure above)
- **SQLite** database via `better-sqlite3`
- **Seed script** that pre-loads a full UPSC GS1–GS4 + Essay + Prelims
  structure as ready-made example content (Agriculture → Public Distribution
  System & Food Security is fully worked out as a sample) — optional
  starting point, not a requirement
- **Plain HTML/CSS/JS frontend** — no build step, no framework
- **Optional password lock**, **AI chat** (Gemini, free tier), **file
  attachments**, **live study timer**, **PDF export**, **auto-backups**

## 1. Install prerequisites
You need [Node.js](https://nodejs.org) 18 or newer. Check with:
```bash
node -v
```

## 2. Install dependencies
```bash
npm install
```
This installs `express` and `better-sqlite3`. `better-sqlite3` compiles a
small native module on install — if that fails on your machine, see
**Troubleshooting** below.

## 3. Set up your config
```bash
cp config.example.json config.json
```
Then open `config.json` and fill in what you want:
- `geminiApiKey` — a free key from [aistudio.google.com](https://aistudio.google.com) if you want the AI chat box to work. Leave blank to skip it.
- `geminiModel` — leave as `gemini-3.1-flash-lite` unless you know you want a different one.
- `appPassword` — set any password here to lock the app behind a login screen. Leave blank (`""`) for no lock at all.

`config.json` is gitignored on purpose — it holds your real secrets and should never be committed.

## 4. Seed the database
```bash
npm run seed
```
This creates `db/vault.sqlite3` and fills it with the example UPSC topic
structure — a convenient starting point you're free to rename, gut, or
delete entirely and build your own subjects from scratch instead. Running
the seed script again is safe — it skips seeding if data already exists. To
start completely empty from the beginning, delete `db/vault.sqlite3*` before
running it, or just delete the seeded subjects from within the app once it's
running.

## 5. Start the server
```bash
npm start
```
Open the printed `http://localhost:3000` in your browser.

## 6. Use it
- Left sidebar: pick a subject/microtheme, tick off aspects as you memorise
  them, hit **Mark revised** after each revision pass. A pale-yellow sticky
  note below the subject list is a persistent to-do — click it to edit.
- Top bar: streak, due count, mastery %, **Skeleton**/**Test me** (active
  recall modes), light/dark toggle, **Dashboard**, and **Log out** if a
  password is set.
- Inside a microtheme: `+ Add section`, `+ Add bullet`, `+ Add PYQ`,
  `+ Add aspect`, **Start timer** (live study/break clock), **Export as
  PDF**, and an **Attachments** box for photos/PDFs of handwritten notes.
- Bullets, quotes, summary lines, and thinker points all support:
  - `==text==` → yellow highlight
  - `^^text^^` → blue highlight (handy for exam-question phrases)
  - `__text__` → underline
  - `**text**` → bold
  - `*text*` → italic
  - `{{color:text}}` → custom color (red, green, blue, navy, orange, purple, grey, black)
  - Prefix a bullet with `- ` for an indented sub-point
- An "Ask AI Assistant" button in the sidebar opens a general AI chat,
  powered by your own free Gemini API key — it doesn't yet read your actual
  notes, it's a general-purpose assistant.
- Dashboard: overall stats, an hours-studied calendar, full-text search
  across every microtheme at once, and a "show only due" filter.
- **🗓 Micro Plan** (top bar, or the button on the Dashboard sidebar): a
  flexible daily-targets tracker with four tracks — Prelims, GS mains,
  Ethics GS4 and Optional.
  - Each track has an ordered list of subjects (To do → Current → Done)
    and each subject can hold topics. Paste many lines into "Add topic" to
    add them all at once.
  - **Synced with your notes:** a plan subject is a notes subject and a
    plan topic is a microtheme (same name). Adding either in the plan
    creates or links it in the notes, and adding a microtheme under a
    subject that's in the plan adds it as a topic there. Renames carry
    across both ways. Deletes never cross over, so removing something from
    the plan keeps your notes. Each topic has a 📖 button to open its
    notes, and ticking a topic done records a revision for today.
  - Every day you pick subject + topic, write the target, and tick it when
    done; there's a note per day. Pick any date to view or edit that day.
  - Hours shown for a day come from the study timer — there is no second
    hours field. The sticky note stays your undated scratchpad.
  - Countdown to prelims and to your mains target date (editable at the
    bottom), days logged, and subjects done.
  - Starter lists come from `db/planner-seed.json` on first run only.
- **Start your notes fresh:** stop the server and run `npm run reset-notes`.
  It backs up the vault, removes every notes subject and microtheme (with
  their content), keeps the Micro Plan, and the next `npm start` re-creates
  the plan's subjects and topics as empty notes.

## How spaced repetition works here
Every time you click **Mark revised** (or grade an aspect Good/Easy), the app
records today's date. The "due" logic uses widening gaps — 1, 3, 7, 14, 30,
60 days — so a microtheme you've revised many times shows up less often, and
a fresh one is due again tomorrow. This is per-microtheme, not yet
per-aspect. Tweak `REPEAT_INTERVALS` in `public/app.js` if you want different
spacing.

## Backing up / moving your notes
Run:
```bash
npm run backup
```
This flushes any pending writes and saves a timestamped copy into
`backups/`. The server also auto-backs-up every 6 hours on its own while
running. Either way, your entire vault is one file: `db/vault.sqlite3` — copy
it anywhere to back it up, or onto another machine with the same project to
pick up exactly where you left off. If you've uploaded attachments, back up
the `uploads/` folder too — those files aren't stored inside the database.

## Troubleshooting
- **`better-sqlite3` fails to install / build error mentioning `node-gyp`**:
  install build tools for your OS, then retry `npm install`:
  - Windows: install "Desktop development with C++" via Visual Studio Build Tools.
  - macOS: `xcode-select --install`
  - Linux (Debian/Ubuntu): `sudo apt-get install -y build-essential python3`
- **Port 3000 already in use**: run with a different port:
  `PORT=4000 npm start` (Windows PowerShell: `$env:PORT=4000; npm start`).
- **Want to reset everything**: stop the server, delete
  `db/vault.sqlite3*`, run `npm run seed` again.
- **AI chat says "No API key set up yet"**: you haven't filled in
  `geminiApiKey` in `config.json`, or you edited `config.example.json`
  instead of `config.json` by mistake.
- **Locked out and forgot your password**: stop the server, open
  `config.json`, set `"appPassword": ""`, restart. This removes the lock
  entirely (your notes are untouched).
- **Want to expose this to your phone on the same WiFi**: find your
  computer's local IP (e.g. `192.168.1.23`) and visit
  `http://192.168.1.23:3000` from your phone's browser. Setting a password
  in `config.json` first is strongly recommended if you do this.

## Extending it
- Add your own subject structure: use the in-app `+ Add subject` /
  `+ Add microtheme` buttons, or edit `STRUCTURE` in `db/seed.js` if you want
  a different starting point baked in for fresh installs.
- Add a new API resource: create `src/routes/yourthing.routes.js` following
  the pattern of the existing ones, then mount it in `src/app.js` with
  `app.use("/api", yourThingRoutes)`.
- Real multi-user accounts (separate people, separate private notes) would
  need a bigger schema change — every table would need a `user_id` column.
  The current single-password lock is intentionally simpler than that.
