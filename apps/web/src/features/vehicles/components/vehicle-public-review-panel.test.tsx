import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE, PERMISSION, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';

import type { VehicleDetail } from '../types';
import { VehiclePublicReviewPanel } from './VehiclePublicReviewPanel';

/**
 * GỬI XE DUYỆT — lỗi CỔNG HỒ SƠ GIAN HÀNG phải có lối đi tiếp (ADR 0040).
 *
 * Điều bộ này khoá: khi backend từ chối vì hồ sơ gian hàng chưa đủ, câu trả lời KHÔNG được là một
 * toast biến mất sau vài giây. Nó cần một cái LINK — và một toast không chứa được link, nên người
 * dùng sẽ đọc một câu về logo mà không có đường nào tới ô logo.
 *
 * Mọi lỗi KHÁC vẫn là toast: chúng không có lối đi tiếp nào ngoài "thử lại".
 */
const submit = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
vi.mock('../hooks/use-vehicle-mutations', () => ({
  useSubmitVehiclePublic: () => submit,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const messages = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    App: Object.assign(actual.App, { useApp: () => ({ message: messages }) }),
  };
});

/**
 * Xe ĐỦ điều kiện theo `publishChecklist` — nếu không thì nút "Gửi duyệt" mờ và không cú bấm nào
 * tới được `onError`. Bộ trường ở đây khớp `PUBLISH_REQUIREMENT` của `@xeprime/types`: bốn ảnh
 * KHÁC NHAU (ảnh đại diện tính là một), danh tính xe, thông số năng lượng, và TỈNH của chi nhánh.
 */
function makeVehicle(): VehicleDetail {
  return {
    id: '01HVEH0000000000000000000',
    code: 'V-000001',
    name: 'Toyota Vios',
    vehicleType: 'car',
    plateNumber: '51K-123.45',
    publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
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
  } as unknown as VehicleDetail;
}

function renderPanel() {
  return render(
    <App>
      <VehiclePublicReviewPanel vehicle={makeVehicle()} />
    </App>,
  );
}

/** Ép mutation trả về đúng lỗi cần kiểm, đi qua chính `onError` mà component truyền vào. */
function failWith(error: unknown): void {
  submit.mutate.mockImplementation((_body: unknown, opts: { onError?: (e: unknown) => void }) =>
    opts.onError?.(error),
  );
}

beforeEach(() => {
  perms.granted = new Set<string>([PERMISSION.VEHICLE_SUBMIT_PUBLIC]);
  submit.mutate.mockReset();
  messages.error.mockReset();
  messages.success.mockReset();
});

afterEach(cleanup);

describe('VehiclePublicReviewPanel — cổng hồ sơ gian hàng', () => {
  it('chỉ thiếu logo: dựng DẢI có link về trang Cửa hàng, KHÔNG dùng toast', async () => {
    failWith(
      new ApiClientError({
        code: API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING,
        message: 'Hồ sơ gian hàng còn thiếu thông tin bắt buộc nên chưa gửi xe duyệt được.',
        status: 409,
        details: { missing: ['logo'] },
      }),
    );
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Gửi duyệt/ }));

    await waitFor(() =>
      expect(screen.getByText('Gian hàng cần có logo trước khi gửi xe duyệt.')).toBeTruthy(),
    );
    expect(screen.getByRole('link', { name: /Tải logo/ }).getAttribute('href')).toBe(
      '/manage/shop?section=profile',
    );
    // Lỗi có lối đi tiếp thì KHÔNG đẩy thêm một toast — hai thông báo cho một chuyện là nhiễu.
    expect(messages.error).not.toHaveBeenCalled();
  });

  it('lỗi KHÁC: vẫn là toast, không dựng dải', async () => {
    failWith(
      new ApiClientError({
        code: API_ERROR_CODE.VEHICLE_PUBLISH_INCOMPLETE,
        message: 'Xe còn thiếu thông tin bắt buộc.',
        status: 400,
        details: { missing: ['images'] },
      }),
    );
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Gửi duyệt/ }));

    await waitFor(() => expect(messages.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Gian hàng cần có logo trước khi gửi xe duyệt.')).toBeNull();
  });

  /**
   * Dải phải TỰ DỌN khi lượt gửi kế tiếp đi qua được — nếu không, một câu về logo còn đứng đó sau
   * khi logo đã có, và người dùng sẽ không tin thông báo nào trên màn hình này nữa.
   */
  it('gửi lại thành công: dải biến mất', async () => {
    failWith(
      new ApiClientError({
        code: API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING,
        message: 'thiếu logo',
        status: 409,
        details: { missing: ['logo'] },
      }),
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Gửi duyệt/ }));
    await waitFor(() =>
      expect(screen.getByText('Gian hàng cần có logo trước khi gửi xe duyệt.')).toBeTruthy(),
    );

    submit.mutate.mockImplementation((_body: unknown, opts: { onSuccess?: () => void }) =>
      opts.onSuccess?.(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Gửi duyệt/ }));

    await waitFor(() =>
      expect(screen.queryByText('Gian hàng cần có logo trước khi gửi xe duyệt.')).toBeNull(),
    );
    expect(messages.success).toHaveBeenCalledTimes(1);
  });
});
