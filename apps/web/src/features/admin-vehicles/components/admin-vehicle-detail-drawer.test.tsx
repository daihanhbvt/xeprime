import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MARKETPLACE_VISIBILITY_REASON,
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
} from '@xeprime/types';

import type { AdminVehicleDetail } from '../types';
import { AdminVehicleDetailDrawer } from './AdminVehicleDetailDrawer';

/**
 * Drawer kiểm duyệt xe — phần GIẢI THÍCH của ADR 0048 điều 4.
 *
 * `unhide` chỉ gỡ trạng thái ẩn của NỀN TẢNG; nó không (và không được) bật hộ công tắc của chủ
 * xe. Nếu màn hình không nói ra điều đó thì người kiểm duyệt bấm gỡ ẩn, thấy xe vẫn không lên
 * chợ, và kết luận hệ thống hỏng. Bộ này khoá đúng ba thứ ngăn kết luận đó: hai dòng trạng thái
 * mới, lý do hiệu lực khi đang ẩn, và câu xác nhận/toast nói thẳng hệ quả.
 */
const detail = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const moderation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-admin-vehicles', () => ({
  useAdminVehicle: () => detail,
  useVehicleModeration: () => moderation,
}));

vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);

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

function makeVehicle(over: Partial<AdminVehicleDetail> = {}): AdminVehicleDetail {
  return {
    id: 'v1',
    code: 'XM-001',
    name: 'Honda SH 150i',
    plateNumber: '59X1-333.44',
    vehicleType: 'motorbike',
    serviceTypes: ['self_drive'],
    operationStatus: 'available',
    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    listingStatus: 'active',
    marketplaceEnabled: true,
    isMarketplaceVisible: true,
    marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.VISIBLE,
    weekdayPrice: '350000',
    weekendPrice: '400000',
    hourlyPrice: null,
    tenantId: 't1',
    tenantSlug: 'demo',
    tenantName: 'Gian hàng Demo',
    tenantStatus: 'active',
    ownerName: 'Chị Lan',
    provinceName: 'TP. Hồ Chí Minh',
    bookingCount: 3,
    reviewCount: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as unknown as AdminVehicleDetail;
}

function renderDrawer(over: Partial<AdminVehicleDetail> = {}) {
  detail.data = makeVehicle(over);
  return render(
    <App>
      <AdminVehicleDetailDrawer vehicleId="v1" onClose={vi.fn()} />
    </App>,
  );
}

/**
 * Ô GIÁ TRỊ của một dòng trong bảng thuộc tính, tra theo nhãn của dòng.
 *
 * `Descriptions` ở chế độ `bordered` + `column={1}` dựng mỗi mục thành một `<tr>` gồm một ô
 * nhãn và một ô giá trị — nên tra ngược từ nhãn lên `<tr>` rồi lấy ô còn lại là cách duy nhất
 * không phụ thuộc vào tên class nội bộ của AntD.
 */
function row(label: string): HTMLElement {
  const tr = screen.getByText(label).closest('tr');
  if (!tr) throw new Error(`không tìm thấy dòng "${label}"`);
  const value = tr.querySelector('td');
  if (!value) throw new Error(`dòng "${label}" không có ô giá trị`);
  return value as HTMLElement;
}

beforeEach(() => {
  perms.granted = new Set<string>([PERMISSION.PLATFORM_VEHICLE_MODERATE]);
  moderation.mutate.mockReset();
  moderation.isPending = false;
  messages.error.mockReset();
  messages.success.mockReset();
});

afterEach(cleanup);

describe('AdminVehicleDetailDrawer — hai trục hiển thị (ADR 0048)', () => {
  it('xe đang bán: chủ xe Bật, kết quả Đang hiển thị, có link ra trang xe', () => {
    renderDrawer();

    expect(within(row('Chủ xe cho hiển thị')).getByText('Bật')).toBeTruthy();
    expect(within(row('Kết quả trên chợ')).getByText('Đang hiển thị')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem trang xe' })).toBeTruthy();
  });

  it('chủ xe tắt công tắc: nói rõ Tắt và kèm LÝ DO hiệu lực', () => {
    renderDrawer({
      marketplaceEnabled: false,
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED,
      listingStatus: 'hidden',
    });

    expect(within(row('Chủ xe cho hiển thị')).getByText('Tắt')).toBeTruthy();
    const effective = row('Kết quả trên chợ');
    expect(within(effective).getByText('Đang ẩn')).toBeTruthy();
    expect(within(effective).getByText('Chủ xe tạm ẩn')).toBeTruthy();
  });

  it('gian hàng bị khoá: lý do nói về GIAN HÀNG, không đổ cho chiếc xe', () => {
    renderDrawer({
      tenantStatus: 'suspended',
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.SHOP_INACTIVE,
    });

    expect(within(row('Kết quả trên chợ')).getByText('Gian hàng ngừng hoạt động')).toBeTruthy();
  });

  it('lựa chọn của chủ xe là CHỈ ĐỌC — không có công tắc nào cho admin', () => {
    renderDrawer();

    expect(screen.queryByRole('switch')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Vì sao nền tảng không đổi được mục này/ }),
    ).toBeTruthy();
  });
});

