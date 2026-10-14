### Added

- Native clients can inspect submitted post versions and review history, then approve their assigned version or request changes. Review previews show destination accounts, segment titles, descriptions, provider settings, and first comments. Protected videos and audio play in the app; other attachments open through the device's file controls.
- Shared recovery pages give the app, public site, documentation, and native app a consistent route back to work, including offline recovery.
- Self-hosting documentation includes an UmbrelOS installation guide.

### Fixed

- Pending provider receipts continue reconciling when another destination has a longer rate-limit delay, without repeating an accepted write.
- Performance index migrations follow the already published security and client-review migrations, so upgrades and fresh installations apply without version collisions.

### Upgrade notes

- Android advances to version 0.2.59 (61). Database migrations 159 and 160 add analytics and calendar lookup indexes.
