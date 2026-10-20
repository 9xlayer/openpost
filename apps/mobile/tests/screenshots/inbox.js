// Sample data for native screenshots only. The shipping entry never imports it.
exports.createInboxSamples = ({ workspace, accounts, media, now, SystemDate }) => {
  const chats = [
    [
      "chat-alex",
      "Alex Morgan",
      "alex.bsky.social",
      "bluesky",
      2,
      "Yes, the new release is ready. Can we share the update today?",
    ],
    ["chat-jo", "Jo Silva", "@jo@masto.pt", "mastodon", 0, "Thanks for the walkthrough!"],
    ["chat-lee", "Lee Chen", "lee", "facebook", 1, "Where can I find the product demo?"],
  ].map(([id, name, handle, platform, unread, preview]) => ({
    id,
    counterpart_name: name,
    counterpart_handle: handle,
    platform,
    unread_count: unread,
    last_message_preview: preview,
    workspace_id: workspace.id,
    social_account_id: accounts.find((row) => row.platform === platform).id,
    remote_conversation_id: id,
    counterpart_remote_id: handle,
    counterpart_avatar_url: "",
    last_message_at: now.toISOString(),
    last_remote_message_id: id,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  }));
  const messages = Array.from({ length: 65 }, (_, index) => ({
    id: `sample-message-${index}`,
    workspace_id: workspace.id,
    conversation_id: "chat-alex",
    remote_message_id: `remote-${index}`,
    author_remote_id: index % 3 ? "alex" : "studio",
    direction: index % 3 ? "inbound" : "outbound",
    body:
      index === 64
        ? chats[0].last_message_preview
        : index === 63
          ? "The walkthrough looks great. I’ll prepare the announcement."
          : [
              "The update is looking good.",
              "I’ve added the final screenshots.",
              "Thanks. I’ll check them before we publish.",
            ][index % 3],
    attachments_json: "[]",
    send_status: "sent",
    error_message: "",
    created_at: new SystemDate(now.getTime() - (65 - index) * 60000).toISOString(),
    remote_created_at: new SystemDate(now.getTime() - (65 - index) * 60000).toISOString(),
    updated_at: now.toISOString(),
  }));
  const comments = [
    {
      id: "comment-one",
      workspace_id: workspace.id,
      social_account_id: accounts[0].id,
      platform: "bluesky",
      rendition_id: "rendition-published-one",
      remote_id: "comment-one",
      parent_remote_id: "",
      conversation_remote_id: "post-one",
      author_name: "Alex Morgan",
      author_handle: "alex.bsky.social",
      author_avatar_url: "",
      author_remote_id: "alex",
      body: "The new workspace looks great. Does it keep the original post next to its replies?",
      publication_id: "published-one",
      publication_title: "A new workspace for everything we create.",
      publication_excerpt: "Posts, media and conversations, together in one place.",
      provider_post_url: "https://bsky.app/profile/example.invalid/post/sample",
      account_username: accounts[0].account_username,
      is_ours: false,
      liked: false,
      hidden: false,
      can_reply: true,
      can_like: true,
      can_unlike: false,
      can_hide: false,
      can_delete: true,
      attachments: [],
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      remote_created_at: now.toISOString(),
    },
  ];
  let revision = 0;
  return async (url, method, input, options) => {
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const json = (value) =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (path === "/inbox/changes") {
      await new Promise((resolve) => setTimeout(resolve, 25000));
      return json({ cursor: String(revision), reset: false, changes: [] });
    }
    if (path === "/inbox/activity") return json({});
    if (method === "POST" && path.startsWith("/messages/")) {
      const body = options.body ? JSON.parse(options.body) : await input.json();
      const cid = path.split("/")[2];
      const chat = chats.find((row) => row.id === cid);
      if (path.endsWith("/state") && chat) {
        if (body.read) chat.unread_count = 0;
        if (body.archived !== undefined)
          chat.archived_at = body.archived ? now.toISOString() : undefined;
        return json({});
      }
      if (path.endsWith("/history")) return json({});
      if (path.endsWith("/retry")) {
        const message = messages.find((row) => row.id === body.message_id);
        if (message) message.send_status = "queued";
        return json(message);
      }
      if (path.endsWith("/send")) {
        let message = messages.find((row) => row.client_operation_id === body.client_operation_id);
        if (!message) {
          message = {
            ...messages[0],
            id: `sent-${++revision}`,
            conversation_id: cid,
            client_operation_id: body.client_operation_id,
            remote_message_id: "",
            direction: "outbound",
            body: body.message,
            send_status: "queued",
            created_at: new SystemDate().toISOString(),
            remote_created_at: new SystemDate().toISOString(),
          };
          messages.push(message);
        }
        return json(message);
      }
    }
    if (method === "POST" && path === "/engagement/state") {
      const body = options.body ? JSON.parse(options.body) : await input.json();
      comments
        .filter((row) => body.ids.includes(row.id))
        .forEach((row) => {
          row.read_at = now.toISOString();
        });
      return json({});
    }
    if (method === "POST" && path.startsWith("/engagement/") && path.endsWith("/actions"))
      return json({ job_id: "sample-engagement-job" });
    if (path === "/inbox/summary")
      return json({
        unread_conversations: chats.filter((chat) => !chat.archived_at && chat.unread_count > 0)
          .length,
        unread_comments: comments.filter((comment) => !comment.read_at).length,
      });
    if (path.startsWith("/engagement/") && method === "GET")
      return json({ item: comments.find((item) => item.id === path.split("/")[2]), parents: [] });
    if (path === "/messages") {
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const items = chats.filter(
        (row) =>
          Boolean(row.archived_at) === (url.searchParams.get("archived") === "true") &&
          (!url.searchParams.get("account_id") ||
            row.social_account_id === url.searchParams.get("account_id")) &&
          (url.searchParams.get("unread_only") !== "true" || row.unread_count > 0) &&
          (!search ||
            `${row.counterpart_name} ${row.counterpart_handle} ${row.last_message_preview}`
              .toLowerCase()
              .includes(search)),
      );
      return json({ items, total: items.length, next_cursor: "", sync_states: [] });
    }
    if (path.startsWith("/messages/")) {
      const all = messages
        .filter((row) => row.conversation_id === path.split("/")[2])
        .slice()
        .reverse();
      const offset = Number(url.searchParams.get("cursor")) || 0;
      return json({
        items: all.slice(offset, offset + 20),
        next_cursor: offset + 20 < all.length ? String(offset + 20) : "",
        history_available: false,
        conversation: chats.find((row) => row.id === path.split("/")[2]),
      });
    }
    if (path === "/engagement") {
      const items = comments.filter(
        (row) =>
          (!url.searchParams.get("account_id") ||
            row.social_account_id === url.searchParams.get("account_id")) &&
          (url.searchParams.get("unread_only") !== "true" || !row.read_at),
      );
      return json({ items, total: items.length, next_cursor: "", sync_states: [] });
    }
    if (path === "/account-features")
      return json(
        accounts.flatMap((account) =>
          ["messaging", "engagement"].map((feature) => ({
            workspace_id: workspace.id,
            social_account_id: account.id,
            feature,
            platform: account.platform,
            availability: "available",
            effective_enabled: true,
            supported: true,
            reason_code: "available",
            stored_enabled: true,
            stored_exists: true,
          })),
        ),
      );
    if (path === "/media")
      return json({
        media: media.map((row) => ({
          ...row,
          size: 102400,
          processing_status: "ready",
          alt_text: "A Lisbon tram",
          created_at: now.toISOString(),
          workspace_id: workspace.id,
        })),
        total: media.length,
      });
  };
};
