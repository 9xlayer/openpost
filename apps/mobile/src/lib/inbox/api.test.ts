import { expect, mock, spyOn, test } from "bun:test";
mock.module("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
const { setConversationState, setCommentState } = await import("./api");
const { setServer, clearServer } = await import("../server");

test("viewer read and archive paths never send a write, while editor paths use workspace-scoped state endpoints", async () => {
  const requests: Request[] = [];
  const transport = Object.assign(
    async (input: Parameters<typeof fetch>[0]) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return new Response(null, { status: 204 });
    },
    { preconnect: () => undefined },
  );
  const network = spyOn(globalThis, "fetch").mockImplementation(transport);
  try {
    await setServer("https://native-inbox-review.invalid");
    await setConversationState("workspace", "chat", { read: true }, false);
    await setConversationState("workspace", "chat", { archived: true }, false);
    await setCommentState("workspace", "comment", { read: true }, false);
    await setCommentState("workspace", "comment", { archived: true }, false);
    expect(requests).toHaveLength(0);
    await setConversationState("workspace", "chat", { read: true }, true);
    await setCommentState("workspace", "comment", { archived: true }, true);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/v1/messages/chat/state",
      "/api/v1/engagement/state",
    ]);
    expect(await requests[0].json()).toEqual({ workspace_id: "workspace", read: true });
    expect(await requests[1].json()).toEqual({
      workspace_id: "workspace",
      ids: ["comment"],
      archived: true,
    });
  } finally {
    network.mockRestore();
    await clearServer();
  }
});
