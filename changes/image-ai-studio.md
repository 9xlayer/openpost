### Added

- Generate images, edit the selected image layer and fill selected areas in Image Editor through fal, with GPT Image 2.5 Flare as the default. Review results before applying them and undo any application.
- Save image requests and provider receipts across restarts, recover uploads without generating again, and record each user's fal costs in the existing AI usage ledger. No image-specific credit limits are enforced.

### Self-hosting

- Configure `FAL_KEY` on the server and worker to enable AI images for signed-in users with Workspace edit access. Migration 155 adds durable image requests and provider attribution to AI usage.
