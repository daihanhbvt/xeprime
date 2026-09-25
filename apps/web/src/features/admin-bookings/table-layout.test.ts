import { describe, expect, it } from 'vitest';

import {
  ADMIN_BOOKING_COLUMN as C,
  PANEL_COLUMN_WIDTH,
  panelColumnKeys,
  panelColumnsAfterDrop,
  panelDropCount,
  panelTableMinWidth,
} from './table-layout';

const ALL_FIVE = [C.CODE, C.CUSTOMER, C.TENANT, C.PERIOD, C.STATUS];
const sum = (keys: readonly (keyof typeof PANEL_COLUMN_WIDTH)[]) =>
  keys.reduce((total, key) => total + PANEL_COLUMN_WIDTH[key], 0);

describe('panelColumnKeys', () => {
  it('chưa đo được bề rộng ⇒ đủ năm cột ưu tiên', () => {
    expect([...panelColumnKeys(null)]).toEqual(ALL_FIVE);
  });

  it('đủ chỗ ⇒ đủ năm cột', () => {
    expect([...panelColumnKeys(sum(ALL_FIVE))]).toEqual(ALL_FIVE);
  });

  it('hết chỗ thì bỏ "Gian hàng · xe" trước tiên', () => {
    const keys = panelColumnKeys(sum(ALL_FIVE) - 1);
    expect(keys.has(C.TENANT)).toBe(false);
    expect([...keys]).toEqual([C.CODE, C.CUSTOMER, C.PERIOD, C.STATUS]);
  });

  it('hẹp nữa thì bỏ tiếp thời gian thuê, rồi tới khách', () => {
    expect([...panelColumnKeys(sum([C.CODE, C.CUSTOMER, C.STATUS]))]).toEqual([
      C.CODE,
      C.CUSTOMER,
      C.STATUS,
    ]);
    expect([...panelColumnKeys(sum([C.CODE, C.CUSTOMER, C.STATUS]) - 1)]).toEqual([
      C.CODE,
      C.STATUS,
    ]);
  });

  it('mã đơn và trạng thái KHÔNG bao giờ bị ẩn, kể cả khi quá hẹp', () => {
    expect([...panelColumnKeys(0)]).toEqual([C.CODE, C.STATUS]);
  });

  it('sàn bề rộng bảng bằng tổng các cột còn hiện — không ép cuộn ngang thừa', () => {
    const keys = panelColumnKeys(500);
    expect(panelTableMinWidth(keys)).toBe(sum([...keys]));
    expect(panelTableMinWidth(keys)).toBeLessThanOrEqual(500);
  });
});

describe('panelDropCount', () => {
  it('là số nguyên nhỏ (0–3) — thứ bảng lưu làm state, chỉ đổi khi phải ẩn/hiện cột', () => {
    expect(panelDropCount(null)).toBe(0);
    expect(panelDropCount(sum(ALL_FIVE))).toBe(0);
    expect(panelDropCount(sum(ALL_FIVE) - 1)).toBe(1);
    expect(panelDropCount(0)).toBe(3);
  });

  it('panelColumnsAfterDrop bỏ đúng theo thứ tự hy sinh, giữ thứ tự cột của bảng', () => {
    expect([...panelColumnsAfterDrop(0)]).toEqual(ALL_FIVE);
    expect([...panelColumnsAfterDrop(1)]).toEqual([C.CODE, C.CUSTOMER, C.PERIOD, C.STATUS]);
    expect([...panelColumnsAfterDrop(2)]).toEqual([C.CODE, C.CUSTOMER, C.STATUS]);
    expect([...panelColumnsAfterDrop(3)]).toEqual([C.CODE, C.STATUS]);
  });
});
