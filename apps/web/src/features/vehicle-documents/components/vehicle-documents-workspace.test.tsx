import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import type { VehicleDetail } from '@/features/vehicles/types';
import { ApiClientError } from '@/services/api-client';
import { VehicleDocumentsWorkspace } from './VehicleDocumentsWorkspace';
import type { VehicleDocumentDetail, VehicleDocumentSummary } from '../types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage/vehicles/vehicle-1/edit',
  useSearchParams: () => new URLSearchParams('tab=documents'),
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));
vi.mock('@/services/upload', () => ({
  validateDocumentFile: () => null,
  uploadToR2: vi.fn().mockResolvedValue(undefined),
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

const documentsQuery = vi.hoisted(() => ({
  data: undefined as VehicleDocumentSummary[] | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  enabled: undefined as boolean | undefined,
}));
/** Ghi lại từng lần hook chi tiết được bật — bằng chứng "summary-only không request chi tiết". */
const detailQuery = vi.hoisted(() => ({
  data: undefined as VehicleDocumentDetail | undefined,
  isLoading: false,
  isError: false,
  error: null as unknown,
  enabledRequests: [] as string[],
}));
const versionsQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: null as unknown,
}));
vi.mock('../hooks', () => ({
  useVehicleDocuments: (_id: string | undefined, enabled?: boolean) => {
    documentsQuery.enabled = enabled;
    return documentsQuery;
  },
  useVehicleDocument: (_id: string, documentId: string | null, enabled?: boolean) => {
    if (documentId && enabled) detailQuery.enabledRequests.push(documentId);
    return documentId && enabled
      ? detailQuery
      : { data: undefined, isLoading: false, isError: false, error: null };
  },
  useVehicleDocumentVersions: () => versionsQuery,
  useInvalidateVehicleDocuments: () => vi.fn(),
}));

const api = vi.hoisted(() => ({
  requestDocumentOcr: vi.fn(),
  applyDocumentOcr: vi.fn(),
  fetchDocumentDownload: vi
    .fn()
    .mockResolvedValue({ downloadUrl: 'https://r2.local/signed', expiresAt: '2026-01-01' }),
  fetchDocumentVersions: vi.fn(),
  createVehicleDocument: vi.fn(),
  updateVehicleDocument: vi.fn(),
  archiveVehicleDocument: vi.fn(),
  presignDocumentVersion: vi.fn(),
  attachDocumentVersion: vi.fn(),
}));
vi.mock('../api', () => ({
  requestDocumentOcr: (...args: unknown[]) => api.requestDocumentOcr(...args),
  applyDocumentOcr: (...args: unknown[]) => api.applyDocumentOcr(...args),
  fetchDocumentDownload: (...args: unknown[]) => api.fetchDocumentDownload(...args),
  fetchDocumentVersions: (...args: unknown[]) => api.fetchDocumentVersions(...args),
  createVehicleDocument: (...args: unknown[]) => api.createVehicleDocument(...args),
  updateVehicleDocument: (...args: unknown[]) => api.updateVehicleDocument(...args),
  archiveVehicleDocument: (...args: unknown[]) => api.archiveVehicleDocument(...args),
  presignDocumentVersion: (...args: unknown[]) => api.presignDocumentVersion(...args),
  attachDocumentVersion: (...args: unknown[]) => api.attachDocumentVersion(...args),
}));

const vehicle = {
  id: 'vehicle-1',
  name: 'Toyota Vios 2024',
  plateNumber: '51A-123.45',
} as unknown as VehicleDetail;

