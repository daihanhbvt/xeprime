import { describe, expect, it } from 'vitest';
import {
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  DRIVER_ASSIGNMENT_OUTCOME_VALUES,
  DRIVER_RESPONSE_WINDOW,
  driverRespondByFor,
  driverResponseWindowMinutes,
  DRIVER_MISSING_ALERT_LEAD_MINUTES,
  isDriverMissingAlertDue,
} from './driver';

const MIN = 60_000;
const assignedAt = new Date('2026-10-22T03:00:00.000Z');
const pickupIn = (minutes: number) => new Date(assignedAt.getTime() + minutes * MIN);

describe('driverResponseWindowMinutes (ADR 0066)', () => {
  it('10% của ΔT khi nằm giữa sàn và trần', () => {
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(300))).toBe(30);
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(450))).toBe(45);
  });

  it('làm tròn tới phút gần nhất', () => {
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(204))).toBe(20); // 20.4
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(205))).toBe(21); // 20.5
  });

  it('kẹp ở sàn 15′ khi chuyến sát giờ', () => {
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(100))).toBe(15);
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(10))).toBe(15);
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(150))).toBe(15);
  });

  it('kẹp ở trần 60′ khi chuyến còn xa', () => {
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(600))).toBe(60);
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(14 * 24 * 60))).toBe(60);
  });

  it('giờ nhận đã qua hoặc trùng mốc gán ⇒ sàn 15′', () => {
    expect(driverResponseWindowMinutes(assignedAt, assignedAt)).toBe(15);
    expect(driverResponseWindowMinutes(assignedAt, pickupIn(-90))).toBe(15);
  });

  it('ngày hỏng (NaN) rơi về sàn, không sinh mốc NaN', () => {
    expect(driverResponseWindowMinutes(assignedAt, new Date('invalid'))).toBe(
      DRIVER_RESPONSE_WINDOW.MIN_MINUTES,
    );
  });
});

describe('driverRespondByFor', () => {
  it('cộng cửa sổ vào mốc gán', () => {
    expect(driverRespondByFor(assignedAt, pickupIn(300)).toISOString()).toBe(
      '2026-10-22T03:30:00.000Z',
    );
    expect(driverRespondByFor(assignedAt, pickupIn(-5)).toISOString()).toBe(
      '2026-10-22T03:15:00.000Z',
    );
  });
});

describe('DRIVER_ASSIGNMENT_OUTCOME', () => {
  it('có kết cục `expired` và mọi kết cục đều có nhãn', () => {
    expect(DRIVER_ASSIGNMENT_OUTCOME_VALUES).toContain(DRIVER_ASSIGNMENT_OUTCOME.EXPIRED);
    for (const outcome of DRIVER_ASSIGNMENT_OUTCOME_VALUES) {
      expect(DRIVER_ASSIGNMENT_OUTCOME_META[outcome].label).toBeTruthy();
    }
  });
});

describe('isDriverMissingAlertDue (ADR 0067)', () => {
  const now = new Date('2026-10-22T03:00:00.000Z');
  const pickupAfter = (minutes: number) => new Date(now.getTime() + minutes * MIN);

  it('chưa có ai phủ và còn ≤ 120′ tới giờ nhận ⇒ cảnh báo', () => {
    expect(isDriverMissingAlertDue({ pickupAt: pickupAfter(120), hasDriver: false }, now)).toBe(
      true,
    );
    expect(isDriverMissingAlertDue({ pickupAt: pickupAfter(1), hasDriver: false }, now)).toBe(true);
    expect(
      isDriverMissingAlertDue({ pickupAt: pickupAfter(30).toISOString(), hasDriver: false }, now),
    ).toBe(true);
  });

  it('đã có tài xế (liên kết hay ngoài hệ thống) ⇒ không cảnh báo', () => {
    expect(isDriverMissingAlertDue({ pickupAt: pickupAfter(30), hasDriver: true }, now)).toBe(
      false,
    );
  });

  it('còn xa hơn mốc, hay giờ nhận đã qua, hay ngày hỏng ⇒ không cảnh báo', () => {
    expect(
      isDriverMissingAlertDue(
        { pickupAt: pickupAfter(DRIVER_MISSING_ALERT_LEAD_MINUTES + 1), hasDriver: false },
        now,
      ),
    ).toBe(false);
    expect(isDriverMissingAlertDue({ pickupAt: pickupAfter(0), hasDriver: false }, now)).toBe(
      false,
    );
    expect(isDriverMissingAlertDue({ pickupAt: pickupAfter(-10), hasDriver: false }, now)).toBe(
      false,
    );
    expect(isDriverMissingAlertDue({ pickupAt: 'not-a-date', hasDriver: false }, now)).toBe(false);
  });
});
