import type { AppFormat } from '@/i18n/use-app-format';
import { toAppTz, type Dayjs } from '@/lib/datetime';
import type { PartnerAgendaItem, PartnerOverview } from './types';

/**
 * Logic HIỂN THỊ thuần của Tổng quan — không React, không gọi mạng, nên test được bằng dữ liệu.
 *
 * Mọi mốc "hôm nay", "ngày mai", "quá giờ" tính theo giờ Việt Nam (`toAppTz`) và so với một
 * `now` truyền vào: cùng một danh sách không được nhảy nhóm chỉ vì máy người xem ở múi giờ khác.
 */

/** Một vế của câu trả lời đầu trang ("giao 3 xe · nhận lại 2 xe · …"). */
export type AnswerPart =
  | { key: 'pickups'; count: number }
  | { key: 'returns'; count: number }
  | { key: 'requests'; count: number }
  | { key: 'overdue'; count: number };

/**
 * Câu trả lời đầu trang (UX §0 nguyên tắc 1): "Hôm nay giao 3 xe, nhận 2 xe, 4 việc quá giờ".
 *
 * Chỉ các vế KHÁC 0, theo thứ tự việc phải làm. Rỗng ⇒ câu "hôm nay yên ả" — nói rõ là không có
 * gì, không phải im lặng. `null` khi người xem không có quyền xem đơn VÀ yêu cầu (không có gì để
 * khẳng định thì không khẳng định).
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
  /** Khoá ổn định cho React: `overdue` hoặc ngày lịch VN `YYYY-MM-DD`. */
  key: string;
  kind: AgendaGroupKind;
  /** Đầu ngày (giờ VN) của nhóm — để dựng nhãn "Thứ Bảy, 11/10". `null` với nhóm quá giờ. */
  day: Dayjs | null;
  items: PartnerAgendaItem[];
}

/**
 * Chia lịch giao/nhận thành nhóm: QUÁ GIỜ trước (mọi ngày), rồi từng ngày lịch VN.
 *
 * Giữ nguyên thứ tự server trả (đã xếp theo giờ hẹn) — hàm này chỉ cắt nhóm, không xếp lại.
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

  // Nhóm quá giờ luôn đứng đầu, kể cả khi dữ liệu đến không theo thứ tự.
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
 * Chênh lệch tỉ lệ lấp đầy, bằng ĐIỂM phần trăm (một chữ số thập phân) — không phải phần trăm
 * của phần trăm: 40% → 50% là "+10 điểm", nói "+25%" ở đây làm người đọc hiểu sai độ lớn.
 * `null` khi một trong hai kỳ chưa có xe.
 */
export function utilizationPointChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  const points = Math.round((current - previous) * 10) / 10;
  return points === 0 ? 0 : points;
}

/**
 * Số NGÀY LỊCH VN còn lại tới hạn gói — `0` là hết hạn hôm nay, âm là đã quá hạn. Đếm theo ngày
 * lịch chứ không chia 24 giờ: gói hết hạn 08:00 sáng mai là "còn 1 ngày", không phải "còn 0".
 */
export function daysUntil(endsAt: string, now: Dayjs): number {
  return toAppTz(endsAt).startOf('day').diff(toAppTz(now).startOf('day'), 'day');
}

/** Gói sắp hết hạn tới mức Tổng quan phải nhắc gia hạn. */
export const PLAN_RENEW_WARNING_DAYS = 14;

/**
 * Ngày hôm nay kèm THỨ, viết hoa chữ đầu — dòng phụ dưới tiêu đề của MỌI Tổng quan (hai tuyến
 * partner + nền tảng).
 *
 * Đi qua formatter của request (`fmt.fullDate`) chứ không `dayjs().format('dddd…')`: lời gọi
 * `dayjs.locale(...)` toàn tiến trình đã bị gỡ vì nó rò ngôn ngữ giữa các request (ADR 0012).
 */
export function todayLabel(fmt: AppFormat, now: Dayjs): string {
  const text = fmt.fullDate(now);
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
