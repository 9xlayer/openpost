### Performance

- Media library usage summaries count distinct post references in the database instead of loading every matching post into the server. Reused media retains accurate usage and deletion protection with substantially less response processing and memory allocation.
