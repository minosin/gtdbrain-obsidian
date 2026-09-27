## 1.1.0

- Syncing now needs a GTD Brain membership. When the backend answers that the account has none (right after sign-in, or on any sync), the sync stops before anything is pushed, the status bar shows *membership needed*, and a *Start your free month* screen opens with a button to the membership page. Automatic syncs open that screen once per Obsidian session; *Sync now* opens it every time. Syncing on the interval continues, so the vault syncs on its own once the membership starts.
- The README states that an account is required and payment is required for full access.

## 1.0.1

- Fixed: a note moved from Inbox into Next Actions and given a `project:` link in the same sync lost the link (the board only links projects to actions, and the card only became one with the move). The link is now applied right after the move.

## 1.0.0

First release.

- Scaffolds the GTD folder: Inbox, Next Actions, Projects, Waiting For, Someday Maybe, Archive, the list overview notes and a Weekly Review checklist.
- Two-way sync with the GTD Brain board: one note per card, frontmatter for list, kind, context, project, who and since; the note body is the card's notes.
- Passwordless email sign-in; a new email creates a free GTD Brain account with a starter board.
