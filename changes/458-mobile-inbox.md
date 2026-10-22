### Added

- Mobile Inbox with separate Chats and Comments, existing-chat replies, account filters, search, archive recovery, saved drafts, public thread context, and safe retry receipts.
- Native Posts, Inbox, Analytics, Media and More navigation, with Calendar and Queue retained under Posts.
- Foreground Inbox updates shared by web and mobile, incremental Bluesky chat logs, signed Meta message intake, leased Mastodon streams, and lazy network message history.

### Fixed

- Message retries retain one operation identity, outbound echoes converge with queued sends, and uncertain provider outcomes remain inspectable.
- New incoming messages reopen archived conversations, unread controls retain a visible indicator, and replies dispatch independently of slow media jobs.
- Mobile Inbox uses quieter filters, compact conversation rows, grouped timestamps and smaller moderation controls. Swipe to archive with Undo keeps the list focused on conversations.
- Inbox rows announce their latest message or comment text to screen readers, not just names and read state.
- Outlined native text fields retain their bottom border with the theme's original subtle color.
