import {
  AUDIT_TARGET_TYPE,
  SUPPORT_CASE_AUDIT_ACTION,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_OPEN_REASON,
  SUPPORT_CASE_PRIORITY,
  SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES,
  SUPPORT_CASE_STATUS,
  SUPPORT_CASE_STATUS_OPEN,
  SUPPORT_PARTY,
  type SupportCaseCategory,
  type SupportCasePriority,
  type SupportParty,
} from '@xeprime/types';
import type { Prisma } from '../generated/client';
import { newId } from './id';

/**
 * MỞ một case hỗ trợ — hình dạng hàng ghi dùng chung cho API (`SupportService`) và worker (case
 * `handover_unconfirmed` do hệ thống mở — ADR 0066, lớp 3).
 *
 * Cùng lý do với `promo-redemption.ts`: worker cố ý không kéo runtime Nest vào nên không gọi được
 * `SupportService`, và một bản sao thứ hai của câu INSERT sẽ trôi khỏi bản gốc — mã case sinh khác
 * kiểu, trạng thái đầu khác, quên `priority`. Quyền (ai được gắn đơn nào), audit và thông báo vẫn
 * là việc của người gọi: chúng khác nhau giữa một người bấm nút và một lượt quét của đồng hồ.
 *
 * Gọi TRONG transaction của người gọi — case và việc khiến nó tồn tại (claim của worker, audit)
 * phải cùng sống hoặc cùng chết.
 */
export interface SupportCaseOpenInput {
  tenantId: string | null;
  bookingId?: string | null;
  bookingRequestId?: string | null;
  /** NULL = hệ thống mở; DB chỉ nhận NULL khi `openedByScope = platform`. */
  openedByUserId: string | null;
  openedByScope: SupportParty;
  category: SupportCaseCategory;
  priority?: SupportCasePriority;
  subject: string;
  description: string;
}

/** Mã người đọc qua điện thoại: `SC` + 6 ký tự cuối của ULID. */
export function supportCaseCode(id: string): string {
  return `SC${id.slice(-6).toUpperCase()}`;
}

export async function createSupportCaseWithinTx(
  tx: Prisma.TransactionClient,
  input: SupportCaseOpenInput,
): Promise<{ id: string; code: string }> {
  const id = newId();
  const code = supportCaseCode(id);
  await tx.supportCase.create({
    data: {
      id,
      code,
      tenantId: input.tenantId,
      bookingId: input.bookingId ?? null,
      bookingRequestId: input.bookingRequestId ?? null,
      openedByUserId: input.openedByUserId,
      openedByScope: input.openedByScope,
      category: input.category,
      status: SUPPORT_CASE_STATUS.OPEN,
      priority: input.priority ?? SUPPORT_CASE_PRIORITY.NORMAL,
      subject: input.subject.trim().slice(0, 255),
      description: input.description.trim(),
    },
    select: { id: true },
  });
  return { id, code };
}

/** Đủ để ĐỌC case — `PrismaClient`, `PrismaService` và client của một transaction đều khớp. */
type SupportCaseReader = Pick<Prisma.TransactionClient, 'supportCase' | 'auditLog'>;

/**
 * Mảnh `where` "case CÒN MỞ thuộc các loại này" — dùng thẳng được trong bộ lọc quan hệ
 * (`booking: { supportCases: { some: openSupportCaseWhere() } }`).
 *
 * Mặc định là `SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES`: câu hỏi "tiền đơn này đang bị giữ
 * không" có MỘT câu trả lời cho `HoldSettlementService`, cờ `disputeOpen` của dòng hold và bộ đếm
 * màn tiền nền tảng (ADR 0028 R3 · ADR 0066). Người cần một tập khác (vd. chỉ `dispute`) truyền
 * tường minh.
 */
export function openSupportCaseWhere(
  categories: readonly SupportCaseCategory[] = SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES,
): Prisma.SupportCaseWhereInput {
  return {
    category: { in: [...categories] },
    status: { in: [...SUPPORT_CASE_STATUS_OPEN] },
  };
}

