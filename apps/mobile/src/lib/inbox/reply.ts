import type { ConversationDraft, PendingSend } from "./state";

type ReplyJob = { id: string; status: string; last_error?: string };
interface ReplySnapshot {
  ready: boolean;
  text: string;
  operation: PendingSend | null;
  history: PendingSend[];
  error?: string;
}
interface ReplyDependencies {
  read(): Promise<ConversationDraft>;
  write(draft: ConversationDraft): Promise<void>;
  admit(body: string, operationId: string): Promise<{ job_id?: string }>;
  newOperationId(): string;
  canEdit(): boolean;
  current(): boolean;
}
/** Owns admission, crash recovery and provider receipts for one authored public reply. */
export class PublicReplySession {
  private value: ReplySnapshot = { ready: false, text: "", operation: null, history: [] };
  private listeners = new Set<() => void>();
  private inFlight = false;
  private active = true;
  private allowed: boolean | undefined;
  setAccess(canEdit: boolean, active: boolean) {
    this.allowed = canEdit;
    this.active = active;
  }
  private current() {
    return this.active && this.dependencies.current();
  }
  constructor(private readonly dependencies: ReplyDependencies) {}
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(value: ReplySnapshot) {
    if (!this.current()) return;
    this.value = value;
    for (const listener of this.listeners) listener();
  }
  private async persist(update: Omit<ReplySnapshot, "history"> & { history?: PendingSend[] }) {
    const value: ReplySnapshot = { ...update, history: update.history ?? this.value.history };
    if (!this.current()) return;
    await this.dependencies.write({
      text: value.text,
      sends: value.operation ? [value.operation] : [],
      ...(value.history.length ? { replyHistory: value.history } : {}),
    });
    this.emit(value);
  }
  async restore() {
    try {
      const draft = await this.dependencies.read();
      this.emit({
        ready: true,
        text: draft.text,
        operation: draft.sends[0] ?? null,
        history: draft.replyHistory ?? [],
      });
    } catch {
      this.emit({
        ...this.value,
        error: "Could not restore the saved reply. Reopen this comment.",
      });
    }
  }
  async setText(text: string) {
    if (!this.value.ready || (this.value.operation && this.value.operation.state !== "confirmed"))
      return;
    const next: ReplySnapshot = { ready: true, text, operation: null, history: this.value.history };
    this.emit(next);
    try {
      await this.dependencies.write({
        text,
        sends: [],
        ...(next.history.length ? { replyHistory: next.history } : {}),
      });
    } catch {
      this.emit({
        ...this.value,
        error: "Could not save this reply. Keep this screen open and try again.",
      });
    }
  }
  async startNewReply() {
    const operation = this.value.operation;
    if (
      !this.current() ||
      !(this.allowed ?? this.dependencies.canEdit()) ||
      !operation?.jobId ||
      operation.state !== "failed" ||
      this.inFlight
    )
      return;
    // Only this deliberate recovery unlocks editing. A new UUID is allocated by the later Send.
    await this.persist({
      ready: true,
      text: operation.body,
      operation: null,
      history: [...this.value.history, operation],
    }).catch(() =>
      this.emit({
        ...this.value,
        error:
          "Could not save the failed receipt. Reopen this comment before starting another reply.",
      }),
    );
  }
  async submit() {
    if (
      !this.value.ready ||
      !(this.allowed ?? this.dependencies.canEdit()) ||
      !this.current() ||
      this.inFlight
    )
      return;
    const prior = this.value.operation;
    if (prior?.jobId || prior?.state === "failed" || prior?.state === "confirmed") return;
    const body = prior?.body ?? this.value.text.trim();
    if (!body) return;
    const operation: PendingSend = {
      ...prior,
      operationId: prior?.operationId ?? this.dependencies.newOperationId(),
      body,
      createdAt: prior?.createdAt ?? new Date().toISOString(),
      state: "sending",
    };
    this.inFlight = true;
    try {
      await this.persist({ ready: true, text: body, operation });
      if (!this.current()) return;
      const receipt = await this.dependencies.admit(body, operation.operationId);
      if (!receipt.job_id) throw new Error("The server did not confirm a durable reply receipt.");
      if (!this.current()) return;
      await this.persist({
        ready: true,
        text: body,
        operation: { ...operation, state: "queued", jobId: receipt.job_id },
      });
    } catch (error) {
      if (!this.current()) return;
      await this.persist({
        ready: true,
        text: body,
        operation: { ...operation, state: "ambiguous" },
        error:
          error instanceof Error
            ? error.message
            : "Delivery could not be confirmed. Retry safely with the same reply.",
      }).catch(() =>
        this.emit({
          ...this.value,
          error: "Could not save the reply receipt. Reopen this comment before retrying.",
        }),
      );
    } finally {
      this.inFlight = false;
    }
  }
  async observe(job: ReplyJob) {
    const operation = this.value.operation;
    if (!operation || operation.jobId !== job.id || !this.current()) return;
    const state =
      job.status === "completed" ? "confirmed" : job.status === "failed" ? "failed" : undefined;
    if (!state || operation.state === state) return;
    await this.persist({
      ready: true,
      text: state === "confirmed" ? "" : operation.body,
      operation: {
        ...operation,
        state,
        error:
          state === "failed"
            ? job.last_error ||
              "The network did not confirm this reply. Check the thread before writing another."
            : undefined,
      },
    }).catch(() =>
      this.emit({
        ...this.value,
        error:
          "Could not save the delivery result. Check delivery status before writing another reply.",
      }),
    );
  }
}
