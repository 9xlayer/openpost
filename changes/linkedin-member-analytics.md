### Fixed

- LinkedIn Organization Page connections no longer request member analytics permissions unless separately enabled with `OPENPOST_LINKEDIN_MEMBER_ANALYTICS_ENABLED=true` and approved by LinkedIn.

### Changed

- Existing installations using LinkedIn member analytics must set `OPENPOST_LINKEDIN_MEMBER_ANALYTICS_ENABLED=true` and restart OpenPost to retain collection after upgrading. The setting defaults to false, independently of Organization Page support. Reconnect accounts only if their existing authorization lacks `r_member_profileAnalytics` or `r_member_postAnalytics`. Stored metrics are preserved.
