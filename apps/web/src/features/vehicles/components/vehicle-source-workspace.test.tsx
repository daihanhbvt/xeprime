import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import { VehicleSourceWorkspace } from './VehicleSourceWorkspace';
import type { VehicleDetail, VehicleSource } from '../types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage/vehicles/vehicle-1/edit',
  useSearchParams: () => new URLSearchParams('tab=source'),
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));
vi.mock('@/services/upload', () => ({
  validateDocumentFile: () => null,
  uploadToR2: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  presignSourceContract: vi.fn(),
  completeSourceContract: vi.fn(),
  fetchSourceContractDownload: vi
    .fn()
    .mockResolvedValue({ downloadUrl: 'https://r2.local/signed', expiresAt: '2026-01-01' }),
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

const sourceQuery = vi.hoisted(() => ({
  data: undefined as VehicleSource | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  enabled: undefined as boolean | undefined,
}));
const saveMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
}));
vi.mock('../hooks/use-vehicle-source', () => ({
  useVehicleSource: (_id: string | undefined, enabled?: boolean) => {
    sourceQuery.enabled = enabled;
    return sourceQuery;
  },
  useSaveVehicleSource: () => saveMutation,
}));

const vehicle = {
  id: 'vehicle-1',
  code: 'XP-001',
  name: 'Toyota Vios 2024',
  sourceType: 'financed',
} as unknown as VehicleDetail;

const financedSource: VehicleSource = {
  sourceType: 'financed',
  detail: {
    sourceType: 'financed',
    purchaseDate: null,
    purchasePrice: null,
    purchasePlace: null,
    bankName: 'VPBank',
    contractNumber: 'VPBL-2024-00123',
    originalPrincipal: '450000000',
    monthlyPrincipal: '7500000',
    monthlyInterest: '3187500',
    monthlyTotal: '10687500',
    interestRatePercent: '8.5',
    termMonths: 60,
    interestMethod: 'reducing_balance',
    ownerName: null,
    ownerPhone: null,
    ownerEmail: null,
    monthlyRent: null,
    commissionPercent: null,
    paymentDay: 15,
    startDate: '2024-01-15',
    endDate: null,
    contractFiles: [
      { id: '01JEXAMPLEFILEID0000000000', name: 'Hop_dong.pdf', mimeType: 'application/pdf', size: 100, status: 'ready' },
      { id: null, name: 'old-public.pdf', mimeType: null, size: 50, status: 'legacy' },
    ],
    notes: null,
    obligationReady: true,
    updatedAt: new Date().toISOString(),
  },
};

function renderTab() {
  return render(
    <App>
      <VehicleSourceWorkspace vehicle={vehicle} />
    </App>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.FINANCE_VIEW, PERMISSION.VEHICLE_UPDATE]);
  sourceQuery.data = financedSource;
  sourceQuery.isLoading = false;
  sourceQuery.isError = false;
  sourceQuery.refetch.mockReset();
  saveMutation.mutateAsync.mockReset();
  saveMutation.mutateAsync.mockResolvedValue(financedSource);
});
afterEach(cleanup);

