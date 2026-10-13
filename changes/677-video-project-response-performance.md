### Performance

- Cloud Video Project, revision, and conflict reads validate and return stored documents directly, reducing response CPU time and temporary allocations while preserving the existing API schema. Stored numeric values no longer lose precision during response encoding.
