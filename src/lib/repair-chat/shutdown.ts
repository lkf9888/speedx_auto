/**
 * Send the follow-up emails for open conversations before the server exits.
 *
 * Render sends SIGTERM on every deploy and restart and kills the process
 * 30 seconds later. Next.js handles SIGTERM itself: it stops taking new
 * requests, waits for in-flight ones, then calls process.exit(). We hold that
 * exit until the open sessions are finished (bounded, so a slow summary or
 * mail server can't block the shutdown). If NEXT_MANUAL_SIG_HANDLE is set,
 * Next leaves the signal to us and we exit ourselves.
 */
import type { SessionStore } from "./session";

const FLUSH_LIMIT_MS = 20_000;
const REGISTERED = Symbol.for("speedx.repairChat.shutdownFlush");

export function flushWithin(store: SessionStore, limitMs = FLUSH_LIMIT_MS): Promise<void> {
  return Promise.race([
    store.finishAll("server_restart"),
    new Promise<void>((resolve) => setTimeout(resolve, limitMs).unref?.()),
  ]);
}

export function registerShutdownFlush(store: SessionStore, proc: NodeJS.Process = process): void {
  const holder = globalThis as { [REGISTERED]?: boolean };
  if (holder[REGISTERED]) return;
  holder[REGISTERED] = true;

  const exit = proc.exit.bind(proc);
  let flushing: Promise<void> | null = null;
  const flush = () => (flushing ??= flushWithin(store).catch(() => {}));

  const onSignal = () => {
    if (proc.env.NEXT_MANUAL_SIG_HANDLE) {
      void flush().finally(() => exit(0));
      return;
    }
    // Next calls process.exit() once in-flight requests have finished;
    // finish the sessions at that point so their last replies are included.
    proc.exit = ((code?: number) => {
      void flush().finally(() => exit(code));
    }) as typeof proc.exit;
  };
  proc.once("SIGTERM", onSignal);
  proc.once("SIGINT", onSignal);
}
