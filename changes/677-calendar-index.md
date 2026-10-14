### Performance

- Calendar date ranges use an index on each post's actual calendar occurrence, avoiding scans and sorts over unrelated history. Authored schedules, published timestamps, workspace boundaries, and stable pagination retain their existing behavior.
