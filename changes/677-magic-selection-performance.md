### Performance

- Accelerated large Image Editor magic selections and fills with scanline traversal and worker execution that no longer pauses between progress updates. Scans use less temporary memory and retain the same pixel matching and connectivity rules.

### Fixed

- Cancelling or closing the Image Editor reliably stops a pending magic scan. Cancelled previews cannot apply edits, and an older scan cannot hide a replacement scan's progress controls.
