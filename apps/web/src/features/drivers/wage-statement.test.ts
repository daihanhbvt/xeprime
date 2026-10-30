import { describe, expect, it } from 'vitest';
import type { DriverAssignmentRow } from './types';
import { wageStatementCsv, type WageStatementLabels } from './wage-statement';

const LABELS: WageStatementLabels = {
  headers: {
    booking: 'Đơn',
    vehicle: 'Xe',
    plate: 'Biển số',
    pickupAt: 'Bắt đầu',
    returnAt: 'Kết thúc',
    days: 'Số ngày',
    outcome: 'Kết quả',
    wage: 'Tiền công (VND)',
  },
  total: 'Tổng',
  outcome: (o) => (o === 'completed' ? 'Hoàn thành' : 'Đã huỷ'),
  dateTime: (iso) => iso.slice(0, 10),
};

function row(over: Partial<DriverAssignmentRow>): DriverAssignmentRow {
  return {
    id: 'a1',
    bookingId: 'b1',
    bookingCode: 'DH1',
    pickupAt: '2026-10-01T02:00:00.000Z',
    returnAt: '2026-10-03T02:00:00.000Z',
    outcome: 'completed',
    endedAt: '2026-10-03T02:00:00.000Z',
    stage: 'completed',
    wageAmount: '1000000',
    wageDays: 2,
    vehiclePlate: '51K-123.45',
    vehicleName: 'Innova',
    ...over,
  };
}

describe('wageStatementCsv', () => {
  it('BOM, dòng tiêu đề, số tiền thô và dòng tổng', () => {
    const csv = wageStatementCsv(
      [row({}), row({ id: 'a2', bookingCode: 'DH2', outcome: 'cancelled', wageAmount: '200000' })],
      LABELS,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Đơn,Xe,Biển số,Bắt đầu,Kết thúc,Số ngày,Kết quả,Tiền công (VND)');
    expect(lines[1]).toBe('DH1,Innova,51K-123.45,2026-10-01,2026-10-03,2,Hoàn thành,1000000');
    expect(lines[2]).toContain('Đã huỷ,200000');
    expect(lines[3]).toBe('Tổng,,,,,,,1200000');
  });

  it('bọc ô có dấu phẩy/ngoặc kép; lượt chưa có số để trống và không vào tổng', () => {
    const csv = wageStatementCsv(
      [row({ vehicleName: 'Xe "VIP", 7 chỗ', vehiclePlate: null, wageAmount: null, wageDays: null })],
      LABELS,
    );
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[1]).toBe('DH1,"Xe ""VIP"", 7 chỗ",,2026-10-01,2026-10-03,,Hoàn thành,');
    expect(lines[2]).toBe('Tổng,,,,,,,0');
  });

  it('tháng không có chuyến: chỉ tiêu đề và tổng 0', () => {
    const lines = wageStatementCsv([], LABELS).slice(1).trimEnd().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('Tổng,,,,,,,0');
  });
});
