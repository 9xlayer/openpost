### Fixed

- Keep connected-account profile pictures in OpenPost storage so Facebook, Instagram, Threads, and other provider image links cannot expire underneath them. New connections and reconnects save pictures locally, and Refresh profile repairs existing expired pictures without reconnecting the account. Failed downloads preserve the previous picture.
