import type { ApiClientError } from '@xeprime/api-client';
import {
  API_ERROR_CODE,
  SUPPORT_CAPABILITY,
  SUPPORT_REASON_HEADER,
  isSupportCapability,
  type SupportCapability,
} from '@xeprime/types';

/**
 * LÝ DO RIÊNG của một thao tác mức trung bình/cao trong phiên hỗ trợ gian hàng — ADR 0050 §13.
 *
 * Server là nguồn duy nhất biết thao tác nào cần lý do: nó trả `SUPPORT_REASON_REQUIRED` (428)
 * TRƯỚC khi ghi. Lớp HTTP (`recover` của `@xeprime/api-client`) gọi `recoverSupportReason`, hàm
 * này hỏi người thao tác qua hộp thoại đang được đăng ký (`SupportReasonDialog`, chỉ mount trong
 * phiên), rồi request được gửi lại ĐÚNG MỘT LẦN kèm header lý do. Không form nào của gian hàng phải
 * biết thao tác của nó cần lý do — và form của chủ xe (ngoài phiên) không bao giờ đi qua đây.
 *
 * Module-level như `active-support-context`: một tab một hộp thoại. Chỉ trên trình duyệt.
 */
export interface SupportReasonRequest {
  readonly capabilities: readonly SupportCapability[];
  /** Lý do vừa gửi bị server coi là chưa đủ cụ thể. */
  readonly invalid: boolean;
}

export type SupportReasonPrompter = (request: SupportReasonRequest) => Promise<string | null>;

/** Lệnh đang được khôi phục — do `@xeprime/api-client` truyền cùng lỗi. */
export interface SupportReasonTarget {
  readonly method: string;
  readonly path: string;
}

let prompter: SupportReasonPrompter | null = null;

/**
 * DÙNG LẠI lý do chỉ cho thao tác mà MỘT cú bấm là NHIỀU request: tải giấy tờ = tạo hồ sơ →
 * presign → gắn file, cùng một chiếc xe. Hỏi ba lần cho một cú bấm là ép người thao tác gõ bừa.
 *
 * Mọi thao tác khác hỏi LẠI mỗi lần: một lý do viết cho xe A không được âm thầm nằm trong audit của
 * xe B, và "gửi duyệt thay chủ xe" luôn phải qua ô xác nhận lần hai. Khoá dùng lại gồm cả ĐỐI
 * TƯỢNG (`/vehicles/:id`), không chỉ capability. Rời phiên là xoá (`registerSupportReasonPrompter`).
 */
const REASON_REUSE_MS = 2 * 60_000;
const REUSABLE: ReadonlySet<SupportCapability> = new Set([
  SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE,
]);
const recent = new Map<string, { reason: string; at: number }>();

/** `/vehicles/V/documents/D/versions` → `vehicles/V` — đối tượng của cả chuỗi request. */
function targetOf(path: string): string {
  return path.split('?')[0]!.split('/').filter(Boolean).slice(0, 2).join('/');
}

function reuseKey(
  capabilities: readonly SupportCapability[],
  target: SupportReasonTarget,
): string | null {
  if (capabilities.length === 0 || !capabilities.every((capability) => REUSABLE.has(capability))) {
    return null;
  }
  return `${[...capabilities].sort().join(',')}@${targetOf(target.path)}`;
}

function reusableReason(key: string | null): string | null {
  if (key === null) return null;
  const entry = recent.get(key);
  return entry && Date.now() - entry.at < REASON_REUSE_MS ? entry.reason : null;
}

/** Hai request cùng cần lý do thì hỏi LẦN LƯỢT — không chồng hai hộp thoại. */
let queue: Promise<unknown> = Promise.resolve();

export function registerSupportReasonPrompter(fn: SupportReasonPrompter): () => void {
  prompter = fn;
  return () => {
    if (prompter === fn) prompter = null;
    recent.clear();
  };
}

export async function recoverSupportReason(
  error: ApiClientError,
  target: SupportReasonTarget,
): Promise<Readonly<Record<string, string>> | null> {
  if (error.code !== API_ERROR_CODE.SUPPORT_REASON_REQUIRED) return null;
  const ask = prompter;
  if (!ask) return null;
  const details = (error.details ?? {}) as { capabilities?: unknown; invalid?: unknown };
  const capabilities = Array.isArray(details.capabilities)
    ? details.capabilities.filter(isSupportCapability)
    : [];
  const invalid = details.invalid === true;
  const key = reuseKey(capabilities, target);
  // Tra lý do dùng lại TRONG lượt xếp hàng: request song song thứ hai thấy lý do lượt trước vừa
  // nhập. Lý do bị server coi là chưa đủ cụ thể thì không bao giờ dùng lại.
  const turn = queue.then(
    () => (invalid ? null : reusableReason(key)) ?? ask({ capabilities, invalid }),
  );
  queue = turn.catch(() => undefined);
  const reason = await turn;
  if (reason && key !== null) recent.set(key, { reason, at: Date.now() });
  return reason ? { [SUPPORT_REASON_HEADER]: encodeURIComponent(reason) } : null;
}
