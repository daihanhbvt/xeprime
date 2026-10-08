import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_STATUS,
  MARKETPLACE_VISIBILITY_REASON,
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
} from '@xeprime/types';

import type { AdminVehicleDetail } from '../types';
import { AdminVehicleDetailDrawer } from './AdminVehicleDetailDrawer';

/**
 * Panel chi tiết xe trên màn giám sát — phần GIẢI THÍCH của ADR 0048 điều 4 + hình dạng panel làm
 * việc (hồ sơ trái, ba trục "trên chợ" phải, quyết định ở chân).
 *
 * `unhide` chỉ gỡ trạng thái ẩn của NỀN TẢNG; nó không (và không được) bật hộ công tắc của chủ
 * xe. Nếu màn hình không nói ra điều đó thì người kiểm duyệt bấm gỡ ẩn, thấy xe vẫn không lên
 * chợ, và kết luận hệ thống hỏng. Bộ này khoá: ba trục + kết quả kèm lý do, lý do ẩn đang hiệu
 * lực, câu xác nhận/toast nói thẳng hệ quả, và lý do ẩn là bắt buộc.
 */
const detail = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const moderation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  variables: undefined as unknown,
}));

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

const support = vi.hoisted(() => ({
  props: null as null | { tenantId: string; next?: (contextId: string) => string },
}));
vi.mock('@/features/tenant-support/components/StartSupportDialog', () => ({
  StartSupportDialog: (props: { tenantId: string; next?: (contextId: string) => string }) => {
    support.props = props;
    return null;
  },
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
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
    mainImageUrl: 'https://img.test/main.jpg',
    images: ['https://img.test/main.jpg', 'https://img.test/2.jpg'],
    weekdayPrice: '350000',
    weekendPrice: '400000',
    hourlyPrice: null,
    monthlyPrice: null,
    withDriverDailyPrice: null,
    discountPercent: 10,
    deliveryEnabled: true,
    brand: null,
    model: 'SH 150i',
    manufactureYear: 2023,
    seatCount: 2,
    fuelType: null,
    transmission: 'automatic_cvt',
    color: 'Đen',
    description: 'Xe đẹp\nBao giao tận nơi',
    branchName: 'Chi nhánh Quận 1',
    branchAddress: '12 Nguyễn Huệ',
    tenantId: 't1',
    tenantSlug: 'demo',
    tenantName: 'Gian hàng Demo',
    tenantStatus: 'active',
    ownerName: 'Chị Lan',
    ownerPhone: '0901234567',
    provinceName: 'Hồ Chí Minh',
    bookingCount: 3,
    reviewCount: 1,
    latestApproval: null,
    platformHide: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as unknown as AdminVehicleDetail;
}

const noop = () => undefined;

function renderDrawer(
  over: Partial<AdminVehicleDetail> = {},
  props: Partial<{
    previousId: string | null;
    nextId: string | null;
    onNavigate: (id: string) => void;
  }> = {},
) {
  detail.data = makeVehicle(over);
  return render(
    <App>
      <AdminVehicleDetailDrawer
        vehicleId="v1"
        previousId={props.previousId ?? null}
        nextId={props.nextId ?? null}
        onNavigate={props.onNavigate ?? noop}
        onClose={vi.fn()}
      />
    </App>,
  );
}

/** Thẻ "Trên chợ" ở cột phải — ba trục + kết quả. */
function marketplaceCard(): HTMLElement {
  return screen.getByRole('region', { name: 'Trên chợ' });
}

const platformHidden = {
  publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN,
  listingStatus: 'hidden',
  isMarketplaceVisible: false,
  marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.PLATFORM_HIDDEN,
  platformHide: {
    reason: 'Ảnh không phải xe thật',
    hiddenAt: '2026-09-20T03:00:00.000Z',
    hiddenByName: 'Admin A',
  },
} satisfies Partial<AdminVehicleDetail>;

beforeEach(() => {
  perms.granted = new Set<string>([PERMISSION.PLATFORM_VEHICLE_MODERATE]);
  moderation.mutate.mockReset();
  moderation.isPending = false;
  moderation.variables = undefined;
  messages.error.mockReset();
  messages.success.mockReset();
  support.props = null;
});

afterEach(cleanup);

describe('AdminVehicleDetailDrawer — hình dạng panel làm việc', () => {
  it('tiêu đề cố định + mã xe + trạng thái kiểm duyệt; tên xe là h2 trong hồ sơ', () => {
    renderDrawer();

    expect(screen.getByText('Chi tiết xe')).toBeTruthy();
    // Mã xe đứng ở tiêu đề panel (và lặp lại trong khối "Thông tin xe").
    expect(screen.getAllByText('XM-001').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 2, name: 'Honda SH 150i' })).toBeTruthy();
  });

  it('trước/sau: tắt ở hai đầu, bấm thì chuyển thẳng trong panel', () => {
    const onNavigate = vi.fn();
    renderDrawer({}, { previousId: null, nextId: 'v2', onNavigate });

    const previous = screen.getByRole('button', { name: 'Xe trước' });
    expect((previous as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Xe sau' }));
    expect(onNavigate).toHaveBeenCalledWith('v2');
  });

  it('hồ sơ: giá theo định dạng VND, giảm giá, số đơn có link sang đơn thuê của xe, link nhật ký', () => {
    renderDrawer();

    expect(screen.getByText('350.000 ₫')).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();
    // Khối "Hoạt động" thu gọn mặc định — mở ra mới có link.
    fireEvent.click(screen.getByText('Hoạt động'));
    expect(screen.getByRole('link', { name: 'Xem đơn thuê của xe' }).getAttribute('href')).toContain(
      'vehicleId=v1',
    );
    expect(screen.getByRole('link', { name: 'Xem nhật ký của xe' }).getAttribute('href')).toContain(
      'targetId=v1',
    );
  });

  it('gian hàng chủ quản: chủ shop + SĐT, chi nhánh, link hồ sơ đối tác và trang gian hàng', () => {
    renderDrawer();
    const shop = screen.getByRole('region', { name: 'Gian hàng chủ quản' });

    expect(within(shop).getByText('Chị Lan')).toBeTruthy();
    expect(within(shop).getByRole('link', { name: '0901234567' }).getAttribute('href')).toBe(
      'tel:0901234567',
    );
    expect(within(shop).getByText('Chi nhánh Quận 1 · 12 Nguyễn Huệ')).toBeTruthy();
    expect(within(shop).getByRole('link', { name: 'Hồ sơ đối tác' }).getAttribute('href')).toContain(
      'tenant=t1',
    );
    expect(within(shop).getByRole('link', { name: /Trang gian hàng/ }).getAttribute('href')).toContain(
      '/shops/demo',
    );
  });

  it('phiên hỗ trợ: chỉ có khi đủ quyền, và vào thẳng trang sửa CHIẾC XE này', () => {
    renderDrawer();
    expect(screen.queryByRole('button', { name: /Mở phiên hỗ trợ/ })).toBeNull();
    expect(support.props).toBeNull();

    cleanup();
    perms.granted.add(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW);
    renderDrawer();
    expect(screen.getByRole('button', { name: /Mở phiên hỗ trợ/ })).toBeTruthy();
    expect(support.props?.tenantId).toBe('t1');
    expect(support.props?.next?.('ctx-1')).toContain('/tenant-support/ctx-1/vehicles/v1/edit');
  });
});

describe('AdminVehicleDetailDrawer — ba trục hiển thị (ADR 0048)', () => {
  it('xe đang bán: chủ xe Bật, kết quả Đang hiển thị, có link ra trang xe ở site khách', () => {
    renderDrawer();
    const card = marketplaceCard();

    expect(within(card).getByText('Bật')).toBeTruthy();
    expect(within(card).getAllByText('Đang hiển thị').length).toBeGreaterThan(0);
    expect(within(card).getByRole('link', { name: /Xem trang xe/ }).getAttribute('href')).toContain(
      '/listings/v1',
    );
    expect(screen.getByText('Khách đang thấy xe này trên chợ.')).toBeTruthy();
  });

  it('chủ xe tắt công tắc: nói rõ Tắt, kết quả Đang ẩn kèm LÝ DO, chân panel nhắc lại', () => {
    renderDrawer({
      marketplaceEnabled: false,
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED,
      listingStatus: 'hidden',
    });
    const card = marketplaceCard();

    expect(within(card).getByText('Tắt')).toBeTruthy();
    expect(within(card).getByText('Đang ẩn')).toBeTruthy();
    expect(within(card).getByText('Chủ xe tạm ẩn')).toBeTruthy();
    expect(screen.getByText('Xe đã duyệt nhưng đang ẩn: Chủ xe tạm ẩn.')).toBeTruthy();
  });

  it('gian hàng bị khoá: lý do nói về GIAN HÀNG, không đổ cho chiếc xe', () => {
    renderDrawer({
      tenantStatus: 'suspended',
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.SHOP_INACTIVE,
    });

    expect(within(marketplaceCard()).getByText('Gian hàng ngừng hoạt động')).toBeTruthy();
  });

  it('lựa chọn của chủ xe là CHỈ ĐỌC — không có công tắc nào cho admin, có dấu "i" giải thích', () => {
    renderDrawer();

    expect(screen.queryByRole('switch')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Vì sao nền tảng không đổi được mục này/ }),
    ).toBeTruthy();
  });

  it('đang có phiếu chờ duyệt: cảnh báo đầu hồ sơ kèm link mở phiếu', () => {
    renderDrawer({
      publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.NOT_APPROVED,
      latestApproval: {
        taskId: 'task-9',
        status: APPROVAL_STATUS.PENDING,
        submittedAt: '2026-09-25T02:00:00.000Z',
        reviewedAt: null,
        reason: null,
      },
    });

    expect(screen.getByText('Đang có phiếu chờ duyệt')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Mở phiếu duyệt' })[0]!.getAttribute('href')).toContain(
      'task=task-9',
    );
    // Không ẩn được, không gỡ ẩn được: chân panel nói vậy, không có nút nào.
    expect(screen.getByText(/Chỉ ẩn được xe đang hiển thị công khai/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ẩn xe khỏi chợ|Gỡ ẩn/ })).toBeNull();
  });
});

