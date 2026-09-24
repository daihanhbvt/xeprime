import { describe, expect, it } from 'vitest';
import type { HostMetrics as HostMetricsShape } from '@xeprime/types';
import { shopHighlightOf } from './shop-highlight';

const READY_GREAT: HostMetricsShape = {
  sampleCount: 10,
  responseRatePercent: 95,
  acceptKeepRatePercent: 92,
  responseMinutesMedian: 8,
  instantBook: false,
};

const READY_WEAK: HostMetricsShape = {
  sampleCount: 10,
  responseRatePercent: 60,
  acceptKeepRatePercent: 40,
  responseMinutesMedian: 30,
  instantBook: false,
};

/** Dưới ngưỡng đủ mẫu: mọi tỉ lệ đều là `null`, không được đọc như 0%. */
const NOT_ENOUGH: HostMetricsShape = {
  sampleCount: 2,
  responseRatePercent: null,
  acceptKeepRatePercent: null,
  responseMinutesMedian: null,
  instantBook: false,
};

describe('shopHighlightOf', () => {
  it('luôn trả về một câu — không bao giờ để trống chỗ ghi chú', () => {
    const highlight = shopHighlightOf({ metrics: null, ratingAvg: null });
    expect(highlight.key).toBe('newHost');
  });

  it('đánh giá cao + hai tỉ lệ cao → câu mạnh nhất', () => {
    const highlight = shopHighlightOf({
      metrics: READY_GREAT,
      ratingAvg: 4.9,
      ratingCount: 120,
      completedTripCount: 300,
    });
    expect(highlight).toEqual({ key: 'topRated', rating: 4.9, count: 120 });
  });

  it('hai tỉ lệ cao nhưng chưa đủ lượt đánh giá → chỉ khen phần vận hành', () => {
    const highlight = shopHighlightOf({
      metrics: READY_GREAT,
      ratingAvg: 5,
      ratingCount: 2,
      completedTripCount: 8,
    });
    expect(highlight.key).toBe('reliable');
    expect(highlight.rating).toBeNull();
  });

  it('tỉ lệ thấp nhưng đánh giá tốt → chỉ nói về điểm đánh giá', () => {
    const highlight = shopHighlightOf({
      metrics: READY_WEAK,
      ratingAvg: 4.56,
      ratingCount: 9,
      completedTripCount: 13,
    });
    expect(highlight).toEqual({ key: 'wellRated', rating: 4.56, count: 9 });
  });

  it('chưa đủ mẫu thì KHÔNG đọc tỉ lệ — rơi xuống câu theo số chuyến', () => {
    const highlight = shopHighlightOf({
      metrics: NOT_ENOUGH,
      ratingAvg: 4.67,
      ratingCount: 3,
      completedTripCount: 4,
    });
    expect(highlight).toEqual({ key: 'experienced', rating: null, count: 4 });
  });

  it('"Đặt ngay" là CÀI ĐẶT, nói được ngay cả khi chưa có số liệu vận hành', () => {
    const highlight = shopHighlightOf({
      metrics: { ...NOT_ENOUGH, instantBook: true },
      ratingAvg: null,
      ratingCount: 0,
      completedTripCount: 6,
    });
    expect(highlight.key).toBe('instantBook');
  });

  it('một lượt 5 sao KHÔNG đủ để khen điểm đánh giá', () => {
    const highlight = shopHighlightOf({
      metrics: null,
      ratingAvg: 5,
      ratingCount: 1,
      completedTripCount: 0,
    });
    expect(highlight.key).toBe('newHost');
  });
});
