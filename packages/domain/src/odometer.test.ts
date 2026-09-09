import { describe, expect, it } from 'vitest';
import { maintenanceCyclePercent, remainingKm } from './odometer';

describe('remainingKm', () => {
  it('thiếu số thì là `unknown`, KHÔNG phải 0 km', () => {
    expect(remainingKm(null)).toEqual({ kind: 'unknown', km: null });
    expect(remainingKm(undefined)).toEqual({ kind: 'unknown', km: null });
  });

  it('đúng mốc (0) đã là quá hạn', () => {
    expect(remainingKm(0)).toEqual({ kind: 'overdue', km: 0 });
  });

  it('vượt mốc trả TRỊ TUYỆT ĐỐI — chữ "quá hạn" mới là chỗ mang dấu', () => {
    expect(remainingKm(-320)).toEqual({ kind: 'overdue', km: 320 });
  });

  it('chưa tới mốc thì trả đúng quãng còn lại', () => {
    expect(remainingKm(1500)).toEqual({ kind: 'remaining', km: 1500 });
  });
});

describe('maintenanceCyclePercent', () => {
  it('đi nửa chu kỳ ra 50%', () => {
    expect(maintenanceCyclePercent(5000, 2500)).toBe(50);
  });

  it('vừa bảo dưỡng xong (còn nguyên chu kỳ) ra 0%', () => {
    expect(maintenanceCyclePercent(5000, 5000)).toBe(0);
  });

  it('quá hạn KẸP ở 100 thay vì tô tràn khung', () => {
    expect(maintenanceCyclePercent(5000, -2000)).toBe(100);
  });

  it('thiếu chu kỳ hoặc thiếu KM còn lại thì không có thanh để vẽ', () => {
    expect(maintenanceCyclePercent(null, 2500)).toBeNull();
    expect(maintenanceCyclePercent(5000, null)).toBeNull();
    expect(maintenanceCyclePercent(undefined, undefined)).toBeNull();
  });

  it('chu kỳ 0 là dữ liệu hỏng, không phải phép chia cho 0', () => {
    expect(maintenanceCyclePercent(0, 100)).toBeNull();
  });
});