describe('AdminVehicleDetailDrawer — ẩn xe', () => {
  it('bắt buộc lý do; gửi đúng id xe + lý do, toast xác nhận', async () => {
    moderation.mutate.mockImplementation((_a: unknown, opts: { onSuccess?: () => void }) =>
      opts.onSuccess?.(),
    );
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: /Ẩn xe khỏi chợ/ }));
    expect(await screen.findByText(/Lý do được lưu vào nhật ký hệ thống/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ẩn xe' }));
    expect(await screen.findByText('Nhập lý do ẩn xe')).toBeTruthy();
    expect(moderation.mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: /Lý do ẩn/ }), {
      target: { value: '  Ảnh không phải xe thật  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn xe' }));

    await waitFor(() => expect(moderation.mutate).toHaveBeenCalledTimes(1));
    expect(moderation.mutate.mock.calls[0]?.[0]).toEqual({
      id: 'v1',
      kind: 'hide',
      reason: 'Ảnh không phải xe thật',
    });
    expect(messages.success).toHaveBeenCalledWith('Đã ẩn xe khỏi Marketplace');
  });
});

describe('AdminVehicleDetailDrawer — gỡ ẩn của nền tảng', () => {
  it('xe bị nền tảng ẩn: cảnh báo kể ai ẩn, lúc nào, vì sao; nút là "Gỡ ẩn của nền tảng"', () => {
    renderDrawer(platformHidden);

    expect(screen.getByText('Nền tảng đã ẩn xe này')).toBeTruthy();
    expect(screen.getByText(/Admin A ẩn lúc .*Lý do: Ảnh không phải xe thật/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Gỡ ẩn của nền tảng/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ẩn xe khỏi chợ/ })).toBeNull();
  });

  it('chủ xe đang BẬT: xác nhận hứa xe lên lại chợ, gửi đúng id, toast nói vậy', async () => {
    moderation.mutate.mockImplementation((_a: unknown, opts: { onSuccess?: () => void }) =>
      opts.onSuccess?.(),
    );
    renderDrawer({ ...platformHidden, marketplaceEnabled: true });

    fireEvent.click(screen.getByRole('button', { name: /Gỡ ẩn của nền tảng/ }));
    expect(await screen.findByText(/Xe hiển thị lại trên Marketplace ngay/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ẩn' }));
    await waitFor(() => expect(messages.success).toHaveBeenCalledTimes(1));
    expect(moderation.mutate.mock.calls[0]?.[0]).toEqual({ id: 'v1', kind: 'unhide' });
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

  it('thiếu quyền kiểm duyệt: không vẽ nút nào, chân panel nói lý do', () => {
    perms.granted = new Set<string>();
    renderDrawer(platformHidden);

    expect(screen.queryByRole('button', { name: /Gỡ ẩn/ })).toBeNull();
    expect(screen.getByText('Bạn không có quyền kiểm duyệt xe.')).toBeTruthy();
  });
});