describe('VehicleSourceWorkspace — Wave 4 tab Nguồn xe & tài chính', () => {
  it('thiếu finance.view: hiện màn không có quyền và KHÔNG bật query', () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_UPDATE]);
    renderTab();
    expect(screen.getByText('Không có quyền truy cập')).toBeTruthy();
    expect(sourceQuery.enabled).toBe(false);
    expect(screen.queryByLabelText(/Ngân hàng/)).toBeNull();
  });

  it('lỗi tải: hiện thông báo + nút thử lại gọi refetch', () => {
    sourceQuery.data = undefined;
    sourceQuery.isError = true;
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(sourceQuery.refetch).toHaveBeenCalled();
  });

  it('financed: nạp hồ sơ vay + tổng gốc-lãi tính sẵn; KHÔNG render URL nào', () => {
    const view = renderTab();
    expect(screen.getByDisplayValue('VPBank')).toBeTruthy();
    expect(screen.getByDisplayValue('VPBL-2024-00123')).toBeTruthy();
    expect(screen.getByText(/Tổng phải đóng mỗi tháng/)).toBeTruthy();
    expect(screen.getByText(/10\.687\.500/)).toBeTruthy();
    expect(screen.getByText('Hop_dong.pdf')).toBeTruthy();
    // Tài liệu riêng tư: không có <a href> nào trỏ tới file — tải về đi qua endpoint kiểm quyền.
    expect(view.container.querySelector('a[href*="r2"]')).toBeNull();
  });

  it('bản ghi legacy: hiện yêu cầu tải lên lại, không có nút tải/xoá', () => {
    renderTab();
    expect(
      screen.getByText('Tài liệu cũ cần được tải lên lại để bảo đảm quyền riêng tư'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá tệp old-public.pdf' })).toBeNull();
  });

  it('bấm Tải xuống: xin signed URL mới qua API rồi mở, không lưu vào form', async () => {
    const api = await import('../api');
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Tải xuống/ }));
    await waitFor(() =>
      expect(api.fetchSourceContractDownload).toHaveBeenCalledWith(
        'vehicle-1',
        '01JEXAMPLEFILEID0000000000',
      ),
    );
    await waitFor(() =>
      expect(opened).toHaveBeenCalledWith('https://r2.local/signed', '_blank', 'noopener'),
    );
    opened.mockRestore();
  });

  it('chỉ có finance.view (không vehicles.update): chế độ chỉ đọc, không nút lưu', () => {
    permissions.granted = new Set([PERMISSION.FINANCE_VIEW]);
    renderTab();
    expect(screen.getByText(/chế độ chỉ đọc/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).toBeNull();
    expect((screen.getByDisplayValue('VPBank') as HTMLInputElement).disabled).toBe(true);
  });

  it('xe chưa có hồ sơ: cảnh báo trống + form theo sourceType của xe', () => {
    sourceQuery.data = { sourceType: 'rented', detail: null };
    renderTab();
    expect(screen.getByText('Xe chưa có hồ sơ nguồn chi tiết')).toBeTruthy();
    expect(screen.getByLabelText(/Tên chủ xe/)).toBeTruthy();
  });

  it('lưu cùng hình thức: gửi payload đúng biến thể, KHÔNG hỏi xác nhận', async () => {
    renderTab();
    fireEvent.change(screen.getByLabelText(/Ngân hàng/), { target: { value: 'Techcombank' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = saveMutation.mutateAsync.mock.calls[0]![0];
    expect(payload.sourceType).toBe('financed');
    expect(payload.bankName).toBe('Techcombank');
    // Trường của biến thể khác không được lọt vào payload.
    expect(payload).not.toHaveProperty('monthlyRent');
    expect(payload).not.toHaveProperty('commissionPercent');
    expect(payload).not.toHaveProperty('purchasePrice');
    // Chỉ ID file ready được gửi — bản ghi legacy (id null) không đi kèm, và không có URL nào.
    expect(payload.contractFileIds).toEqual(['01JEXAMPLEFILEID0000000000']);
    expect(payload).not.toHaveProperty('contractFiles');
    expect(JSON.stringify(payload)).not.toMatch(/https?:/);
  });

  it('đổi hình thức nguồn: bắt xác nhận trước khi lưu, huỷ thì không gọi API', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('radio', { name: /Hợp tác/ }));
    fireEvent.change(await screen.findByLabelText(/Họ tên đối tác/), {
      target: { value: 'Trần Thị B' },
    });
    fireEvent.change(screen.getByLabelText(/Tỷ lệ chia sẻ doanh thu/), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText('Đổi hình thức sở hữu xe?')).toBeTruthy();
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận & Lưu' }));
    await waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = saveMutation.mutateAsync.mock.calls[0]![0];
    expect(payload.sourceType).toBe('partnership');
    expect(payload.commissionPercent).toBe('30');
    expect(payload).not.toHaveProperty('bankName');
  });

  it('lưu hỏng: giữ nguyên giá trị đã nhập để sửa/thử lại', async () => {
    saveMutation.mutateAsync.mockRejectedValue(new Error('Mất mạng'));
    renderTab();
    fireEvent.change(screen.getByLabelText(/Ngân hàng/), { target: { value: 'MB Bank' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText(/Ngân hàng/) as HTMLInputElement).value).toBe('MB Bank');
  });

  it('validate theo biến thể: thuê lại thiếu tiền thuê thì chặn tại form', async () => {
    sourceQuery.data = { sourceType: 'rented', detail: null };
    renderTab();
    fireEvent.change(screen.getByLabelText(/Tên chủ xe/), { target: { value: 'Nguyễn Văn A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Nhập tiền thuê hàng tháng')).toBeTruthy();
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
  });
});
