### Added

- Create a source-backed series within Ideate, select concepts to generate, edit each post, and explicitly save selected drafts.
- Preview exact dates for selected drafts, then confirm them with safe partial retries and workspace-local timing.
- Send individual posts to a named client for required approval. Submitted versions and decisions remain inspectable, and content changes require another review.

### Changed

- Web Ideate uses one resumable dialog from navigation and the composer. The old route opens that dialog. Ordinary solo-founder drafting and publishing remain unchanged.
- Scheduled usage is reserved atomically with delivery jobs across individual and batch scheduling.

### Upgrade notes

- Apply additive migration 158 and upgrade every publishing process before enabling `OPENPOST_CLIENT_REVIEWS_ENABLED`. Existing reviews remain enforced when new review admission is disabled. See `docs/development/client-reviews-and-series.md` for rollout and rollback instructions.
