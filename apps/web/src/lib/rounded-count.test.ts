import { describe, expect, it } from 'vitest';
import { roundedCount } from './rounded-count';

describe('roundedCount', () => {
  it('dưới ngưỡng 100: giữ nguyên, không có dấu +', () => {
    expect(roundedCount(0)).toEqual({ display: 0, approximate: false });
    expect(roundedCount(47)).toEqual({ display: 47, approximate: false });
    expect(roundedCount(99)).toEqual({ display: 99, approximate: false });
  });

  it('làm tròn XUỐNG theo độ lớn, không bao giờ hứa nhiều hơn số thật', () => {
    expect(roundedCount(1234)).toEqual({ display: 1200, approximate: true });
    expect(roundedCount(999)).toEqual({ display: 990, approximate: true });
    expect(roundedCount(12345)).toEqual({ display: 12000, approximate: true });
  });

  it('số tròn chẵn đúng bậc thì không cần dấu + — đó là con số thật, không phải ước lượng', () => {
    expect(roundedCount(1000)).toEqual({ display: 1000, approximate: false });
    expect(roundedCount(100)).toEqual({ display: 100, approximate: false });
  });
});
