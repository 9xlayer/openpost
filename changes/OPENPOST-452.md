### Changed

- Keep Google provider authorization limited to the scopes OpenPost requests instead of merging unrelated grants from a reused OAuth client.

### Fixed

- Enforce verified Instagram collaborator and Trial Reel combinations before publishing, while preserving older Story drafts by omitting their unsupported collaborator values.
- Reject TikTok photo uploads whose shorter side exceeds 1080 pixels when stored dimensions are available.
- Recover from Instagram's exact media-container propagation delay without retrying the wider publication flow.
- Report actionable Instagram collaborator, first-comment, and video-limit failures without exposing provider response text.
- Collect regular Facebook video views through the supported metric without double-counting Reel plays.
- Explain YouTube thumbnail failures that require channel phone verification while preserving the already published video.
