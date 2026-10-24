### Added

- Selected people and company mentions carry stable provider identities through publication segments, destination versions and joined threads. HTTP, MCP and typed contracts support the same UTF-8 byte annotations and account-scoped lookup for Bluesky, Mastodon and LinkedIn company pages.

### Fixed

- Plain-text clients retain unchanged selected mentions and safely remap surrounding edits. Ambiguous edits fail atomically, and publication revisions include identity changes.

- Canonical-only edits refresh inherited destination text while keeping independent legacy variants. Structured CLI creation retains every source when a destination joins a thread.

- Added web and native mention editors with keyboard suggestions, stable selections, structured copying, undo and exact thread text. Updated API, CLI, MCP, SDK and n8n contracts, plus authoring guides.
