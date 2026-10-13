### Performance

- Video Editor preview and export reuse the active sequence's item index when resolving transform parents, property links, and expressions. Large timelines no longer rebuild the complete lookup for each visible clip; paused edits continue to update immediately.
