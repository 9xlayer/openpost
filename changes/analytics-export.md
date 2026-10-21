### Added

- Export Analytics from the web app as CSV, Excel with charts, or JSON. Choose the timezone, group rows by post, day, week, month, platform, or account, filter platforms and metrics, and pick which table to download. Unmeasured provider metrics stay empty instead of becoming zero. The same export is available at `GET /analytics/export`.

- Select individual connected accounts using their avatar, platform, and handle. Every exported table respects the selection; missing measurements stay empty, and grouped reports exclude averages and reporting-period values that cannot be summed by publication date.
