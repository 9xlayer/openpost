### Fixed

- Facebook Reels and video Stories finish completed uploads before waiting for processing, and recognize already published videos from older checkpoints without sending finish again.
- Pending publications stay in progress without repeated failure events. Automatic provider reconciliation is bounded and retains unresolved receipts for manual checks.
- YouTube waits for confirmed processing before reporting a video published, and preserves provider schedules. X processing checks stop at media expiry and yield without repeating uploads.
