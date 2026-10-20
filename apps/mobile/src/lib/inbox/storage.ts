import * as FileSystem from "expo-file-system/legacy";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { uuid } from "expo-modules-core";
import { captureApiRequestIdentity, apiRequestIdentityIsCurrent } from "../api/client";
import { parseDraft, type ConversationDraft } from "./state";

const directory = `${FileSystem.documentDirectory}inbox/`;
let pending: Promise<unknown> = Promise.resolve();
let generation = 0;
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}

export function inboxStorageScope(workspaceId: string) {
  const identity = captureApiRequestIdentity();
  const hash = bytesToHex(
    sha256(utf8ToBytes(JSON.stringify([identity.serverBaseUrl, identity.token, workspaceId]))),
  );
  return { key: hash, current: () => apiRequestIdentityIsCurrent(identity), generation };
}
export type InboxStorageScope = ReturnType<typeof inboxStorageScope>;
function path(scope: InboxStorageScope, conversationId: string) {
  return `${directory}${scope.key}-${bytesToHex(sha256(utf8ToBytes(conversationId)))}.json`;
}
export function readConversationDraft(scope: InboxStorageScope, conversationId: string) {
  return enqueue(async (): Promise<ConversationDraft> => {
    if (!scope.current() || scope.generation !== generation) return { text: "", sends: [] };
    const file = path(scope, conversationId);
    if (!(await FileSystem.getInfoAsync(file)).exists) return { text: "", sends: [] };
    return parseDraft(await FileSystem.readAsStringAsync(file));
  });
}
export function saveConversationDraft(
  scope: InboxStorageScope,
  conversationId: string,
  draft: ConversationDraft,
) {
  return enqueue(async () => {
    if (!scope.current() || scope.generation !== generation) return;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.writeAsStringAsync(path(scope, conversationId), JSON.stringify(draft));
  });
}
export async function purgeInboxDeviceData() {
  generation++;
  await enqueue(() => FileSystem.deleteAsync(directory, { idempotent: true }));
}
export function newInboxOperationId() {
  return uuid.v4();
}
let clientId: string | undefined;
export function inboxClientId() {
  return (clientId ??= uuid.v4());
}
