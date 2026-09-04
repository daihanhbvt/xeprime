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

/** Mọi hành động của một hàng nằm trong menu ⋮ — mở nó ra rồi mới bấm được mục nào. */
async function openRowMenu(title: string) {
  fireEvent.click(screen.getByRole('button', { name: `Thao tác cho ${title}` }));
  await screen.findByRole('menu');
}

const REGISTRATION = 'Đăng ký xe (Cà vẹt)';

describe('Tab Giấy tờ (Wave 5 + 5.1)', () => {
  it('thiếu documents.view: màn không có quyền, KHÔNG bật query', () => {
    permissions.granted = new Set();
    renderTab();
    expect(screen.getByText('Không có quyền xem giấy tờ')).toBeTruthy();
    expect(documentsQuery.enabled).toBe(false);
  });

  it('chỉ có view (summary-only): chế độ xem, KHÔNG có menu hành động, KHÔNG request chi tiết', () => {
    permissions.granted = new Set([PERMISSION.VEHICLE_DOCUMENT_VIEW]);
    renderTab();
    expect(screen.getByText(/Chế độ xem/)).toBeTruthy();
    // Không hành động nào khả dụng → RowActions không dựng cả nút ⋮.
    expect(screen.queryByRole('button', { name: /Thao tác cho/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Thêm loại giấy tờ/ })).toBeNull();
    // Không quyền chi tiết → hook chi tiết không bao giờ được bật (không rò rỉ PII qua request).
    expect(detailQuery.enabledRequests).toEqual([]);
  });

  it('có manage nhưng thiếu view_details: menu chỉ còn thay file + xoá, không Xem chi tiết/OCR', async () => {
    permissions.granted = new Set([
      PERMISSION.VEHICLE_DOCUMENT_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_MANAGE,
    ]);
    renderTab();
    await openRowMenu(REGISTRATION);
    // Thay file vẫn được (không cần đọc metadata nhạy cảm).
    expect(screen.getByRole('menuitem', { name: /Thay thế file/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Xoá/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Xem chi tiết/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Nhập từ OCR/ })).toBeNull();
    // Thiếu view_files → không tải xuống, không lịch sử.
    expect(screen.queryByRole('menuitem', { name: /Tải xuống/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Lịch sử/ })).toBeNull();
  });

  it('đủ 4 loại hàng: 3 loại chuẩn luôn hiện (Chưa có khi trống) + trạng thái đúng META', () => {
    documentsQuery.data = [
      doc({}),
      doc({ id: 'doc-2', type: 'insurance', expiresAt: '2026-07-01', presentation: 'expired' }),
    ];
    renderTab();
    expect(screen.getByText(REGISTRATION)).toBeTruthy();
    expect(screen.getByText('Đăng kiểm kỹ thuật')).toBeTruthy();
    expect(screen.getByText('Bảo hiểm TNDS bắt buộc')).toBeTruthy();
    expect(screen.getByText('Còn hiệu lực')).toBeTruthy();
    expect(screen.getByText('Đã hết hạn')).toBeTruthy();
    expect(screen.getByText('Chưa có')).toBeTruthy(); // đăng kiểm chưa có
    // Hết hạn chỉ là CẢNH BÁO trong tab — có alert, không có gì nói xe bị ẩn/chặn.
    expect(screen.getByText(/đã hết hiệu lực từ ngày/)).toBeTruthy();
  });

  it('Tải xuống: xin signed URL qua endpoint kiểm quyền (activeVersionId từ summary) — không <a href>', async () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    const view = renderTab();
    expect(view.container.querySelector('a[href]')).toBeNull();
    await openRowMenu(REGISTRATION);
    fireEvent.click(screen.getByRole('menuitem', { name: /Tải xuống/ }));
    await waitFor(() =>
      expect(api.fetchDocumentDownload).toHaveBeenCalledWith('vehicle-1', 'doc-1', 'ver-1'),
    );
    await waitFor(() =>
      expect(opened).toHaveBeenCalledWith('https://r2.local/signed', '_blank', 'noopener'),
    );
    opened.mockRestore();
  });

  it('OCR chưa cấu hình (thực tế hiện tại): 503 → mở thẳng form nhập thủ công', async () => {
    api.requestDocumentOcr.mockRejectedValue(
      new ApiClientError({ code: 'OCR_NOT_CONFIGURED', message: 'chưa cấu hình', status: 503 }),
    );
    renderTab();
    await openRowMenu(REGISTRATION);
    fireEvent.click(screen.getByRole('menuitem', { name: /Nhập từ OCR/ }));
    // Fallback tường minh: hộp thoại nhập tay mở ra, không giả kết quả OCR.
    expect(await screen.findByText(/Nhập thông tin giấy tờ/)).toBeTruthy();
    expect(screen.getByLabelText(/Họ tên chủ xe/)).toBeTruthy();
  });

  /* Yêu cầu mới: xem được thông tin đã nhập/đã quét mà KHÔNG phải mở form sửa. */
  it('Xem chi tiết: bề mặt CHỈ ĐỌC hiện giá trị đã nhập, ô trống nói rõ là chưa nhập', async () => {
    detailQuery.data = detailOf({ plateNumber: '43K12345', engineNumber: 'M27201234' });
    renderTab();
    await openRowMenu(REGISTRATION);
    fireEvent.click(screen.getByRole('menuitem', { name: /Xem chi tiết/ }));

    expect(await screen.findByText('Thông tin giấy tờ')).toBeTruthy();
    expect(screen.getByText('43K12345')).toBeTruthy();
    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
    expect(screen.getByText('M27201234')).toBeTruthy();
    // Trường chưa có giá trị hiện chữ mờ, không để ô rỗng khó hiểu.
    expect(screen.getAllByText('Chưa nhập').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chưa chọn').length).toBeGreaterThan(0);
    // Chỉ đọc: không có ô nhập nào và không có nút Lưu.
    expect(screen.queryByLabelText(/Họ tên chủ xe/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Lưu giấy tờ/ })).toBeNull();
  });

  it('Xem chi tiết → Chỉnh sửa: chuyển sang form, lưu dùng rowVersion của bản CHI TIẾT', async () => {
    api.updateVehicleDocument.mockResolvedValue(detailOf({}));
    renderTab();
    await openRowMenu(REGISTRATION);
    fireEvent.click(screen.getByRole('menuitem', { name: /Xem chi tiết/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Chỉnh sửa/ }));

    expect(await screen.findByLabelText(/Họ tên chủ xe/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Lưu giấy tờ/ }));
    await waitFor(() => expect(api.updateVehicleDocument).toHaveBeenCalledTimes(1));
    const [, , body] = api.updateVehicleDocument.mock.calls[0] as [
      string,
      string,
      { expectedRowVersion: number },
    ];
    expect(body.expectedRowVersion).toBe(3); // rowVersion của bản chi tiết, không phải list
  });

  it('backend trả 403 khi tải chi tiết: hộp thoại báo thiếu quyền, nút Lưu bị khoá', async () => {
    detailQuery.data = undefined;
    detailQuery.isError = true;
    detailQuery.error = new ApiClientError({ code: 'FORBIDDEN', message: 'forbidden', status: 403 });
    renderTab();
    await openRowMenu(REGISTRATION);
    fireEvent.click(screen.getByRole('menuitem', { name: /Xem chi tiết/ }));
    expect(await screen.findByText('Không có quyền xem chi tiết giấy tờ')).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: /Lưu giấy tờ/ });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
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
    await openRowMenu(REGISTRATION);
    fireEvent.click(screen.getByRole('menuitem', { name: /Nhập từ OCR/ }));

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
    await openRowMenu(REGISTRATION);
    fireEvent.click(screen.getByRole('menuitem', { name: /Nhập từ OCR/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Bỏ qua — đã đối soát/ }));
    await waitFor(() =>
      expect(api.applyDocumentOcr).toHaveBeenCalledWith('vehicle-1', 'doc-1', 'job-1', {
        fields: [],
        applyPlateToVehicle: false,
      }),
    );
  });

  it('xoá giấy tờ: có xác nhận, gọi archive rồi báo thành công (file/lịch sử vẫn giữ)', async () => {
    api.archiveVehicleDocument.mockResolvedValue({ id: 'doc-1' });
    renderTab();
    await openRowMenu(REGISTRATION);
    fireEvent.click(screen.getByRole('menuitem', { name: /Xoá/ }));

    // Hành động không đảo ngược từ giao diện → phải qua bước xác nhận, chưa gọi API.
    expect(await screen.findByText('Xoá giấy tờ khỏi danh mục?')).toBeTruthy();
    expect(screen.getByText(/vẫn được lưu để đối soát/)).toBeTruthy();
    expect(api.archiveVehicleDocument).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá giấy tờ' }));
    await waitFor(() =>
      expect(api.archiveVehicleDocument).toHaveBeenCalledWith('vehicle-1', 'doc-1'),
    );
    expect(await screen.findByText('Đã xoá giấy tờ khỏi danh mục')).toBeTruthy();
  });

  /*
   * Hàng chưa có file: TẢI LÊN phải là một cái nút nhìn thấy được. Bản trước gom mọi hành động
   * vào menu ⋮, nên ba hàng loại chuẩn mở ra ở trạng thái "Chưa có" mà không chỉ được chỗ bắt
   * đầu — đúng bước đầu tiên của cả màn lại là bước bị giấu.
   */
  it('hàng chưa có file: nút Tải lên nằm NGOÀI menu, và ô bên trái cũng bấm để tải lên', () => {
    documentsQuery.data = [];
    renderTab();
    // Ba loại chuẩn, mỗi hàng một nút tải lên hiện rõ — không phải mở menu mới thấy.
    expect(screen.getAllByRole('button', { name: /Tải lên tài liệu$/ })).toHaveLength(3);
    // Không còn hành động phụ nào → RowActions không dựng nút ⋮ thừa.
    expect(screen.queryByRole('button', { name: /Thao tác cho/ })).toBeNull();
    // Ô bên trái là điểm bấm lớn cho cùng việc đó.
    expect(
      screen.getByRole('button', { name: `Tải lên tài liệu cho ${REGISTRATION}` }),
    ).toBeTruthy();
  });

  it('hàng ĐÃ có file: ô bên trái mở file, tải lên lùi vào menu thành Thay thế file', async () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderTab();
    // Hàng đã đủ file thì không mời tải lên nữa (hai hàng chuẩn còn trống vẫn mời — đó là đúng).
    expect(
      screen.queryByRole('button', { name: `Tải lên tài liệu cho ${REGISTRATION}` }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Mở file ${REGISTRATION}` }));
    await waitFor(() =>
      expect(api.fetchDocumentDownload).toHaveBeenCalledWith('vehicle-1', 'doc-1', 'ver-1'),
    );
    opened.mockRestore();

    await openRowMenu(REGISTRATION);
    expect(screen.getByRole('menuitem', { name: /Thay thế file/ })).toBeTruthy();
  });

  it('thiếu manage: xem được chi tiết nhưng không có Chỉnh sửa/Xoá', async () => {
    permissions.granted = new Set([
      PERMISSION.VEHICLE_DOCUMENT_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_DETAIL_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW,
    ]);
    renderTab();
    await openRowMenu(REGISTRATION);
    expect(screen.queryByRole('menuitem', { name: /Xoá/ })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: /Xem chi tiết/ }));
    expect(await screen.findByText('Thông tin giấy tờ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Chỉnh sửa/ })).toBeNull();
  });
  /*
   * Thêm loại giấy tờ = CHỌN loại + đính kèm ảnh/file. Trước đây ô tên là input tự do và hộp
   * thoại kèm cả chín ô metadata — nhập tên tay ra năm cách viết cho cùng một loại giấy tờ, và
   * bắt điền metadata ngay lúc chưa đọc tờ giấy.
   */
  it('Thêm loại giấy tờ: tên là danh sách chọn, KHÔNG có ô metadata nào', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Thêm loại giấy tờ/ }));

    expect(await screen.findByLabelText(/Loại giấy tờ/)).toBeTruthy();
    // Không còn ô gõ tự do cho tên, và không lôi metadata vào bước này.
    expect(screen.queryByLabelText('Tên loại giấy tờ')).toBeNull();
    expect(screen.queryByLabelText(/Biển số xe/)).toBeNull();
    expect(screen.queryByLabelText(/Số khung/)).toBeNull();
    expect(screen.queryByLabelText(/Ghi chú/)).toBeNull();
    // Chỉ còn đúng phần đính kèm.
    expect(screen.getByRole('button', { name: /Chọn ảnh hoặc file/ })).toBeTruthy();
  });

  it('chọn một mục có sẵn: lưu MÃ preset vào customTypeName, hàng hiện nhãn đã dịch', async () => {
    api.createVehicleDocument.mockResolvedValue(detailOf({ id: 'doc-9' }));
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Thêm loại giấy tờ/ }));
    fireEvent.mouseDown(await screen.findByLabelText(/Loại giấy tờ/));
    fireEvent.click(await screen.findByTitle('Phù hiệu xe hợp đồng'));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm giấy tờ' }));

    await waitFor(() => expect(api.createVehicleDocument).toHaveBeenCalledTimes(1));
    expect(api.createVehicleDocument).toHaveBeenCalledWith('vehicle-1', {
      type: 'other',
      customTypeName: 'contract_badge',
    });
  });

  it('chọn "Khác": mở ô nhập tên, bắt buộc điền, lưu đúng chữ người dùng gõ', async () => {
    api.createVehicleDocument.mockResolvedValue(detailOf({ id: 'doc-9' }));
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Thêm loại giấy tờ/ }));
    fireEvent.mouseDown(await screen.findByLabelText(/Loại giấy tờ/));
    fireEvent.click(await screen.findByTitle('Khác — tự đặt tên'));

    const nameInput = await screen.findByLabelText('Tên loại giấy tờ');
    // Bỏ trống thì không gọi API.
    fireEvent.click(screen.getByRole('button', { name: 'Thêm giấy tờ' }));
    expect(await screen.findByText('Nhập tên loại giấy tờ')).toBeTruthy();
    expect(api.createVehicleDocument).not.toHaveBeenCalled();

    fireEvent.change(nameInput, { target: { value: 'Giấy phép con' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm giấy tờ' }));
    await waitFor(() =>
      expect(api.createVehicleDocument).toHaveBeenCalledWith('vehicle-1', {
        type: 'other',
        customTypeName: 'Giấy phép con',
      }),
    );
  });

  it('tên preset hiện nhãn đã dịch, tên tự đặt hiện nguyên văn', () => {
    documentsQuery.data = [
      doc({ id: 'doc-a', type: 'other', customTypeName: 'contract_badge' }),
      doc({ id: 'doc-b', type: 'other', customTypeName: 'Giấy phép con' }),
    ];
    renderTab();
    expect(screen.getByText('Phù hiệu xe hợp đồng')).toBeTruthy();
    expect(screen.getByText('Giấy phép con')).toBeTruthy();
  });

});
