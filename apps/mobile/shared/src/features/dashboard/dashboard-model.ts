import { toAppTz, type Dayjs } from '@xeprime/domain';
import type { AppFormat } from '@/i18n/use-app-format';
import type { PartnerAgendaItem, PartnerOverview } from './api';

/**
 * Logic HIỂN THỊ thuần của Tổng quan — bản native của `dashboard-model.ts` bên web (clone theo
 * mặc định, skill mobile-feature: chỉ hiển thị, không phải luật nghiệp vụ hay toán tiền — phần đó
 * đã ở `@xeprime/domain`: `moneyChangePercent`, `countChangePercent`).
 *
 * Mọi mốc "hôm nay", "ngày mai", "quá giờ" tính theo giờ Việt Nam (`toAppTz`) và so với một `now`
 * truyền vào: cùng một danh sách không được nhảy nhóm chỉ vì điện thoại ở múi giờ khác.
 */

/** Một vế của câu trả lời đầu trang ("giao 3 xe · nhận lại 2 xe · …"). */
export type AnswerPart =
  | { key: 'pickups'; count: number }
  | { key: 'returns'; count: number }
  | { key: 'requests'; count: number }
  | { key: 'overdue'; count: number };

/**
 * Câu trả lời đầu trang: chỉ các vế KHÁC 0, theo thứ tự việc phải làm. Rỗng ⇒ câu "hôm nay yên
 * ả". `null` khi người xem không được xem đơn VÀ yêu cầu.
 */
export function answerParts(overview: PartnerOverview): AnswerPart[] | null {
  const { today, requests } = overview;
  if (!today && !requests) return null;
  const parts: AnswerPart[] = [];
  const overdue = (today?.pickupsOverdue ?? 0) + (today?.returnsOverdue ?? 0);
  if (overdue > 0) parts.push({ key: 'overdue', count: overdue });
  if (requests && requests.pending > 0) parts.push({ key: 'requests', count: requests.pending });
  if (today && today.pickupsToday > 0) parts.push({ key: 'pickups', count: today.pickupsToday });
  if (today && today.returnsToday > 0) parts.push({ key: 'returns', count: today.returnsToday });
  return parts;
}

export type AgendaGroupKind = 'overdue' | 'today' | 'tomorrow' | 'day';

export interface AgendaGroup {
  /** Khoá ổn định: `overdue` hoặc ngày lịch VN `YYYY-MM-DD`. */
  key: string;
  kind: AgendaGroupKind;
  /** Đầu ngày (giờ VN) của nhóm. `null` với nhóm quá giờ. */
  day: Dayjs | null;
  items: PartnerAgendaItem[];
}

/**
 * Chia lịch giao/nhận thành nhóm: QUÁ GIỜ trước (mọi ngày), rồi từng ngày lịch VN. Giữ nguyên thứ
 * tự server trả — hàm này chỉ cắt nhóm.
 */
export function groupAgenda(items: readonly PartnerAgendaItem[], now: Dayjs): AgendaGroup[] {
  const today = toAppTz(now).startOf('day');
  const tomorrow = today.add(1, 'day');
  const groups: AgendaGroup[] = [];
  const byKey = new Map<string, AgendaGroup>();

  for (const item of items) {
    const at = toAppTz(item.at);
    let key: string;
    let kind: AgendaGroupKind;
    let day: Dayjs | null;
    if (at.isBefore(now)) {
      key = 'overdue';
      kind = 'overdue';
      day = null;
    } else {
      day = at.startOf('day');
      key = day.format('YYYY-MM-DD');
      kind = day.isSame(today, 'day') ? 'today' : day.isSame(tomorrow, 'day') ? 'tomorrow' : 'day';
    }
    let group = byKey.get(key);
    if (!group) {
      group = { key, kind, day, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups.sort((a, b) => (a.kind === 'overdue' ? -1 : b.kind === 'overdue' ? 1 : 0));
}

export type GreetingKey = 'morning' | 'afternoon' | 'evening';

/** Lời chào theo GIỜ VIỆT NAM: sáng tới 11:59, chiều tới 17:59, còn lại là tối. */
export function greetingKey(now: Dayjs): GreetingKey {
  const hour = toAppTz(now).hour();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Chênh lệch tỉ lệ lấp đầy, bằng ĐIỂM phần trăm (một chữ số thập phân) — 40% → 50% là "+10 điểm",
 * không phải "+25%". `null` khi một trong hai kỳ chưa có xe.
 */
export function utilizationPointChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  const points = Math.round((current - previous) * 10) / 10;
  return points === 0 ? 0 : points;
}

/** Số NGÀY LỊCH VN còn lại tới hạn gói — `0` là hết hạn hôm nay, âm là đã quá hạn. */
export function daysUntil(endsAt: string, now: Dayjs): number {
  return toAppTz(endsAt).startOf('day').diff(toAppTz(now).startOf('day'), 'day');
}

/** Gói sắp hết hạn tới mức Tổng quan phải nhắc gia hạn. Cùng hằng với web. */
export const PLAN_RENEW_WARNING_DAYS = 14;

/** Ngày hôm nay kèm THỨ, viết hoa chữ đầu — qua formatter của app, không `dayjs.locale` (ADR 0012). */
export function todayLabel(fmt: AppFormat, now: Dayjs): string {
  const text = fmt.fullDate(now);
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
