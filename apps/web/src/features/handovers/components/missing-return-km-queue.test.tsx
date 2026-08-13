import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { MissingReturnKmQueue } from './MissingReturnKmQueue';
import type { MissingOdometerItem } from '../types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage/maintenance',
  useSearchParams: () => new URLSearchParams('filter=missing_return_km'),
}));

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => layout.mobile,
  useIsTablet: () => false,
  useIsDesktop: () => !layout.mobile,
  useMediaQuery: () => false,
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

const handoverQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
}));
const invalidateHandovers = vi.hoisted(() => vi.fn());
vi.mock('../hooks', () => ({
  useHandoverContext: () => handoverQuery,
  useInvalidateHandovers: () => invalidateHandovers,
}));

const api = vi.hoisted(() => ({ resolveHandoverOdometer: vi.fn() }));
vi.mock('../api', () => ({
  resolveHandoverOdometer: (...args: unknown[]) => api.resolveHandoverOdometer(...args),
}));

function item(overrides: Partial<MissingOdometerItem> = {}): MissingOdometerItem {
  return {
    handoverId: 'handover-1',
    bookingId: 'booking-1',
    bookingCode: 'XP-0045',
    vehicleId: 'vehicle-1',
    vehicleName: 'Toyota Vios 2024',
    plateNumber: '51A-123.45',
    confirmedAt: '2026-08-15T02:15:00.000Z',
    confirmedByName: 'Trần Văn C',
    pickupOdometerKm: 45_230,
    rowVersion: 3,
    ...overrides,
  } as MissingOdometerItem;
}

const meta = { page: 1, limit: 20, total: 1, hasNext: false };

function renderQueue(items: MissingOdometerItem[] = [item()], props = {}) {
  return render(
    <App>
      <MissingReturnKmQueue
        items={items}
        meta={meta}
        loading={false}
        onPageChange={vi.fn()}
        onResolved={vi.fn()}
        {...props}
      />
    </App>,
  );
}

/**
 * Cảnh báo render-phase của React là LỖI trong bộ này: gọi setState của cha khi đang render là
 * chính lỗi Wave 8.1 §3 phải đóng, và nó chỉ lộ ra qua `console.error`.
 */
let consoleError: ReturnType<typeof vi.spyOn>;
const renderPhaseWarnings: string[] = [];

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.HANDOVER_VIEW, PERMISSION.VEHICLE_ODOMETER_CORRECT]);
  layout.mobile = false;
  handoverQuery.data = undefined;
  handoverQuery.isLoading = false;
  handoverQuery.isError = false;
  handoverQuery.error = undefined;
  handoverQuery.refetch = vi.fn();
  invalidateHandovers.mockReset();
  api.resolveHandoverOdometer.mockReset().mockResolvedValue({});

  renderPhaseWarnings.length = 0;
  consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(' ');
    if (/Cannot update a component|while rendering a different component/i.test(text)) {
      renderPhaseWarnings.push(text);
    }
  });
});

afterEach(() => {
  // Không test nào được để lọt cảnh báo cập nhật state trong lúc render.
  expect(renderPhaseWarnings).toEqual([]);
  consoleError.mockRestore();
  cleanup();
});

