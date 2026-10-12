export const browserExtensions = [
  {
    slug: "youtube-localizer",
    name: "YouTube Localizer",
    title: "YouTube Localizer browser extension - OpenPost",
    description:
      "Translate video titles, descriptions and thumbnails in YouTube Studio. Generate new thumbnails with your own reference images.",
    headline: "Make your videos work in more languages.",
    repository: "https://github.com/getopenpost/youtube-localizer",
    screenshot: "/assets/marketing/extensions/youtube-localizer-745a10444f66.webp",
    screenshotAlt:
      "YouTube Localizer’s Generate button beside a real video thumbnail in YouTube Studio",
    screenshotWidth: 950,
    screenshotHeight: 510,
    screenshotCaption: "Generate a thumbnail directly from YouTube Studio.",
    screenshots: [
      {
        src: "/assets/marketing/extensions/youtube-localizer-settings-light-4375ddc0c5ef.png",
        alt: "YouTube Localizer settings with text and image provider controls",
        caption: "Connect your translation and thumbnail providers.",
        width: 1280,
        height: 1061,
      },
      {
        src: "/assets/marketing/extensions/youtube-localizer-settings-advanced-6fac8c6ee1ff.png",
        alt: "YouTube Localizer advanced settings",
        caption: "Set image quality and a per-batch request limit.",
        width: 1280,
        height: 1287,
      },
    ],
    tone: "lilac",
    benefits: [
      {
        title: "Localize in Studio",
        text: "Choose your languages, select videos in Studio Content and click Localize. The extension checks for missing titles, descriptions and thumbnail text, then generates and saves them while preserving existing translations.",
      },
      {
        title: "Make your next thumbnail",
        text: "Keep optional face, brand and style references ready. Generate original thumbnails through Fal, then download them or use them as localization sources.",
      },
      {
        title: "Reuse paid work",
        text: "Batch translations across languages for each video. Prepare each source thumbnail background once, then render translated text locally. Saved results are reused when you retry unfinished work.",
      },
    ],
    setup: [
      "Install the extension and open Settings.",
      "Add your text-provider and Fal keys, then choose your target languages and components.",
      "With YouTube Studio in English, select videos on the Content page and click Localize.",
      "Wait for confirmed completion. The extension reports any items it could not save and keeps generated results for retry.",
    ],
    cost: "The extension is free. AI requests use your own provider keys and their pricing.",
    privacy:
      "OpenPost receives no extension data. Selected video text and images go directly to your configured AI providers when you request generation. Provider keys, saved references and job history stay in your browser.",
    privacyUpdated: "12 October 2026",
    privacySections: [
      {
        title: "Scope",
        text: "YouTube Localizer by OpenPost helps creators localize video titles, descriptions and thumbnails and generate original thumbnails. It has no OpenPost account requirement, operator backend or telemetry.",
      },
      {
        title: "YouTube Studio data",
        text: "The extension reads selected video titles, descriptions, thumbnails, language coverage and channel/video identifiers from your signed-in YouTube Studio session. It uses these to find missing translations and save the results you request. Local account bindings keep work tied to the selected channel. The extension does not request your Google password or send your YouTube session credentials to an AI provider.",
      },
      {
        title: "AI providers and authentication",
        text: "When you request generation, the relevant video text, source thumbnail and any reference images you select are sent directly to the AI providers you configure. Text may go to OpenAI, OpenRouter, Anthropic or a compatible custom endpoint. Image generation and editing use Fal and its selected model. Provider API keys are sent only to authenticate requests to their configured provider. Remote provider connections use HTTPS. User-configured local text servers may use HTTP on localhost or 127.0.0.1.",
      },
      {
        title: "Provider processing",
        text: "Providers may retain inputs and outputs or use subprocessors according to their own policies and your provider account settings. OpenPost does not receive or store those requests. Provider processing and charges are governed by your relationship with the provider. Deleting data from this extension does not delete copies held by providers or translations already saved to YouTube.",
      },
      {
        title: "Your data and deletion",
        text: "Provider keys are kept in trusted extension session storage by default. You can explicitly choose to remember them on your device and can forget saved keys in Settings. Preferences, job history, source images, generated results, reusable thumbnail backgrounds and selected reference images remain in local extension storage so work can resume and paid outputs can be reused. Cached assets remain until you remove them or remove extension data. Uninstalling removes extension storage. Exported backups omit provider credentials and account bindings; downloaded images and backups remain wherever you save them.",
      },
      {
        title: "Limited use",
        text: "The extension does not sell user data, use it for advertising or credit decisions, or transfer it for purposes unrelated to requested localization and thumbnail generation. Its use of user data follows the Chrome Web Store User Data Policy, including the Limited Use requirements.",
      },
      {
        title: "External websites and contact",
        text: "External OpenPost, GitHub, YouTube and provider websites have their own privacy practices. For questions, contact https://github.com/getopenpost/youtube-localizer/issues. Do not post API keys, private video information or reference images in public issues.",
      },
    ],
  },
  {
    slug: "feed-limiter",
    name: "Feed Limiter",
    title: "Feed Limiter browser extension - OpenPost",
    description:
      "Pause feeds on X, YouTube, Instagram, TikTok, LinkedIn, Facebook, Reddit, Threads, Bluesky and Pinterest. Set site limits, a shared allowance and allowed hours.",
    headline: "Less scrolling. Keep the useful parts.",
    repository: "https://github.com/getopenpost/feed-limiter",
    screenshot: "/assets/marketing/extensions/x-timeline-blocker-08db3f799836.webp",
    screenshotAlt: "A paused X home feed with posting and navigation still available",
    screenshotWidth: 1280,
    screenshotHeight: 800,
    screenshotCaption: "Pause the feed while keeping posting and navigation available.",
    screenshots: [
      {
        src: "/assets/marketing/extensions/feed-limiter-885e055990fe.png",
        alt: "Feed Limiter settings for YouTube feeds and distractions",
        caption: "Choose which feeds and distractions to pause for each site.",
        width: 1280,
        height: 800,
      },
      {
        src: "/assets/marketing/extensions/feed-limiter-shared-limits-4caa485f92d5.png",
        alt: "Shared allowance and allowed-hours settings",
        caption: "An example shared allowance and weekday browsing window.",
        width: 1280,
        height: 800,
      },
    ],
    tone: "blue",
    benefits: [
      {
        title: "Open feeds on purpose",
        text: "Selected feeds start paused. Choose Browse feed to start your allowance, then pause the session to keep unused time. Each site starts with five minutes per hour.",
      },
      {
        title: "Set limits that fit",
        text: "Choose hourly, two-hour or daily allowances, add a shared cap across sites, and set allowed days and hours. YouTube has separate controls for Home, Shorts, Subscriptions and player distractions.",
      },
      {
        title: "Keep the useful parts",
        text: "Direct posts, search, messages and creation tools stay available where the website keeps them separate from feeds. Controls apply to supported desktop websites, not native mobile apps.",
      },
    ],
    setup: [
      "Install the extension and open a supported social website.",
      "Choose Browse feed when you want to start a session.",
      "Open Settings to set site allowances, a shared cap and allowed hours.",
    ],
    cost: "Free. No extension account, subscription or API keys needed.",
    privacy:
      "Settings, schedules and timers stay in your browser. Supported page URLs and feed elements are processed locally to apply your limits. No browsing content or activity is sent to OpenPost or another server.",
    privacyUpdated: "12 October 2026",
    privacySections: [
      {
        title: "Scope",
        text: "Feed Limiter by OpenPost limits selected social website feeds. It has no extension account, operator backend, analytics or advertising tracking.",
      },
      {
        title: "Data handled locally",
        text: "The extension processes the URL and page structure of supported websites locally to identify selected feeds and show or hide them. It stores preferences, schedules, site allowances and session timing in the browser. It does not build a list of visited posts or send page content, URLs or timer activity to OpenPost or another server. Local route processing is necessary to preserve access to direct posts, messages and other pages outside selected feeds.",
      },
      {
        title: "Your data and deletion",
        text: "Settings and timer state remain in the browser until changed or the extension's data is removed. Removing the extension removes its extension storage. The extension does not synchronize this information through an OpenPost service. Browser or device backup behavior is controlled separately by your browser and operating system.",
      },
      {
        title: "Limited use",
        text: "Feed Limiter does not sell user data, use it for advertising or credit decisions, or transfer it for purposes unrelated to limiting feeds. Its use of user data is limited to the functionality described here and follows the Chrome Web Store User Data Policy, including the Limited Use requirements.",
      },
      {
        title: "External websites",
        text: "Links to OpenPost or GitHub open external websites with their own privacy practices. The social websites you visit continue to process data under their own policies.",
      },
      {
        title: "Contact",
        text: "For questions, contact the project through https://github.com/getopenpost/feed-limiter/issues. Do not include private browsing data in a public issue.",
      },
    ],
  },
];