describe('AdminVehicleDetailDrawer — gỡ ẩn của nền tảng', () => {
  const platformHidden = {
    publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN,
    listingStatus: 'hidden',
    isMarketplaceVisible: false,
    marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.PLATFORM_HIDDEN,
  } as Partial<AdminVehicleDetail>;

  it('nút đổi tên thành "Gỡ ẩn của nền tảng"', () => {
    renderDrawer(platformHidden);

    expect(screen.getByRole('button', { name: /Gỡ ẩn của nền tảng/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Bỏ ẩn xe$/ })).toBeNull();
  });

  it('chủ xe đang BẬT: xác nhận hứa xe lên lại chợ, toast nói vậy', async () => {
    moderation.mutate.mockImplementation((_a: unknown, opts: { onSuccess?: () => void }) =>
      opts.onSuccess?.(),
    );
    renderDrawer({ ...platformHidden, marketplaceEnabled: true });

    fireEvent.click(screen.getByRole('button', { name: /Gỡ ẩn của nền tảng/ }));
    expect(await screen.findByText(/Xe hiển thị lại trên Marketplace ngay/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ẩn' }));
    await waitFor(() => expect(messages.success).toHaveBeenCalledTimes(1));
    expect(messages.success.mock.calls[0]?.[0]).toBe(
      'Đã gỡ ẩn của nền tảng. Xe hiển thị lại trên Marketplace.',
    );
  });

  /** Ca sinh ra toàn bộ đợt sửa này: gỡ ẩn xong mà xe vẫn không lên chợ. */
  it('chủ xe đang TẮT: xác nhận và toast đều nói rõ xe vẫn tạm ẩn theo lựa chọn của chủ xe', async () => {
    moderation.mutate.mockImplementation((_a: unknown, opts: { onSuccess?: () => void }) =>
      opts.onSuccess?.(),
    );
    renderDrawer({ ...platformHidden, marketplaceEnabled: false });

    fireEvent.click(screen.getByRole('button', { name: /Gỡ ẩn của nền tảng/ }));
    expect(
      await screen.findByText(/Chủ xe đang tắt hiển thị, nên xe vẫn chưa lên chợ sau khi gỡ ẩn/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ẩn' }));
    await waitFor(() => expect(messages.success).toHaveBeenCalledTimes(1));
    expect(messages.success.mock.calls[0]?.[0]).toBe(
      'Đã gỡ ẩn của nền tảng. Xe vẫn đang tạm ẩn theo lựa chọn của chủ xe.',
    );
  });

  it('thiếu quyền kiểm duyệt: không vẽ nút nào', () => {
    perms.granted = new Set<string>();
    renderDrawer(platformHidden);

    expect(screen.queryByRole('button', { name: /Gỡ ẩn/ })).toBeNull();
    expect(screen.getByText('Bạn không có quyền kiểm duyệt xe.')).toBeTruthy();
  });
});
