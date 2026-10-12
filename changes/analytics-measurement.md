### Added

- Update the Privacy Policy to disclose separate native analytics consent.
- Add optional native app analytics with per-server consent, screen and device context, selected product actions, and sanitized JavaScript errors.
- Measure video project and export outcomes, documentation search and successful code copies, AI build outcomes, live Workflow successes and failures, hosted waitlist joins, and REST write responses.

### Fixed

- Preserve known public page paths on direct entry and reload, including mobile browsers, and keep unknown URLs and private route values out of analytics.
- Observe Huma server errors and terminal worker failures even when their status write fails. Count expired approvals and exhausted build jobs after their state change commits.
- Recover temporary analytics configuration and SDK download failures, prevent SDK faults from interrupting product actions, and discard queued events when consent or the signed-in user changes.
- Repair production PostHog reports, production URLs, internal/test exclusions, conversion goals, and Workspace-based activation measurement.
