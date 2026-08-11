import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSION, type Permission } from '@xeprime/types';
import type { ShopRentalPolicy } from '@/features/rental-policies/types';

import ShopPoliciesPage from './page';

/**
 * Đặc tả trang Chính sách thuê mặc định (Wave 2 — Figma `237:1557`).
 *
 * Khoá các hợp đồng: gate quyền, chip phạm vi áp dụng lấy số từ API, trạng thái null-policy,
 * thanh "thay đổi chưa lưu", validation chéo đúng CÂU CHỮ server ("khoảng trống cấu hình"),
 * và bước xác nhận nhạy cảm trước khi lưu (payload đã hoá chuỗi tiền — ADR 0007).
 */
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const query = vi.hoisted(() => ({
  data: undefined as ShopRentalPolicy | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const save = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/features/rental-policies/hooks/use-shop-policy', () => ({
  useShopPolicy: () => query,
  useSaveShopPolicy: () => save,
}));

function policyFixture(over: Partial<ShopRentalPolicy> = {}): ShopRentalPolicy {
  return {
    policy: {
      depositAmount: '5000000',
      deliveryEnabled: true,
      deliveryMaxRadiusKm: 10,
      deliveryTiers: [
        { toKm: 3, fee: '0' },
        { toKm: 5, fee: '30000' },
        { toKm: 10, fee: '50000' },
      ],
      overtimeFeePerHour: '100000',
      overtimeGraceMinutes: null,
      overtimeRoundingMinutes: null,
      discountEnabled: true,
      discountTiers: [{ minDays: 7, percent: 5, note: 'Ưu đãi tuần' }],
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    inheritingVehicles: 12,
    overriddenVehicles: 3,
    ...over,
  };
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

function renderPage() {
  return render(
    <App>
      <ShopPoliciesPage />
    </App>,
  );
}

beforeEach(() => {
  query.data = policyFixture();
  query.isLoading = false;
  query.isError = false;
  query.refetch.mockReset();
  save.mutate.mockReset();
  save.isPending = false;
  grant(PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE);
});

afterEach(cleanup);

describe('/manage/shop/policies — quyền và trạng thái tải', () => {
  it('thiếu tenant.view: thay TOÀN BỘ trang bằng khối quyền', () => {
    grant();
    renderPage();
    expect(screen.getByText('Không có quyền truy cập')).toBeTruthy();
    expect(screen.queryByText('Chính sách thuê mặc định')).toBeNull();
  });

  it('lỗi tải: có nút thử lại gọi refetch', () => {
    query.data = undefined;
    query.isError = true;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('/manage/shop/policies — dữ liệu và null-policy', () => {
  it('chip phạm vi lấy số từ API: 12 kế thừa / 3 ghi đè', () => {
    renderPage();
    expect(screen.getByText('12 xe đang kế thừa')).toBeTruthy();
    expect(screen.getByText('3 xe đã ghi đè')).toBeTruthy();
    expect(screen.getByText('12 xe đang dùng mức cọc này')).toBeTruthy();
  });

  it('hiển thị đủ 4 khối chính sách với giá trị từ API', () => {
    renderPage();
    expect((screen.getByLabelText('Số tiền cọc mặc định') as HTMLInputElement).value).toBe(
      '5.000.000',
    );
    expect(screen.getByText('Không có khoảng trống hoặc chồng lấn')).toBeTruthy();
    expect(
      screen.getByText(
        '0–3 km: Miễn phí · >3–5 km: 30.000đ · >5–10 km: 50.000đ · >10 km: Báo giá thủ công theo thỏa thuận',
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText('Phí mỗi giờ phát sinh') as HTMLInputElement).value).toBe(
      '100.000',
    );
    // Hai ô quá giờ chưa cấu hình — placeholder đúng thiết kế, không bịa số 0.
    expect(screen.getByLabelText('Thời gian trễ miễn phí tối đa').getAttribute('placeholder')).toBe(
      'Cần cấu hình',
    );
  });

  it('chưa có chính sách (null-policy): thông báo + form trống, không bịa mặc định', () => {
    query.data = policyFixture({ policy: null, inheritingVehicles: 0, overriddenVehicles: 0 });
    renderPage();
    expect(screen.getByText('Gian hàng chưa cấu hình chính sách thuê')).toBeTruthy();
    expect((screen.getByLabelText('Số tiền cọc mặc định') as HTMLInputElement).value).toBe('');
  });
});

describe('/manage/shop/policies — sửa, validate, xác nhận lưu', () => {
  it('sửa một giá trị → thanh "thay đổi chưa lưu" hiện, Hủy bỏ thì biến mất', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Số tiền cọc mặc định'), {
      target: { value: '4000000' },
    });
    expect(await screen.findByText('Bạn có các thay đổi chưa được áp dụng')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hủy bỏ' }));
    await waitFor(() =>
      expect(screen.queryByText('Bạn có các thay đổi chưa được áp dụng')).toBeNull(),
    );
  });

  it('bán kính lệch mốc cuối → đúng câu chữ server "khoảng trống cấu hình", KHÔNG gửi API', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Bán kính hỗ trợ tối đa tự giao'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));

    expect(
      await screen.findByText(/Có khoảng trống cấu hình giữa mốc 10 km và 12 km/),
    ).toBeTruthy();
    expect(save.mutate).not.toHaveBeenCalled();
  });

  it('lưu hợp lệ: xác nhận nêu phạm vi 12 xe kế thừa + cam kết đơn cũ giữ nguyên → gửi payload chuỗi tiền', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Số tiền cọc mặc định'), {
      target: { value: '4000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));

    // AntD render modal kèm bản sao motion → luôn dùng findAll/getAll khi soi nội dung modal.
    expect(
      (await screen.findAllByText('Xác nhận thay đổi chính sách thuê?')).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/12 xe đang kế thừa/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/vẫn giữ nguyên mức giá và tiền cọc cũ/).length).toBeGreaterThan(0);

    const okButtons = screen.getAllByRole('button', { name: 'Xác nhận thay đổi' });
    fireEvent.click(okButtons[okButtons.length - 1]!);
    await waitFor(() => expect(save.mutate).toHaveBeenCalledTimes(1));

    const body = save.mutate.mock.calls[0]![0] as {
      depositAmount: string;
      deliveryTiers: unknown[];
    };
    // ADR 0007: tiền rời form là CHUỖI, tiers giữ nguyên cấu trúc.
    expect(body.depositAmount).toBe('4000000');
    expect(body.deliveryTiers).toEqual([
      { toKm: 3, fee: '0' },
      { toKm: 5, fee: '30000' },
      { toKm: 10, fee: '50000' },
    ]);
  });

  it('thiếu tenant.update: xem được nhưng nút Lưu bị khoá', () => {
    grant(PERMISSION.TENANT_VIEW);
    renderPage();
    expect(
      (screen.getByRole('button', { name: 'Lưu chính sách' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
