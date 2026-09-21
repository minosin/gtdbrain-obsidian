# GTD Brain for Obsidian — Getting Things Done in your vault

<img src="https://gtdbrain.com/gtdbrain/icon-512.png" alt="GTD Brain" width="96" align="right">

**How do you do GTD in Obsidian?** Install this free community plugin, sign in with your email, and your vault gets a `GTD Brain` folder with the five [Getting Things Done](https://gtdbrain.com/gtd-method?source=obsidian-readme) lists as plain Markdown, one note per item — **Inbox**, **Next Actions** grouped by context, **Projects**, **Waiting For**, **Someday Maybe** — plus a **Weekly Review** checklist. Capture is a new note in Inbox. Clarifying is moving the note to another folder and setting a property. Every note syncs both ways with a GTD Brain board that is also on the web, on your phone, and in ChatGPT and Claude.

Install it from **Settings → Community plugins → Browse → “GTD Brain”**, or from [its page in the Obsidian directory](https://obsidian.md/plugins?id=gtd-brain). The full walkthrough with screenshots is [How to set up GTD in Obsidian](https://gtdbrain.com/blog/gtd-in-obsidian?source=obsidian-readme).

![The GTD folder in Obsidian: one note per card, with the GTD fields as properties](https://raw.githubusercontent.com/minosin/gtdbrain-obsidian/main/docs/vault.png)

## GTD in Obsidian, step by step

1. **Capture** — make a note in `Inbox/`. The title is the item, the body is the notes. That is the whole capture step; the note is on your board on the next sync.
2. **Clarify** — move the note into `Next Actions/` and set `context:` (`@calls`, `@computer`, `@errands`, …); into `Projects/` if it takes more than one step; into `Waiting For/` with `who:` and `since:` if you handed it off; into `Someday Maybe/` if not now.
3. **Organize** — link an action to its project with `project: "[[Project name]]"`. The generated `Projects.md` lists every project with its next actions underneath and flags the ones with none.
4. **Reflect** — open `Weekly Review.md` and work down the checklist (get clear, get current, get creative). Each line links to the list it refers to.
5. **Engage** — open `Next Actions.md`: your actions grouped by context, regenerated on every sync. Pick the context you are in and do the next thing.

Everything stays plain Markdown, so Dataview, Bases, backlinks, daily notes and every other plugin work on it.

## The GTD vault structure

```
GTD Brain/
├── Inbox/                 one note per item — capture here
├── Next Actions/          actions; `context:` picks the @context
├── Projects/              outcomes; actions link to them with `project: "[[…]]"`
├── Waiting For/           delegated items; `who:` and `since:`
├── Someday Maybe/         incubating
├── Archive/               notes of archived cards
├── Inbox.md               generated list overviews (read-only)
├── Next Actions.md        …grouped by context
├── Projects.md            …with each project's next actions, flags projects without one
├── Waiting For.md         …as a table of item / who / since
├── Someday Maybe.md
└── Weekly Review.md       your checklist — created once, never overwritten
```

Every card note carries a small frontmatter block the sync reads and writes:

```yaml
---
gtdbrain_id: "1b2c…"        # the card on the board
list: "Next Actions"        # informational mirror of the folder
kind: "action"              # card | action | project
context: "@errands"         # id or label, both work
project: "[[Paint the bedroom]]"
who: "Bob"                  # Waiting For
since: "2026-09-01"
---
The note body is the card's notes.
```

Any other property you add is yours and stays untouched.

### Capture: a note in Inbox

![A new note in the Inbox folder: the title is the item, the body is the notes](https://gtdbrain.com/gtdbrain/blog/obsidian-capture.png)

### Next actions by context

![The Next Actions overview note with actions grouped under @calls and @computer](https://gtdbrain.com/gtdbrain/blog/obsidian-next-actions.png)

### Projects and their next actions

![The Projects overview note listing each project with its actions, one flagged “No next action”](https://gtdbrain.com/gtdbrain/blog/obsidian-projects.png)

### Waiting For: who and since when

![The Waiting For overview note as a table of item, who and since](https://gtdbrain.com/gtdbrain/blog/obsidian-waiting-for.png)

### The weekly review in Obsidian

![The Weekly Review checklist note with Get clear, Get current and Get creative sections](https://gtdbrain.com/gtdbrain/blog/obsidian-weekly-review.png)

## Install the Obsidian GTD plugin

1. **Install** — Settings → Community plugins (turn off Restricted mode if it is on) → Browse → search “GTD Brain” → Install → Enable. Or open [the plugin's directory page](https://obsidian.md/plugins?id=gtd-brain) and press *Add to Obsidian*.
2. **Sign in** — run the command *GTD Brain: Sign in* (or open the plugin settings). Enter your email, type the code we send you. No password, no API key. A new email creates a free GTD Brain account with a starter board; an email you already use for GTD Brain connects the vault to that board.
3. **Done** — the moment the code is accepted the plugin creates the folders, the overview notes and the Weekly Review checklist, and pulls every card on the board into the vault as a note. *GTD Brain: Set up GTD folders* recreates anything you delete.

Sync runs on startup, every 5 minutes (configurable), and on *GTD Brain: Sync now* (ribbon icon or command). The status bar shows the state. Works on desktop and mobile.

Manual install, for a vault that cannot reach the directory: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/minosin/gtdbrain-obsidian/releases/latest) into `<your vault>/.obsidian/plugins/gtd-brain/`, reload Obsidian and enable the plugin. [BRAT](https://github.com/TfTHacker/obsidian42-brat) works too: add `minosin/gtdbrain-obsidian`.

## GTD Brain: the same board on the web, your phone, and in ChatGPT and Claude

[GTD Brain](https://gtdbrain.com/gtd-ai?source=obsidian-readme) is the GTD app ChatGPT and Claude can run for you. The vault mirrors one board, and that board exists outside Obsidian:

- **Web** — [dashboard.gtdbrain.com](https://dashboard.gtdbrain.com/?source=obsidian-readme): the same lists as columns, with the project links and the who/since you set in frontmatter.
- **Android and iPhone** — [Google Play](https://play.google.com/store/apps/details?id=com.minosin.gtd) · [App Store](https://apps.apple.com/us/app/gtd-brain/id6786407494). Capture on the phone, clarify at the desk: the note is in your vault on the next sync.
- **ChatGPT, Claude, Claude Code, Cursor, Gemini CLI and other assistants** — GTD Brain is an MCP server, so an assistant can read and change the same board: “what are my next actions at the computer?” answers from the cards you clarified in Obsidian that morning. See the [connect guides](https://gtdbrain.com/connect?source=obsidian-readme).
- **Telegram** — message the [GTD Brain bot](https://t.me/GTDBrainBot?start=obsidian-readme), typed or as a voice note, and it lands in `Inbox/`.

![The GTD Brain web board with the same cards as the vault, including the project link and the who/since from Waiting For](https://gtdbrain.com/gtdbrain/blog/obsidian-web-board.png)

## What is free and what is not

- **This plugin and the vault sync are free**, with no limit on notes or syncs, and the code is open source under MIT.
- A free GTD Brain account can **view** the same board in the web and phone apps; **changing** it there needs the GTD Brain membership. ChatGPT, Claude, Telegram and the other assistants get a few free actions on the board, then need the membership too.
- It is one subscription for everything — web, iOS, Android and every assistant — and it is never required to use this plugin. Plans and prices: [gtdbrain.com/pricing](https://gtdbrain.com/pricing?source=obsidian-readme).

## How the two-way sync decides

- The plugin remembers what each note looked like after the last sync. On the next sync it pushes **only the fields you changed** (title, body, context, project, who, since, folder) to the board, then pulls the board's state into the vault.
- If the same field changed in both places since the last sync, **your note wins** for that field and the board wins for everything else.
- **Deleting a note, or moving it out of the GTD folder, archives its card** on the next sync — nothing is ever deleted on the board. Cards archived on the board move to `Archive/` (or are trashed, if you turn off *Keep archived cards*). Unarchive on the web app and the note comes back.
- Only the notes inside the GTD folder's list folders are read or written. The rest of your vault is never touched.

## Network use, account and privacy

- **An account is required.** The plugin is a client for [GTD Brain](https://gtdbrain.com/?source=obsidian-readme); it does nothing until you sign in. Signing in with a new email creates a free account.
- **Network requests** go to `https://api.minosin.com` (GTD Brain's backend, operated by Minosin AB) and nowhere else: to send you the sign-in code, to exchange it for a session token, and to read and write your board during a sync. Requests are made with Obsidian's `requestUrl` and only when you sign in, run a command, or on the sync interval you configure.
- **What is sent:** your email at sign-in; for each card note in the GTD folder, its title (file name), body, and the frontmatter fields listed above. Nothing outside the GTD folder, no other properties, no vault metadata.
- **Server-side logging:** like every GTD Brain client, requests are logged on the backend (endpoint, timestamp, a random per-install id the plugin generates, the plugin version, your account). There is no client-side telemetry or analytics in the plugin. How that data is handled: [gtdbrain.com/privacy](https://gtdbrain.com/privacy?source=obsidian-readme) · [terms](https://gtdbrain.com/terms?source=obsidian-readme).
- **Where the token lives:** the session token is stored in the plugin's `data.json` inside your vault's `.obsidian` folder, like any sync plugin. *Sign out* removes it. Do not share that file.

## Commands and settings

| Command | What it does |
| --- | --- |
| Sync now | Push note changes to the board, pull the board into the vault |
| Set up GTD folders | Create the list folders, overview notes and the weekly review checklist |
| Sign in / Sign out | Email-code sign-in; sign-out keeps your notes |
| Open the web app | Opens dashboard.gtdbrain.com |

Settings: GTD folder (default `GTD Brain`) · Sync every N minutes (0 = off) · Sync on startup · Keep archived cards · API address (advanced).

## Develop

```bash
npm install
npm run dev      # watch build → main.js
npm test         # vitest: sync engine against an in-memory vault + fake backend
npm run lint     # eslint with eslint-plugin-obsidianmd
npm run build    # type-check + production bundle
```

Copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/gtd-brain/` to test locally. The backend API this plugin uses is documented in the [connect guide for Obsidian](https://gtdbrain.com/connect/obsidian?source=obsidian-readme).

## Support

- Setup guide: https://gtdbrain.com/connect/obsidian?source=obsidian-readme
- Issues: https://github.com/minosin/gtdbrain-obsidian/issues
- Email: admin@minosin.com

## License

MIT © Minosin AB. Not affiliated with Obsidian.
