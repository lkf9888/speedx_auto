/**
 * The browser's side of the ALLDATA operation log: posts one line per action to /api/workbench/alldata-log.
 * The server writes who and when; what is sent here is counts, money, ids and codes (see alldata-oplog.ts).
 * A line that can't be written never undoes or blocks what was done: the caller shows a small notice.
 */
import type { OpAction, OpDetail, OpResult } from "./alldata-oplog";

export interface OpLogLine {
  action: OpAction;
  documentId?: number | null;
  documentNumber?: number | null;
  /** Counts and money only; the server turns them into the summary line. */
  detail?: OpDetail;
  gates?: string[];
  ownerAck?: boolean;
  result: OpResult;
  errorCode?: string;
}

/** Whether the line reached the log. */
export async function logOp(line: OpLogLine): Promise<boolean> {
  try {
    const response = await fetch("/api/workbench/alldata-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry: line }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
