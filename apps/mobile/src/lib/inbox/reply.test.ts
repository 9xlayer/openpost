import { expect, test } from "bun:test";
import { PublicReplySession } from "./reply";
import { parseDraft, type ConversationDraft } from "./state";

const operationId = "5de5172b-639f-4b54-bd72-876dab2e8289";
function fixture(canEdit = true) {
  let disk: ConversationDraft = { text: "Thanks, Alex!", sends: [] };
  const requests: { body: string; operationId: string }[] = [];
  let loseResponse = false;
  const create = () =>
    new PublicReplySession({
      read: async () => parseDraft(JSON.stringify(disk)),
      write: async (value) => {
        disk = JSON.parse(JSON.stringify(value));
      },
      canEdit: () => canEdit,
      current: () => true,
      newOperationId: () => operationId,
      admit: async (body, id) => {
        expect(disk.sends[0]?.operationId).toBe(id);
        requests.push({ body, operationId: id });
        if (loseResponse) throw new Error("connection lost after admission");
        return { job_id: "reply-job" };
      },
    });
  return {
    create,
    requests,
    disk: () => disk,
    loseResponse: (value: boolean) => {
      loseResponse = value;
    },
  };
}
test("lost reply admission survives restart and replays the same UUID, retaining body until provider completion", async () => {
  const f = fixture();
  const first = f.create();
  await first.restore();
  f.loseResponse(true);
  await first.submit();
  expect(f.disk().sends[0]).toMatchObject({
    operationId,
    body: "Thanks, Alex!",
    state: "ambiguous",
  });
  const reopened = f.create();
  await reopened.restore();
  f.loseResponse(false);
  await reopened.submit();
  expect(f.requests).toEqual([
    { body: "Thanks, Alex!", operationId },
    { body: "Thanks, Alex!", operationId },
  ]);
  expect(f.disk()).toMatchObject({
    text: "Thanks, Alex!",
    sends: [{ jobId: "reply-job", state: "queued", operationId }],
  });
  await reopened.observe({ id: "reply-job", status: "processing" });
  expect(reopened.snapshot().operation?.state).toBe("queued");
  await reopened.observe({ id: "reply-job", status: "completed" });
  expect(f.disk()).toMatchObject({
    text: "",
    sends: [{ state: "confirmed", operationId, jobId: "reply-job" }],
  });
});
test("a provider job failure retains text and receipt, and submit cannot create another operation", async () => {
  const f = fixture();
  const session = f.create();
  await session.restore();
  await session.submit();
  await session.observe({
    id: "reply-job",
    status: "failed",
    last_error: "Provider rejected this reply",
  });
  const reopened = f.create();
  await reopened.restore();
  await reopened.submit();
  expect(f.requests).toHaveLength(1);
  expect(f.disk()).toMatchObject({
    text: "Thanks, Alex!",
    sends: [
      { state: "failed", operationId, jobId: "reply-job", error: "Provider rejected this reply" },
    ],
  });
});
test("a viewer can restore a draft but cannot dispatch or alter a retained reply operation", async () => {
  const f = fixture(false);
  const session = f.create();
  await session.restore();
  await session.submit();
  expect(f.requests).toEqual([]);
  expect(f.disk()).toEqual({ text: "Thanks, Alex!", sends: [] });
});
test("typing updates the controlled native field immediately while device persistence is pending", async () => {
  let release: (() => void) | undefined;
  const session = new PublicReplySession({
    read: async () => ({ text: "", sends: [] }),
    write: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    canEdit: () => true,
    current: () => true,
    newOperationId: () => operationId,
    admit: async () => ({ job_id: "unused" }),
  });
  await session.restore();
  const save = session.setText("Thanks, Alex");
  expect(session.snapshot().text).toBe("Thanks, Alex");
  release?.();
  await save;
});
