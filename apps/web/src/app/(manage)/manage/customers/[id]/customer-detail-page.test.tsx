import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, TENANT_CUSTOMER_NOTE_TYPE, TENANT_CUSTOMER_RISK_LEVEL } from '@xeprime/types';
import CustomerDetailPage from './page';
import type {
  CustomerBooking,
  CustomerDocument,
  CustomerNote,
  TenantCustomerDetail,
} from '@/features/customers/types';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/customers/cus-1',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'cus-1' }),
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

const queries = vi.hoisted(() => ({
  detail: {
    data: undefined as TenantCustomerDetail | undefined,
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
    isFetching: false,
  },
  bookings: {
    data: undefined as { items: CustomerBooking[]; meta: unknown } | undefined,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  notes: {
    data: undefined as { items: CustomerNote[]; meta: unknown } | undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  documents: {
    data: undefined as CustomerDocument[] | undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  previews: { data: undefined as Record<string, string | null> | undefined },
  detailId: undefined as string | null | undefined,
  addNote: vi.fn(),
  upload: vi.fn(),
  setArchived: vi.fn(),
}));

const api = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('@/features/customers/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/customers/api')>();
  // Uỷ nhiệm qua closure: gán lại `api.download` trong từng test mới có tác dụng (bind thẳng
  // giá trị lúc dựng mock sẽ đóng băng vi.fn() của lần đầu).
  return {
    ...actual,
    fetchCustomerDocumentDownload: (...args: [string, string]) => api.download(...args),
  };
});

vi.mock('@/features/customers/hooks/use-customers', () => ({
  useCustomer: (id: string | null) => {
    queries.detailId = id;
    return queries.detail;
  },
  useCustomerBookings: () => queries.bookings,
  useCustomerNotes: () => queries.notes,
  useCustomerDocuments: () => queries.documents,
  useSetCustomerArchived: () => ({ mutate: queries.setArchived, isPending: false }),
  useAddCustomerNote: () => ({ mutate: queries.addNote, isPending: false }),
  useDeleteCustomerNote: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadCustomerDocument: () => ({ mutateAsync: queries.upload, isPending: false }),
  useDeleteCustomerDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useVerifyCustomerDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCustomerRisk: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateCustomer: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCustomer: () => ({ mutate: vi.fn(), isPending: false }),
  useInvalidateCustomers: () => vi.fn(),
  useCustomerDocumentPreviews: () => queries.previews,
}));

function detail(overrides: Partial<TenantCustomerDetail> = {}): TenantCustomerDetail {
  return {
    id: 'cus-1',
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    normalizedPhone: '84901234567',
    email: 'an@test.vn',
    address: '12 Lê Lợi, Quận 1',
    source: 'booking',
    riskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL,
    riskReason: null,
    hasAccount: true,
    archivedAt: null,
    createdAt: '2027-01-05T02:00:00.000Z',
    updatedAt: '2027-08-01T02:00:00.000Z',
    completedRentalCount: 6,
    activeBookingCount: 1,
    noShowCount: 0,
    lateReturnCount: 1,
    lastRentalAt: '2027-08-01T02:00:00.000Z',
    totalBookingAmount: '12750000',
    paidAmount: '10750000',
    debtAmount: '2000000',
    recentBookings: [],
    ...overrides,
  } as TenantCustomerDetail;
}

function booking(overrides: Partial<CustomerBooking> = {}): CustomerBooking {
  return {
    id: 'bk-1',
    code: 'DH0001',
    status: 'completed',
    serviceType: 'self_drive',
    vehicleName: 'Toyota Vios 2024',
    vehiclePlate: '51A-123.45',
    pickupAt: '2027-07-01T02:00:00.000Z',
    returnAt: '2027-07-03T02:00:00.000Z',
    totalAmount: '2400000',
    paidAmount: '2400000',
    debtAmount: '0',
    ...overrides,
  } as CustomerBooking;
}

function renderPage() {
  return render(
    <App>
      <CustomerDetailPage />
    </App>,
  );
}

const ALL_PERMISSIONS = [
  PERMISSION.CUSTOMER_VIEW,
  PERMISSION.CUSTOMER_MANAGE,
  PERMISSION.CUSTOMER_MANAGE_RISK,
  PERMISSION.CUSTOMER_DOCUMENT_MANAGE,
  PERMISSION.CUSTOMER_DOCUMENT_FILE_VIEW,
  PERMISSION.FINANCE_VIEW,
  PERMISSION.BOOKING_VIEW,
  PERMISSION.BOOKING_CREATE,
];

beforeEach(() => {
  permissions.granted = new Set(ALL_PERMISSIONS);
  layout.mobile = false;
  nav.push.mockClear();
  queries.detail = {
    data: detail(),
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
    isFetching: false,
  };
  queries.bookings = {
    data: { items: [booking()], meta: { page: 1, limit: 10, total: 1, hasNext: false } },
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
  queries.notes = {
    data: { items: [], meta: { page: 1, limit: 10, total: 0, hasNext: false } },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
  queries.documents = {
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
  queries.addNote = vi.fn();
  queries.upload = vi.fn();
  queries.setArchived = vi.fn();
  api.download = vi.fn();
  queries.previews = { data: undefined };
  queries.detailId = undefined;
});
afterEach(cleanup);

describe('/manage/customers/[id] — hồ sơ khách', () => {
  it('hiện danh tính, SĐT bấm gọi được và liên kết tài khoản', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Nguyễn Văn An' })).toBeTruthy();
    const tel = screen.getAllByRole('link', { name: '0901234567' })[0]!;
    expect(tel.getAttribute('href')).toBe('tel:0901234567');
    expect(screen.getByText('Đã liên kết')).toBeTruthy();
  });

  it('SĐT và email có nút sao chép, chép đúng giá trị', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    renderPage();
    // Hai nơi cùng hiện SĐT (tiêu đề + thẻ hồ sơ) nên có hai nút — bấm nút nào cũng ra một số.
    const copyPhone = screen.getAllByRole('button', { name: 'Sao chép số điện thoại' });
    expect(copyPhone.length).toBeGreaterThan(0);
    fireEvent.click(copyPhone[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('0901234567'));

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép email' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('an@test.vn'));
  });

  it('thiếu quyền: 403 có giải thích và KHÔNG gọi API hồ sơ', () => {
    permissions.granted = new Set();
    renderPage();
    expect(screen.getByText('Bạn chưa có quyền xem sổ khách')).toBeTruthy();
    expect(queries.detailId).toBeNull();
  });

  it('lỗi tải: có nút thử lại và lối về sổ khách', () => {
    const refetch = vi.fn();
    queries.detail = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: undefined,
      refetch,
      isFetching: false,
    };
    renderPage();
    expect(screen.getByText('Không mở được hồ sơ khách')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(refetch).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Về sổ khách' }));
    expect(nav.push).toHaveBeenCalledWith('/manage/customers');
  });

  it('có quyền tiền: hiện đủ ba thẻ tiền', () => {
    renderPage();
    expect(screen.getByText('Tổng giá trị thuê')).toBeTruthy();
    expect(screen.getByText('Đã thu')).toBeTruthy();
    expect(screen.getByText('Còn nợ')).toBeTruthy();
  });

  it('thiếu `finance.view`: ẩn HẲN thẻ tiền, không hiện số 0 giả', () => {
    permissions.granted = new Set([PERMISSION.CUSTOMER_VIEW, PERMISSION.BOOKING_VIEW]);
    renderPage();
    expect(screen.queryByText('Tổng giá trị thuê')).toBeNull();
    expect(screen.queryByText('Đã thu')).toBeNull();
    expect(screen.queryByText('Còn nợ')).toBeNull();
    // Chỉ số phi tài chính vẫn còn.
    expect(screen.getByText('Chuyến đã hoàn tất')).toBeTruthy();
  });

  it('hành động ẩn theo quyền', () => {
    permissions.granted = new Set([PERMISSION.CUSTOMER_VIEW]);
    renderPage();
    expect(screen.queryByRole('button', { name: /Sửa hồ sơ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mức rủi ro/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Lưu trữ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tạo đơn thuê/ })).toBeNull();
  });

  it('"Tạo đơn thuê" đi tới LUỒNG ĐƠN ĐÃ CÓ kèm khách điền sẵn — không dựng form thứ hai', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Tạo đơn thuê/ }));
    const target = nav.push.mock.calls.at(-1)?.[0] as string;
    expect(target.startsWith('/manage/bookings?create=1')).toBe(true);
    expect(target).toContain(encodeURIComponent('Nguyễn Văn An'));
    expect(target).toContain('0901234567');
  });

  it('khách bị từ chối phục vụ: cảnh báo nêu hệ quả, KHÔNG lập được đơn mới', () => {
    queries.detail.data = detail({
      riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED,
      riskReason: 'Gây hư hỏng xe, không bồi thường',
    });
    renderPage();
    expect(screen.getByText('Gian hàng đang từ chối phục vụ khách này')).toBeTruthy();
    expect(screen.getByText('Gây hư hỏng xe, không bồi thường')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tạo đơn thuê/ }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('khách cần lưu ý: nhắc nhưng KHÔNG chặn tạo đơn', () => {
    queries.detail.data = detail({
      riskLevel: TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST,
      riskReason: 'Từng trả xe muộn',
    });
    renderPage();
    expect(screen.getByText('Khách được đánh dấu cần lưu ý')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tạo đơn thuê/ }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('hồ sơ lưu trữ: báo rõ và đổi hành động thành khôi phục', () => {
    queries.detail.data = detail({ archivedAt: '2027-08-10T02:00:00.000Z' });
    renderPage();
    expect(screen.getByText('Hồ sơ đang lưu trữ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Khôi phục/ }));
    expect(queries.setArchived).toHaveBeenCalledWith(
      { id: 'cus-1', archived: false },
      expect.anything(),
    );
  });

  it('lịch sử thuê: có link tới chi tiết đơn khi đủ quyền', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Lịch sử thuê' }));
    await waitFor(() => expect(screen.getByText('Toyota Vios 2024')).toBeTruthy());
    const link = screen.getAllByRole('link', { name: 'DH0001' })[0]!;
    expect(link.getAttribute('href')).toBe('/manage/bookings/bk-1');
  });

  it('thiếu `bookings.view`: KHÔNG có tab lịch sử thuê', () => {
    permissions.granted = new Set([PERMISSION.CUSTOMER_VIEW, PERMISSION.FINANCE_VIEW]);
    renderPage();
    expect(screen.queryByRole('tab', { name: 'Lịch sử thuê' })).toBeNull();
  });

  it('ghi chú nội bộ: nói rõ khách không đọc được, và gửi được ghi chú mới', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Ghi chú nội bộ' }));
    await waitFor(() => expect(screen.getByText(/khách không bao giờ nhìn thấy/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Nội dung'), {
      target: { value: 'Khách quen, luôn trả đúng giờ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm ghi chú' }));

    await waitFor(() => expect(queries.addNote).toHaveBeenCalled());
    expect(queries.addNote.mock.calls[0]![0]).toMatchObject({
      id: 'cus-1',
      body: { noteType: TENANT_CUSTOMER_NOTE_TYPE.GENERAL, body: 'Khách quen, luôn trả đúng giờ' },
    });
  });

  it('ghi chú: thiếu `customers.manage` thì chỉ đọc, không có ô soạn', async () => {
    permissions.granted = new Set([PERMISSION.CUSTOMER_VIEW]);
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Ghi chú nội bộ' }));
    await waitFor(() => expect(screen.getByText('Chưa có ghi chú nào về khách này')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Thêm ghi chú' })).toBeNull();
  });

  it('giấy tờ: thiếu quyền xem tệp thì KHÔNG có nút mở tệp', async () => {
    queries.documents.data = [
      {
        id: 'doc-1',
        documentType: 'citizen_id',
        customTypeName: null,
        originalName: 'cccd.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12345,
        expiresAt: null,
        expiryStatus: 'no_expiry',
        uploadedByName: 'Chủ shop',
        createdAt: '2027-08-01T02:00:00.000Z',
      } as CustomerDocument,
    ];
    permissions.granted = new Set([PERMISSION.CUSTOMER_VIEW, PERMISSION.CUSTOMER_DOCUMENT_MANAGE]);
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Giấy tờ' }));

    // Tên tệp là mốc duy nhất — nhãn loại giấy tờ còn xuất hiện trong ô chọn của khối tải lên.
    await waitFor(() => expect(screen.getByText(/cccd.pdf/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Mở tệp/ })).toBeNull();
    // Thiếu quyền xem tệp thì KHÔNG có ảnh nào được nạp — ô chỉ còn icon loại tệp.
    expect(screen.queryByRole('img', { name: 'cccd.pdf' })).toBeNull();
    // Nhắc rõ tệp nằm ở kho riêng tư và mỗi lần mở đều được ghi nhật ký.
    expect(screen.getByText(/kho riêng tư/i)).toBeTruthy();
  });

  it('giấy tờ ẢNH: hiện ảnh thu nhỏ THẬT, bấm là mở trình xem ảnh dùng chung của app', async () => {
    queries.documents.data = [
      {
        id: 'doc-img',
        documentType: 'citizen_id',
        customTypeName: null,
        originalName: 'cccd-mat-truoc.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 22345,
        expiresAt: null,
        expiryStatus: 'no_expiry',
        uploadedByName: 'Chủ shop',
        createdAt: '2027-08-01T02:00:00.000Z',
      } as CustomerDocument,
    ];
    queries.previews = { data: { 'doc-img': 'https://r2.test/signed.jpg' } };

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Giấy tờ' }));

    // Ảnh thật trong danh sách — không phải icon giữ chỗ.
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'cccd-mat-truoc.jpg' })).toBeTruthy(),
    );
    const img = screen.getByRole('img', { name: 'cccd-mat-truoc.jpg' });
    expect(img.getAttribute('src')).toBe('https://r2.test/signed.jpg');

    // Ảnh đã bấm-là-phóng-to bằng trình xem chung, nên KHÔNG kèm nút mở tab.
    expect(screen.queryByRole('button', { name: /Mở tệp/ })).toBeNull();
  });
  it('giấy tờ PDF: vẫn mở bằng tab mới với URL ký xin ngay lúc bấm', async () => {
    queries.documents.data = [
      {
        id: 'doc-pdf',
        documentType: 'other',
        customTypeName: 'Hộ chiếu',
        originalName: 'passport.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12345,
        expiresAt: null,
        expiryStatus: 'no_expiry',
        uploadedByName: 'Chủ shop',
        createdAt: '2027-08-01T02:00:00.000Z',
      } as CustomerDocument,
    ];
    api.download = vi.fn().mockResolvedValue({
      downloadUrl: 'https://r2.test/signed.pdf',
      expiresAt: '2027-08-01T02:02:00.000Z',
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Giấy tờ' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Mở tệp/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Mở tệp/ }));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://r2.test/signed.pdf',
        '_blank',
        'noopener,noreferrer',
      ),
    );
    openSpy.mockRestore();
  });

  it('giấy tờ: tải lên hỏng thì báo lỗi và VẪN chọn lại tệp được', async () => {
    queries.upload.mockRejectedValue(new Error('Tải tệp lên thất bại'));
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Giấy tờ' }));
    await waitFor(() => expect(screen.getByLabelText('Loại giấy tờ')).toBeTruthy());

    const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput(), {
      target: { files: [new File(['x'], 'cccd.pdf', { type: 'application/pdf' })] },
    });

    await waitFor(() => expect(screen.getByText('Tải tệp lên thất bại')).toBeTruthy());
    expect(queries.upload).toHaveBeenCalledTimes(1);

    // Thử lại: nút tải lên vẫn ở đó và gọi lại được, không cần tải lại trang.
    // Ô chọn tệp được rc-upload thay mới sau mỗi lần chọn — phải tra lại, không giữ tham chiếu cũ.
    queries.upload.mockResolvedValue({});
    fireEvent.change(fileInput(), {
      target: { files: [new File(['y'], 'cccd-lai.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => expect(queries.upload).toHaveBeenCalledTimes(2));
  });
});
