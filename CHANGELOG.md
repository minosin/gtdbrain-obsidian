## 1.1.0

- Syncing changes from the vault to the board now needs a GTD Brain membership. Without one the plugin is read-only: the board still comes into the vault, and changes you make stay in your notes (the status bar counts them) until your membership starts, when the next sync sends them.
- After sign-in, an account without a membership sees one dialog explaining this, with a button that opens checkout in the browser. It shows again only on *Sync now* with changes waiting, never during background syncs. The settings tab has the same button.

## 1.0.1

- Fixed: a note moved from Inbox into Next Actions and given a `project:` link in the same sync lost the link (the board only links projects to actions, and the card only became one with the move). The link is now applied right after the move.

## 1.0.0

First release.

- Scaffolds the GTD folder: Inbox, Next Actions, Projects, Waiting For, Someday Maybe, Archive, the list overview notes and a Weekly Review checklist.
- Two-way sync with the GTD Brain board: one note per card, frontmatter for list, kind, context, project, who and since; the note body is the card's notes.
- Passwordless email sign-in; a new email creates a free GTD Brain account with a starter board.
