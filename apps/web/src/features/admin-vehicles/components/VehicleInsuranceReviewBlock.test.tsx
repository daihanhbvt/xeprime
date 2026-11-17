import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSURANCE_ELIGIBILITY_GAP } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { VehicleInsuranceReview } from '../types';
import { VehicleInsuranceReviewBlock } from './VehicleInsuranceReviewBlock';

/**
 * Khối "Bảo hiểm và giấy tờ" (đợt rà Admin 16/11/2026) — chỉ đọc. Khoá: cảnh báo lệch giá trị và lệch
 * biển số hiện thành chữ; ảnh cà vẹt CHỈ xin khi người xem bấm (mỗi lần xin là một audit ở server).
 */
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function review(over: Partial<VehicleInsuranceReview> = {}): VehicleInsuranceReview {
  return {
    insuredValue: '650000000',
    referenceValue: { amount: '500000000', age: 3, residualPercent: 82 },
    deviationPercent: 30,
    deviationWarning: true,
    eligibilityGaps: [INSURANCE_ELIGIBILITY_GAP.PHOTOS_MISSING],
    registration: {
      documentId: 'D1',
      holderName: 'Nguyễn Văn A',
      chassisNumber: 'RLA1234567890ABCD',
      engineNumber: '2NR1234567',
      plateNumber: '30K-999.99',
      plateMatches: false,
      hasImage: true,
    },
    ...over,
  } as VehicleInsuranceReview;
}

function renderBlock(data: VehicleInsuranceReview, fetchImage = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  renderWithIntl(
    <QueryClientProvider client={client}>
      <App>
        <VehicleInsuranceReviewBlock review={data} fetchImage={fetchImage} />
      </App>
    </QueryClientProvider>,
  );
  return fetchImage;
}

afterEach(cleanup);

describe('VehicleInsuranceReviewBlock', () => {
  it('giá trị khai, giá tham khảo, % lệch và cảnh báo khi vượt ngưỡng', () => {
    renderBlock(review());
    expect(screen.getByText(/650\.000\.000/)).toBeTruthy();
    expect(screen.getByText(/500\.000\.000.*xe 3 năm, còn 82% giá mới/)).toBeTruthy();
    expect(screen.getByText(/\+30%/)).toBeTruthy();
    expect(screen.getByText(/lệch giá tham khảo quá 20%/)).toBeTruthy();
    expect(screen.getByText('Thiếu ảnh bắt buộc của xe')).toBeTruthy();
  });

  it('cà vẹt: số khung, số máy, cảnh báo biển số lệch', () => {
    renderBlock(review());
    expect(screen.getByText('RLA1234567890ABCD')).toBeTruthy();
    expect(screen.getByText('2NR1234567')).toBeTruthy();
    expect(screen.getByText(/khác biển số khai của xe/)).toBeTruthy();
  });

  it('đủ điều kiện, không lệch, chưa khai, chưa có cà vẹt: không cảnh báo nào, nói thẳng điều thiếu', () => {
    renderBlock(
      review({
        insuredValue: null,
        referenceValue: null,
        deviationPercent: null,
        deviationWarning: false,
        eligibilityGaps: [],
        registration: null,
      }),
    );
    expect(screen.getByText('Chưa khai')).toBeTruthy();
    expect(screen.getByText('Không có dữ liệu xe chuẩn để so')).toBeTruthy();
    expect(screen.getByText('Đủ điều kiện')).toBeTruthy();
    expect(screen.getByText('Chưa có cà vẹt')).toBeTruthy();
    expect(screen.queryByText(/lệch giá tham khảo/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Mở ảnh cà vẹt/ })).toBeNull();
  });

  it('ảnh cà vẹt chỉ xin khi bấm, rồi hiện ảnh', async () => {
    const fetchImage = vi
      .fn()
      .mockResolvedValue({ url: 'https://r2.example/ca-vet.jpg', expiresIn: 120 });
    renderBlock(review(), fetchImage);
    expect(fetchImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Mở ảnh cà vẹt/ }));
    await waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(1));
    const img = await screen.findByRole('img', { name: 'Cà vẹt' });
    expect(img.getAttribute('src')).toBe('https://r2.example/ca-vet.jpg');
  });
});