/** DTO summary (Wave 5.1) — cố tình KHÔNG có holderName/số giấy tờ/tên file/OCR. */
function doc(overrides: Partial<VehicleDocumentSummary>): VehicleDocumentSummary {
  return {
    id: 'doc-1',
    type: 'registration',
    customTypeName: null,
    expiresAt: null,
    presentation: 'valid',
    warningDays: null,
    hasFile: true,
    activeVersionId: 'ver-1',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as VehicleDocumentSummary;
}

function detailOf(overrides: Partial<VehicleDocumentDetail>): VehicleDocumentDetail {
  return {
    ...doc({}),
    documentNumber: null,
    holderName: 'Nguyễn Văn A',
    holderAddress: null,
    plateNumber: null,
    chassisNumber: null,
    engineNumber: null,
    issuedAt: null,
    notes: null,
    rowVersion: 3,
    activeVersion: {
      id: 'ver-1',
      version: 1,
      file: { id: 'file-1', name: 'Ca_vet.pdf', mimeType: 'application/pdf', size: 100 },
      uploadedAt: '2026-08-01T00:00:00.000Z',
      archivedAt: null,
    },
    ...overrides,
  } as VehicleDocumentDetail;
}

function renderTab() {
  return render(
    <App>
      <VehicleDocumentsWorkspace vehicle={vehicle} />
    </App>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([
    PERMISSION.VEHICLE_DOCUMENT_VIEW,
    PERMISSION.VEHICLE_DOCUMENT_DETAIL_VIEW,
    PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW,
    PERMISSION.VEHICLE_DOCUMENT_MANAGE,
  ]);
  documentsQuery.data = [doc({})];
  documentsQuery.isLoading = false;
  documentsQuery.isError = false;
  detailQuery.data = detailOf({});
  detailQuery.isLoading = false;
  detailQuery.isError = false;
  detailQuery.error = null;
  detailQuery.enabledRequests = [];
  versionsQuery.data = undefined;
  versionsQuery.isError = false;
  versionsQuery.error = null;
  Object.values(api).forEach((mock) => mock.mockClear());
});
afterEach(cleanup);

describe('Tab Giấy tờ (Wave 5 + 5.1)', () => {
  it('thiếu documents.view: màn không có quyền, KHÔNG bật query', () => {
    permissions.granted = new Set();
    renderTab();
    expect(screen.getByText('Không có quyền xem giấy tờ')).toBeTruthy();
    expect(documentsQuery.enabled).toBe(false);
  });

  it('chỉ có view (summary-only): chế độ xem, không nút hành động, KHÔNG request chi tiết', () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_DOCUMENT_VIEW]);
    renderTab();
    expect(screen.getByText(/Chế độ xem/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tải lên tài liệu/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Trích xuất OCR/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Nhập thủ công/ })).toBeNull();
    // Không có view_files → không mở được file/lịch sử dù thấy trạng thái.
    expect(screen.queryByRole('button', { name: 'Xem file' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Lịch sử/ })).toBeNull();
    // Không quyền chi tiết → hook chi tiết không bao giờ được bật (không rò rỉ PII qua request).
    expect(detailQuery.enabledRequests).toEqual([]);
  });

  it('có manage nhưng thiếu view_details: nút sửa/OCR ẩn — không sửa mù dữ liệu nhạy cảm', () => {
    permissions.granted = new Set([
      PERMISSION.VEHICLE_DOCUMENT_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_MANAGE,
    ]);
    renderTab();
    // Tải file vẫn được (không cần đọc metadata nhạy cảm).
    expect(screen.getByRole('button', { name: /Tải lại/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nhập thủ công/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Trích xuất OCR/ })).toBeNull();
  });

  it('đủ 4 loại hàng: 3 loại chuẩn luôn hiện (Chưa có khi trống) + trạng thái đúng META', () => {
    documentsQuery.data = [
      doc({}),
      doc({ id: 'doc-2', type: 'insurance', expiresAt: '2026-07-01', presentation: 'expired' }),
    ];
    renderTab();
    expect(screen.getByText('Đăng ký xe (Cà vẹt)')).toBeTruthy();
    expect(screen.getByText('Đăng kiểm kỹ thuật')).toBeTruthy();
    expect(screen.getByText('Bảo hiểm TNDS bắt buộc')).toBeTruthy();
    expect(screen.getByText('Còn hiệu lực')).toBeTruthy();
    expect(screen.getByText('Đã hết hạn')).toBeTruthy();
    expect(screen.getByText('Chưa có')).toBeTruthy(); // đăng kiểm chưa có
    // Hết hạn chỉ là CẢNH BÁO trong tab — có alert, không có gì nói xe bị ẩn/chặn.
    expect(screen.getByText(/đã hết hiệu lực từ ngày/)).toBeTruthy();
  });

  it('Xem file: xin signed URL qua endpoint kiểm quyền (activeVersionId từ summary) — không <a href>', async () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    const view = renderTab();
    expect(view.container.querySelector('a[href]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Xem file' }));
    await waitFor(() =>
      expect(api.fetchDocumentDownload).toHaveBeenCalledWith('vehicle-1', 'doc-1', 'ver-1'),
    );
    await waitFor(() =>
      expect(opened).toHaveBeenCalledWith('https://r2.local/signed', '_blank', 'noopener'),
    );
    opened.mockRestore();
  });

  it('OCR chưa cấu hình (thực tế hiện tại): 503 → mở form nhập thủ công', async () => {
    api.requestDocumentOcr.mockRejectedValue(
      new ApiClientError({ code: 'OCR_NOT_CONFIGURED', message: 'chưa cấu hình', status: 503 }),
    );
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Trích xuất OCR/ }));
    // Fallback tường minh: hộp thoại nhập tay mở ra, không giả kết quả OCR.
    expect(await screen.findByText(/Nhập thông tin giấy tờ/)).toBeTruthy();
    expect(screen.getByLabelText(/Họ tên chủ xe/)).toBeTruthy();
  });

  it('backend trả 403 khi tải chi tiết: hộp thoại báo thiếu quyền, nút Lưu bị khoá', async () => {
    detailQuery.data = undefined;
    detailQuery.isError = true;
    detailQuery.error = new ApiClientError({ code: 'FORBIDDEN', message: 'forbidden', status: 403 });
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Nhập thủ công/ }));
    expect(await screen.findByText('Không có quyền xem chi tiết giấy tờ')).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: /Lưu giấy tờ/ });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('sửa metadata dùng rowVersion từ bản CHI TIẾT vừa tải (không dính dữ liệu cũ trong list)', async () => {
    api.updateVehicleDocument.mockResolvedValue(detailOf({}));
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Nhập thủ công/ }));
    expect(await screen.findByLabelText(/Họ tên chủ xe/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Lưu giấy tờ/ }));
    await waitFor(() => expect(api.updateVehicleDocument).toHaveBeenCalledTimes(1));
    const [, , body] = api.updateVehicleDocument.mock.calls[0] as [string, string, { expectedRowVersion: number }];
    expect(body.expectedRowVersion).toBe(3); // rowVersion của bản chi tiết, không phải list
  });

  it('OCR needs_review: bảng Hiện tại/Nhận dạng trong khung cuộn, KHÔNG chọn sẵn, chỉ áp trường đã tick', async () => {
    api.requestDocumentOcr.mockResolvedValue({
      id: 'job-1',
      status: 'needs_review',
      provider: 'fake',
      confidence: 87,
      errorCode: null,
      createdAt: '',
      completedAt: null,
      fields: [
        { field: 'holderName', value: 'Nguyễn Văn An', confidence: 91, evidence: null },
        { field: 'expiresAt', value: '2029-01-15', confidence: 88, evidence: null },
      ],
    });
    api.applyDocumentOcr.mockResolvedValue(detailOf({}));
    const view = renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Trích xuất OCR/ }));

    expect(await screen.findByText(/độ tin cậy trích xuất: 87%/)).toBeTruthy();
    // Cột "Hiện tại" lấy từ bản chi tiết (endpoint kiểm quyền riêng).
    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
    // Bảng nằm trong khung cuộn riêng — hộp thoại không tự tràn ngang.
    const wrap = view.baseElement.querySelector('[class*="reviewTableWrap"]');
    expect(wrap).toBeTruthy();
    expect(wrap!.querySelector('table')).toBeTruthy();
    // Không mặc định "ghi đè tất cả": chưa tick gì thì nút áp bị khoá.
    const applyButton = screen.getByRole('button', { name: /Cập nhật đã chọn/ });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn Họ tên chủ xe' }));
    fireEvent.click(screen.getByRole('button', { name: /Cập nhật đã chọn \(1\)/ }));
    await waitFor(() => expect(api.applyDocumentOcr).toHaveBeenCalledTimes(1));
    expect(api.applyDocumentOcr).toHaveBeenCalledWith('vehicle-1', 'doc-1', 'job-1', {
      fields: ['holderName'],
      applyPlateToVehicle: false,
    });
  });

  it('Bỏ qua: đánh dấu đối soát với fields rỗng — không áp gì', async () => {
    api.requestDocumentOcr.mockResolvedValue({
      id: 'job-1',
      status: 'needs_review',
      provider: 'fake',
      confidence: null,
      errorCode: null,
      createdAt: '',
      completedAt: null,
      fields: [{ field: 'holderName', value: 'X', confidence: null, evidence: null }],
    });
    api.applyDocumentOcr.mockResolvedValue(detailOf({}));
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Trích xuất OCR/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Bỏ qua — đã đối soát/ }));
    await waitFor(() =>
      expect(api.applyDocumentOcr).toHaveBeenCalledWith('vehicle-1', 'doc-1', 'job-1', {
        fields: [],
        applyPlateToVehicle: false,
      }),
    );
  });
});