describe('Hàng đợi "Thiếu KM trả" (Wave 8)', () => {
  it('thiếu quyền xem bàn giao: màn không có quyền, KHÔNG hiện việc nào', () => {
    permissions.granted = new Set();
    renderQueue();
    expect(screen.getByText('Không có quyền xem việc bàn giao')).toBeTruthy();
    expect(screen.queryByText('Toyota Vios 2024')).toBeNull();
  });

  it('hiện xe, đơn, giờ xác nhận và mốc KM lúc giao', () => {
    renderQueue();
    expect(screen.getByText('Toyota Vios 2024')).toBeTruthy();
    expect(screen.getByText('XP-0045')).toBeTruthy();
    expect(screen.getByText('Trần Văn C')).toBeTruthy();
    expect(screen.getByText('45.230 km')).toBeTruthy();

    // Liên kết dẫn về đúng xe và đúng đơn — không dựng route mới.
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/manage/vehicles/vehicle-1');
    expect(hrefs).toContain('/manage/bookings?booking=booking-1');
  });

  it('chưa có KM lúc giao: nói "Chưa có", KHÔNG dựng 0 km', () => {
    renderQueue([item({ pickupOdometerKm: null })]);
    expect(screen.getByText('Chưa có')).toBeTruthy();
    expect(screen.queryByText('0 km')).toBeNull();
  });

  it('hết việc: màn rỗng nói đúng chuyện, không phải lỗi', () => {
    renderQueue([]);
    expect(screen.getByText('Không còn việc thiếu KM trả')).toBeTruthy();
  });

  it('lỗi tải: hiện lỗi có nút thử lại', () => {
    const onRetry = vi.fn();
    renderQueue([], { error: { onRetry } });
    expect(screen.getByText('Không tải được danh sách việc thiếu KM')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('thiếu quyền chỉnh KM: thấy việc nhưng KHÔNG có nút bổ sung', () => {
    permissions.granted = new Set([PERMISSION.HANDOVER_VIEW]);
    renderQueue();
    expect(screen.getByText('Toyota Vios 2024')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bổ sung KM' })).toBeNull();
    expect(screen.getByText('Cần quyền chỉnh KM')).toBeTruthy();
  });

  it('bổ sung KM: dùng LẠI hộp thoại điều chỉnh của Wave 7, gửi kèm rowVersion và lý do', async () => {
    handoverQuery.data = {
      bookingId: 'booking-1',
      bookingCode: 'XP-0045',
      vehicleId: 'vehicle-1',
      vehicleName: 'Toyota Vios 2024',
      energyKind: 'fuel',
      vehicleOdometerKm: 45_230,
      pickupOdometerKm: 45_230,
      rentalDays: 5,
      nextMaintenanceKm: 50_000,
      suspiciousKmPerDay: null,
      pickup: null,
      return: {
        id: 'handover-1',
        status: 'confirmed',
        odometerKm: null,
        odometerMissing: true,
        photos: [],
        rowVersion: 3,
      },
      canStartPickup: false,
      canStartReturn: false,
    };
    renderQueue();

    fireEvent.click(screen.getByRole('button', { name: 'Bổ sung KM' }));
    expect(await screen.findByText('Bổ sung KM còn thiếu')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Chỉ số KM thực tế'), { target: { value: '45890' } });
    fireEvent.change(screen.getByLabelText('Diễn giải chi tiết'), {
      target: { value: 'Đọc lại từ ảnh đồng hồ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chỉ số KM' }));

    await waitFor(() => expect(api.resolveHandoverOdometer).toHaveBeenCalled());
    const [bookingId, type, body] = api.resolveHandoverOdometer.mock.calls.at(-1)!;
    expect(bookingId).toBe('booking-1');
    expect(type).toBe('return');
    expect(body).toMatchObject({
      odometerKm: 45_890,
      reason: 'Đọc lại từ ảnh đồng hồ',
      expectedRowVersion: 3,
    });
  });
});

describe('Bổ sung KM — trạng thái tải, lỗi và việc đã xử lý (Wave 8.1)', () => {
  /** Ngữ cảnh bàn giao còn việc thật (đang thiếu KM). */
  const unresolvedContext = {
    bookingId: 'booking-1',
    bookingCode: 'XP-0045',
    vehicleId: 'vehicle-1',
    vehicleName: 'Toyota Vios 2024',
    energyKind: 'fuel',
    vehicleOdometerKm: 45_230,
    pickupOdometerKm: 45_230,
    rentalDays: 5,
    nextMaintenanceKm: 50_000,
    suspiciousKmPerDay: null,
    pickup: null,
    return: {
      id: 'handover-1',
      status: 'confirmed',
      odometerKm: null,
      odometerMissing: true,
      photos: [],
      rowVersion: 3,
    },
    canStartPickup: false,
    canStartReturn: false,
  };

  function openResolve() {
    renderQueue();
    fireEvent.click(screen.getByRole('button', { name: 'Bổ sung KM' }));
  }

  it('đang tải: hiện skeleton, KHÔNG đóng và KHÔNG báo đã xử lý', () => {
    handoverQuery.isLoading = true;
    const onResolved = vi.fn();
    renderQueue([item()], { onResolved });
    fireEvent.click(screen.getByRole('button', { name: 'Bổ sung KM' }));

    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('lỗi mạng: giữ bề mặt, có nút thử lại, và KHÔNG coi việc là đã xong', async () => {
    handoverQuery.isError = true;
    handoverQuery.error = new ApiClientError({
      code: 'INTERNAL_ERROR',
      message: 'Lỗi máy chủ',
      status: 500,
    });
    const onResolved = vi.fn();
    renderQueue([item()], { onResolved });
    fireEvent.click(screen.getByRole('button', { name: 'Bổ sung KM' }));

    expect(await screen.findByText('Không tải được biên bản để bổ sung KM')).toBeTruthy();
    // Việc VẪN còn trong hàng đợi — một lần rớt mạng không được xoá việc khỏi danh sách.
    expect(onResolved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(handoverQuery.refetch).toHaveBeenCalled();
  });

  it('thiếu quyền: hiện màn không có quyền, không mời thử lại', async () => {
    handoverQuery.isError = true;
    handoverQuery.error = new ApiClientError({
      code: 'FORBIDDEN',
      message: 'Không có quyền',
      status: 403,
    });
    const onResolved = vi.fn();
    renderQueue([item()], { onResolved });
    fireEvent.click(screen.getByRole('button', { name: 'Bổ sung KM' }));

    expect(await screen.findByText('Không có quyền mở biên bản bàn giao này')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thử lại/ })).toBeNull();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('việc đã được người khác xử lý: đóng và làm mới ĐÚNG MỘT LẦN', async () => {
    // Server trả lời THÀNH CÔNG nhưng biên bản không còn thiếu KM.
    handoverQuery.data = {
      ...unresolvedContext,
      return: { ...unresolvedContext.return, odometerKm: 45_890, odometerMissing: false },
    };
    const onResolved = vi.fn();
    renderQueue([item()], { onResolved });
    fireEvent.click(screen.getByRole('button', { name: 'Bổ sung KM' }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Bổ sung KM còn thiếu')).toBeNull();
  });

  it('còn việc thật: mở hộp thoại, xử lý xong thì đóng và làm mới một lần', async () => {
    handoverQuery.data = unresolvedContext;
    const onResolved = vi.fn();
    renderQueue([item()], { onResolved });
    fireEvent.click(screen.getByRole('button', { name: 'Bổ sung KM' }));

    expect(await screen.findByText('Bổ sung KM còn thiếu')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Chỉ số KM thực tế'), { target: { value: '45890' } });
    fireEvent.change(screen.getByLabelText('Diễn giải chi tiết'), {
      target: { value: 'Đọc lại từ ảnh đồng hồ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chỉ số KM' }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(invalidateHandovers).toHaveBeenCalledTimes(1);
  });

  it('không có gì lọt: openResolve nhiều lần vẫn không sinh cảnh báo render', () => {
    handoverQuery.data = unresolvedContext;
    openResolve();
    expect(renderPhaseWarnings).toEqual([]);
  });
});

describe('Responsive hàng đợi', () => {
  it('desktop: bảng có cột thao tác dính phải và bề rộng sàn để cuộn ngang', () => {
    const view = renderQueue();
    const table = view.container.querySelector('table') as HTMLTableElement;
    expect(table).toBeTruthy();
    expect(Number.parseInt(table.style.width, 10)).toBeGreaterThanOrEqual(900);
    const scrollArea = view.container.querySelector('.ant-table-content') as HTMLElement;
    expect(scrollArea.style.overflowX).toBe('auto');
    // AntD 6 dùng thuật ngữ logical: `fix-end`.
    expect(view.container.querySelector('.ant-table-cell-fix-end')).toBeTruthy();
  });

  it('mobile: thẻ gọn thay cho bảng desktop', () => {
    layout.mobile = true;
    const view = renderQueue();
    expect(view.container.querySelector('table')).toBeNull();
    expect(screen.getByRole('list', { name: 'Việc thiếu KM trả' })).toBeTruthy();
    expect(screen.getByText('Toyota Vios 2024')).toBeTruthy();
    expect(view.container.querySelector('[class*="cardButton"]')).toBeTruthy();
  });

  it('CSS: nút trên mobile giữ vùng chạm 44px, bảng cuộn trong khung của nó', () => {
    // jsdom không áp CSS Modules — đọc thẳng luật trong file style (cùng cách các test khác).
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'MissingReturnKmQueue.module.css'),
      'utf8',
    );
    const mobile = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(mobile).toContain('min-height: 44px');
    expect(css).toContain('min-width: 0');
    expect(css).toContain('overflow: hidden');
  });
});
