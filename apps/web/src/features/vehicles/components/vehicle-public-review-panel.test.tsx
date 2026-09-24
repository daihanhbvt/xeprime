import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VEHICLE_PUBLIC_STATUS } from '@xeprime/types';

import type { VehicleDetail } from '../types';
import { VehiclePublicReviewPanel } from './VehiclePublicReviewPanel';

/**
 * Thẻ xét duyệt phía dưới — sau bố cục 23/09/2026 nó là thẻ **TRA CỨU**, không phải nơi hành động.
 *
 * Nút gửi duyệt đã dời lên thẻ "Việc cần làm" (`VehiclePublicationTaskItem`) và công tắc hiển
 * thị lên cột thao tác đầu trang (`MarketplaceVisibilitySwitch`). Bộ này khoá lại rằng chúng
 * KHÔNG quay về đây — hai CTA cho cùng một việc là hai chỗ để lệch nhau — và rằng phần còn lại
 * (checklist + mốc thời gian) vẫn đầy đủ.
 *
 * Lỗi cổng hồ sơ gian hàng (ADR 0040) đi theo nút gửi duyệt; nó được kiểm ở
 * `vehicle-publication-task.test.tsx`.
 */
function makeVehicle(over: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: '01HVEH0000000000000000000',
    code: 'V-000001',
    name: 'Toyota Vios',
    vehicleType: 'car',
    plateNumber: '51K-123.45',
    publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
    marketplaceEnabled: true,
    isMarketplaceVisible: false,
    marketplaceVisibilityReason: 'not_approved',
    mainImageUrl: 'https://img.example/main.jpg',
    images: ['https://img.example/1.jpg', 'https://img.example/2.jpg', 'https://img.example/3.jpg'],
    serviceTypes: ['self_drive'],
    weekdayPrice: '600000',
    brand: 'toyota',
    model: 'Vios',
    manufactureYear: 2022,
    seatCount: 5,
    fuelType: 'gasoline',
    transmission: 'automatic',
    fuelConsumptionCombined: 7.5,
    branch: { id: 'B1', code: 'CN01', name: 'Chi nhánh', provinceCode: '79' },
    latestPublicReview: null,
    ...over,
  } as unknown as VehicleDetail;
}

const renderPanel = (over: Partial<VehicleDetail> = {}) =>
  render(<VehiclePublicReviewPanel vehicle={makeVehicle(over)} />);

afterEach(cleanup);

describe('VehiclePublicReviewPanel — thẻ tra cứu', () => {
  it('chưa duyệt: tiêu đề "Tiến trình xét duyệt", checklist mở sẵn', () => {
    renderPanel();

    expect(screen.getByText('Tiến trình xét duyệt')).toBeTruthy();
    expect(screen.getAllByText('Đã có')).toHaveLength(7);
  });

  it('KHÔNG có nút gửi duyệt và KHÔNG có công tắc hiển thị', () => {
    renderPanel();

    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('thiếu điều kiện: đánh dấu đúng mục chưa đạt', () => {
    renderPanel({ weekdayPrice: null });

    expect(screen.getAllByText('Chưa có')).toHaveLength(1);
    expect(screen.getByText('Giá tự lái (ngày thường)')).toBeTruthy();
  });

  it('có phiếu duyệt: kể mốc gửi và mốc duyệt', () => {
    renderPanel({
      publicStatus: VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
      latestPublicReview: {
        status: 'needs_revision',
        reason: 'Ảnh mờ.',
        submittedAt: '2026-09-20T02:00:00.000Z',
        reviewedAt: '2026-09-21T02:00:00.000Z',
      },
    } as Partial<VehicleDetail>);

    expect(screen.getByText('Đã gửi')).toBeTruthy();
    expect(screen.getByText('Đã duyệt')).toBeTruthy();
  });

  it('chưa từng gửi: không dựng khối mốc thời gian rỗng', () => {
    renderPanel();
    expect(screen.queryByText('Đã gửi')).toBeNull();
  });
});

describe('VehiclePublicReviewPanel — xe đã duyệt', () => {
  it('đổi tên thành "Thông tin xét duyệt" và thu gọn sẵn', () => {
    renderPanel({
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      isMarketplaceVisible: true,
    });

    expect(screen.getByText('Thông tin xét duyệt')).toBeTruthy();
    // Thu gọn: checklist chưa dựng ra cho tới khi người dùng mở.
    expect(screen.queryByText('Ảnh đại diện')).toBeNull();
  });

  it('mở ra thì có đủ checklist — và cái mở được bằng bàn phím', () => {
    renderPanel({
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      isMarketplaceVisible: true,
    });

    const header = screen.getByRole('button', { name: /Thông tin xét duyệt/ });
    expect(header.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(header);
    expect(screen.getByText('Ảnh đại diện')).toBeTruthy();
  });
});