/** Đơn có case còn mở thuộc `categories` không (mặc định: nhóm GIỮ quyết toán). */
export async function hasOpenSupportCase(
  db: SupportCaseReader,
  bookingId: string,
  categories: readonly SupportCaseCategory[] = SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES,
): Promise<boolean> {
  const hit = await db.supportCase.findFirst({
    where: { bookingId, ...openSupportCaseWhere(categories) },
    select: { id: true },
  });
  return hit !== null;
}

/** Bản theo LÔ của `hasOpenSupportCase` — một truy vấn cho cả trang, không N+1. */
export async function bookingIdsWithOpenSupportCase(
  db: SupportCaseReader,
  bookingIds: readonly string[],
  categories: readonly SupportCaseCategory[] = SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES,
): Promise<Set<string>> {
  if (bookingIds.length === 0) return new Set();
  const rows = await db.supportCase.findMany({
    where: { bookingId: { in: [...bookingIds] }, ...openSupportCaseWhere(categories) },
    select: { bookingId: true },
    distinct: ['bookingId'],
  });
  return new Set(rows.map((r) => r.bookingId).filter((v): v is string => v !== null));
}

/**
 * Báo cáo "CHƯA NHẬN ĐƯỢC XE" CÒN MỞ của KHÁCH trên từng đơn (ADR 0066, lớp 1) — case `dispute`
 * do khách mở mà dòng audit mở case mang `reason = trip_not_received`.
 *
 * Phân biệt với mọi tranh chấp khác trên cùng đơn là điều kiện ĐÚNG, không phải tối ưu: tranh chấp
 * do GIAN HÀNG mở không phải lời báo của khách (lấy nó làm "đã báo" là nuốt lời khách và để chính
 * gian hàng đóng case của mình để gỡ băng tiền), và một tranh chấp thường khách mở về chuyện khác
 * không nói gì về việc đã nhận được xe hay chưa. Dấu `reason` chỉ nằm ở audit — sổ append-only,
 * cùng transaction với lúc mở case, nên không thể lệch với case.
 *
 * Trả về case CŨ NHẤT mỗi đơn. `customerUserId` thu hẹp về đúng một khách khi người gọi biết.
 */
export async function openTripNotReceivedReports(
  db: SupportCaseReader,
  bookingIds: readonly string[],
  customerUserId?: string,
): Promise<Map<string, { id: string; code: string }>> {
  const found = new Map<string, { id: string; code: string }>();
  if (bookingIds.length === 0) return found;
  const candidates = await db.supportCase.findMany({
    where: {
      bookingId: { in: [...bookingIds] },
      openedByScope: SUPPORT_PARTY.CUSTOMER,
      ...(customerUserId ? { openedByUserId: customerUserId } : {}),
      ...openSupportCaseWhere([SUPPORT_CASE_CATEGORY.DISPUTE]),
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, code: true, bookingId: true },
  });
  if (candidates.length === 0) return found;

  const marked = await db.auditLog.findMany({
    where: {
      targetType: AUDIT_TARGET_TYPE.SUPPORT_CASE,
      targetId: { in: candidates.map((c) => c.id) },
      action: SUPPORT_CASE_AUDIT_ACTION.OPEN,
      afterJson: { path: ['reason'], equals: SUPPORT_CASE_OPEN_REASON.TRIP_NOT_RECEIVED },
    },
    select: { targetId: true },
  });
  const markedIds = new Set(marked.map((m) => m.targetId));
  for (const c of candidates) {
    if (!c.bookingId || !markedIds.has(c.id) || found.has(c.bookingId)) continue;
    found.set(c.bookingId, { id: c.id, code: c.code });
  }
  return found;
}

/** Một đơn của `openTripNotReceivedReports`. */
export async function findOpenTripNotReceivedReport(
  db: SupportCaseReader,
  bookingId: string,
  customerUserId?: string,
): Promise<{ id: string; code: string } | null> {
  const found = await openTripNotReceivedReports(db, [bookingId], customerUserId);
  return found.get(bookingId) ?? null;
}
