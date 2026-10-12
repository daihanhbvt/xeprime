import { describe, expect, it } from 'vitest';
import { DASHBOARD_AGENDA_KIND } from '@xeprime/types';
import { dayjs } from '@/lib/datetime';
import {
  answerParts,
  daysUntil,
  greetingKey,
  groupAgenda,
  utilizationPointChange,
} from './dashboard-model';
import type { PartnerAgendaItem, PartnerOverview } from './types';

/**
 * Logic hiển thị thuần của Tổng quan. Mọi mốc là giờ VIỆT NAM: 23:30 UTC đã là 06:30 sáng hôm sau
 * ở Hà Nội, và một lịch giao xe nhảy nhóm theo múi giờ máy người xem là lịch nói sai.
 */

function overview(over: Partial<PartnerOverview> = {}): PartnerOverview {
  return {
    generatedAt: '2026-10-09T03:00:00.000Z',
    today: {
      awaitingPickup: 0,
      pickupsToday: 0,
      pickupsOverdue: 0,
      active: 0,
      returnsToday: 0,
      returnsOverdue: 0,
    },
    requests: { pending: 0, pendingUrgent: 0, nextRespondBy: null, awaitingPayment: 0 },
    agenda: { items: [], hasMore: false },
    month: null,
    trend: null,
    market: null,
    reputation: {
      sampleCount: 0,
      responseRatePercent: null,
      acceptKeepRatePercent: null,
      responseMinutesMedian: null,
      instantBook: false,
    },
    ...over,
  } as PartnerOverview;
}

function item(at: string, id: string): PartnerAgendaItem {
  return {
    kind: DASHBOARD_AGENDA_KIND.PICKUP,
    at,
    bookingId: id,
    code: `XP${id}`,
    vehicleId: 'v',
    vehicleName: 'Vios',
    plateNumber: null,
    customerName: 'An',
    serviceType: 'self_drive',
  };
}

describe('answerParts — câu trả lời đầu trang', () => {
  it('chỉ các vế khác 0, theo thứ tự việc phải làm: quá giờ → yêu cầu → giao → nhận', () => {
    const parts = answerParts(
      overview({
        today: {
          awaitingPickup: 4,
          pickupsToday: 2,
          pickupsOverdue: 1,
          active: 3,
          returnsToday: 1,
          returnsOverdue: 1,
        },
        requests: { pending: 3, pendingUrgent: 0, nextRespondBy: null, awaitingPayment: 0 },
      }),
    );
    expect(parts).toEqual([
      { key: 'overdue', count: 2 },
      { key: 'requests', count: 3 },
      { key: 'pickups', count: 2 },
      { key: 'returns', count: 1 },
    ]);
  });

  it('không có việc ⇒ mảng rỗng (câu "yên ả"), không phải null', () => {
    expect(answerParts(overview())).toEqual([]);
  });

  it('không được xem đơn lẫn yêu cầu ⇒ null — không có gì để khẳng định', () => {
    expect(answerParts(overview({ today: null, requests: null }))).toBeNull();
  });
});

describe('groupAgenda — nhóm theo ngày lịch VN', () => {
  // 10:00 sáng 09/10/2026 giờ Việt Nam.
  const now = dayjs('2026-10-09T03:00:00.000Z');

  it('quá giờ đứng đầu; hôm nay / ngày mai / ngày khác tách nhóm theo giờ VN', () => {
    const groups = groupAgenda(
      [
        item('2026-10-08T23:30:00.000Z', 'a'), // 06:30 sáng 09/10 VN — đã qua 10:00 ⇒ quá giờ
        item('2026-10-09T09:00:00.000Z', 'b'), // 16:00 hôm nay
        item('2026-10-09T18:00:00.000Z', 'c'), // 01:00 sáng 10/10 VN ⇒ ngày mai
        item('2026-10-11T02:00:00.000Z', 'd'), // 09:00 11/10
      ],
      now,
    );
    expect(groups.map((g) => [g.kind, g.items.map((i) => i.bookingId)])).toEqual([
      ['overdue', ['a']],
      ['today', ['b']],
      ['tomorrow', ['c']],
      ['day', ['d']],
    ]);
    expect(groups[3]!.key).toBe('2026-10-11');
  });

  it('nhóm quá giờ vẫn đứng đầu dù dữ liệu đến không theo thứ tự', () => {
    const groups = groupAgenda(
      [item('2026-10-09T09:00:00.000Z', 'b'), item('2026-10-07T01:00:00.000Z', 'a')],
      now,
    );
    expect(groups[0]!.kind).toBe('overdue');
  });
});

describe('greetingKey — theo giờ Việt Nam', () => {
  it('sáng < 12:00 ≤ chiều < 18:00 ≤ tối', () => {
    expect(greetingKey(dayjs('2026-10-09T04:59:00.000Z'))).toBe('morning'); // 11:59 VN
    expect(greetingKey(dayjs('2026-10-09T05:00:00.000Z'))).toBe('afternoon'); // 12:00 VN
    expect(greetingKey(dayjs('2026-10-09T11:00:00.000Z'))).toBe('evening'); // 18:00 VN
    expect(greetingKey(dayjs('2026-10-08T23:30:00.000Z'))).toBe('morning'); // 06:30 VN
  });
});

describe('utilizationPointChange — điểm phần trăm, không phải % của %', () => {
  it('40% → 50% là +10 điểm', () => {
    expect(utilizationPointChange(50, 40)).toBe(10);
    expect(utilizationPointChange(35.5, 40)).toBe(-4.5);
  });

  it('một kỳ chưa có xe ⇒ null', () => {
    expect(utilizationPointChange(50, null)).toBeNull();
    expect(utilizationPointChange(null, 40)).toBeNull();
  });
});

describe('daysUntil — ngày lịch VN, không chia 24 giờ', () => {
  const now = dayjs('2026-10-09T15:00:00.000Z'); // 22:00 09/10 VN

  it('hạn 08:00 sáng mai là còn 1 ngày', () => {
    expect(daysUntil('2026-10-10T01:00:00.000Z', now)).toBe(1);
  });

  it('hết hạn trong hôm nay là 0, đã qua là số âm', () => {
    expect(daysUntil('2026-10-09T16:30:00.000Z', now)).toBe(0); // 23:30 cùng ngày VN
    expect(daysUntil('2026-10-07T01:00:00.000Z', now)).toBe(-2);
  });
});
