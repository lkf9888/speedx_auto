/**
 * What the ALLDATA assistant may do on its own and what needs the owner's yes (the owner's confirmation gates,
 * 2026-11-17). Everything starts as "ask". Only the owner can release a kind of action, only for one conversation,
 * by pressing the button on a card; the release is stored with the conversation and can be taken back at any time.
 * The assistant itself can't release anything.
 */

export type GateId = "amount" | "sent" | "customer";

export const RELEASABLE_GATES: readonly GateId[] = ["amount", "sent", "customer"];

export interface GateRelease {
  by: string;
  at: string;
}

export type GateReleases = Partial<Record<GateId, GateRelease>>;

export const GATE_LABEL: Record<GateId, string> = {
  amount: "金额变动超过阈值（$50 或 10%，取较小者）",
  sent: "已打印 / 发送过的估价单",
  customer: "更换客户",
};

export function isGateId(value: unknown): value is GateId {
  return typeof value === "string" && (RELEASABLE_GATES as readonly string[]).includes(value);
}

export type ActionState = "auto" | "ask" | "never";

export interface ActionPolicy {
  id: string;
  label: string;
  /** What happens by default. "auto" still needs a staff member's click on the card; "ask" also needs the owner's tick; "never" has no entry in the workbench at all. */
  state: ActionState;
  /** The gate that can release it, when the owner may. */
  gate?: GateId;
  note: string;
}

/** The table staff and the owner can read: every kind of action and how it is gated. */
export const ACTION_POLICY: readonly ActionPolicy[] = [
  { id: "lookup", label: "查单（只读）", state: "auto", note: "读单据和税设置，不改任何东西。" },
  { id: "create_draft", label: "建草稿", state: "auto", note: "员工在确认卡上点一下；草稿不领单号、不发送、不收款，可删除。" },
  { id: "change_small", label: "改草稿 / 估价单（小额）", state: "auto", note: "员工点“应用”；先显示改前改后；保存后读回核对。" },
  { id: "change_amount", label: "改动金额达到 $50 或 10%（取较小者）", state: "ask", gate: "amount", note: "老板勾确认；老板可对本次对话放开。" },
  { id: "change_sent", label: "改已打印 / 发送过的估价单", state: "ask", gate: "sent", note: "老板勾确认；老板可对本次对话放开。" },
  { id: "change_customer", label: "更换单据上的客户", state: "ask", gate: "customer", note: "老板勾确认；老板可对本次对话放开。" },
  { id: "convert_estimate", label: "草稿转估价单（领取单号）", state: "ask", note: "卡上二次确认；不可放开。" },
  { id: "convert_invoice", label: "转发票（不可撤销）", state: "ask", note: "必须输入“开发票”，并绑定当前版本；不可放开。" },
  { id: "send_customer", label: "向客户发送发票、收据（邮件、短信、打印）", state: "never", note: "工作台没有入口。" },
  { id: "payment", label: "收款、记录付款、退款", state: "never", note: "工作台没有入口；本店也不在 ALLDATA 里收款。" },
  { id: "void_delete", label: "作废、删除单据", state: "never", note: "工作台没有入口（TEST 单清理由人确认后手动处理）。" },
  { id: "sent_or_paid_edit", label: "改已付款的单据", state: "never", note: "发票只读，工作台拒绝。" },
];

/** Whether a gate that would ask is covered by the release stored with the conversation. */
export function isReleased(releases: GateReleases | undefined, gate: GateId): boolean {
  return Boolean(releases?.[gate]);
}
