### Fixes

- Video Editor filmstrip eviction now releases decoded images and object URLs while preserving thumbnails still in use. Cache cleanup discards and releases pending thumbnail loads, preventing stale thumbnails from returning after cleanup.

### Performance

- Filmstrip previews display decoded frames before JPEG cache encoding finishes. Replacing large filmstrips checks retained bitmaps once instead of repeatedly scanning every frame.
