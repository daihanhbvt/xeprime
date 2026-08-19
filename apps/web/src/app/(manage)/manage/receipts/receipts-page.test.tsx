import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, type Permission } from '@xeprime/types';

import type { Receipt } from '@/features/finance/types';

import ReceiptsPage from './page';

/**
 * Test ĐẶC TẢ (characterization) cho `/manage/receipts` — viết TRƯỚC Wave 1C.
 *
 * Vì sao chọn trang này làm đại diện thứ ba: đây là **bề mặt có tiền**. Rủi ro cao nhất trong
 * cả wave nằm ở đây (06 Wave 3D). Ba thứ phải sống sót qua mọi lần gom:
 *  1. cột hành động **biến mất hoàn toàn** khi thiếu `finance.receipt.approve`
 *  2. "Duyệt" chỉ xuất hiện ở đúng hai trạng thái; "Huỷ" biến mất khi phiếu đã huỷ
 *  3. dấu `+` / `−` trước số tiền là **thông tin nghiệp vụ**, không phải trang trí
 *
 * Ngoài ra trang này giữ một khác biệt lặng lẽ: `hasFilters` chỉ đếm `type` và `status`, bỏ qua
 * `categoryId`/`from`/`to`. Test bên dưới ghi lại nguyên trạng, KHÔNG sửa (chỉ thị 1C-A mục 10).
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/receipts',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastFilters: undefined as unknown,
}));

vi.mock('@/features/finance/hooks/use-receipts', () => ({
  useReceipts: (filters: unknown) => {
    query.lastFilters = filters;
    return query;
  },
}));

/**
 * Thẻ tổng và danh mục lọc là hai truy vấn RIÊNG. Stub ở đây để test vẫn chỉ nói về bảng và
 * bộ lọc — thẻ tổng có bề mặt riêng, không phải thứ trang này chịu trách nhiệm chứng minh.
 */
const summaryQuery = vi.hoisted(() => ({
  data: {
    totalIncome: '1500000',
    totalExpense: '0',
    balance: '1500000',
    incomeCash: '1500000',
    incomeTransfer: '0',
    approvedCount: 1,
  } as unknown,
  isFetching: false,
  isError: false,
  lastFilters: undefined as unknown,
}));

vi.mock('@/features/finance/hooks/use-receipt-summary', () => ({
  useReceiptSummary: (filters: unknown) => {
    summaryQuery.lastFilters = filters;
    return summaryQuery;
  },
}));

vi.mock('@/features/finance/hooks/use-finance-categories', () => ({
  useFinanceCategories: () => ({ data: [], isFetching: false }),
}));

const approve = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const cancel = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/features/finance/hooks/use-receipt-mutations', () => ({
  useApproveReceipt: () => approve,
  useCancelReceipt: () => cancel,
}));

/** Hai overlay của trang đã có test riêng — stub để test này chỉ nói về trang danh sách. */
const overlays = vi.hoisted(() => ({ formOpen: false, categoriesOpen: false }));

vi.mock('@/features/finance/components/ReceiptFormDrawer', () => ({
  ReceiptFormDrawer: ({ open }: { open: boolean }) => {
    overlays.formOpen = open;
    return open ? <div data-testid="receipt-form" /> : null;
  },
}));

vi.mock('@/features/finance/components/ReceiptDetailDrawer', () => ({
  ReceiptDetailDrawer: ({ receiptId }: { receiptId: string | null }) =>
    receiptId ? <div data-testid="receipt-detail">{receiptId}</div> : null,
}));

vi.mock('@/features/finance/components/CategoryManagerModal', () => ({
  CategoryManagerModal: ({ open }: { open: boolean }) => {
    overlays.categoriesOpen = open;
    return open ? <div data-testid="category-manager" /> : null;
  },
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

/* ------------------------------------------------------------------ dữ liệu mẫu */

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1',
    receiptNo: 'PT-0001',
    type: 'income',
    status: 'pending_approval',
    // Mặc định NHẬP TAY: phiếu tự động có luật riêng (không huỷ trực tiếp được), nên test nào
    // muốn nói về nó phải nói ra tường minh chứ không thừa hưởng im lặng.
    source: 'manual',
    sourceRefId: null,
    amount: '1500000',
    paymentMethod: 'cash',
    categoryName: 'Tiền thuê xe',
    description: 'Thu tiền đơn XP-001',
    occurredAt: '2026-08-01T03:00:00.000Z',
    createdAt: '2026-08-01T03:00:00.000Z',
    ...over,
  };
}

const META = { page: 1, limit: 20, total: 1, hasNext: false };

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

/**
 * Cấp quyền cho một test.
 *
 * `finance.view` luôn được cấp kèm vì từ epic nối tiền, THIẾU nó là trang thay toàn bộ nội dung
 * bằng màn "không có quyền" — mọi test nói về bảng/bộ lọc đều giả định đã vào được trang. Trường
 * hợp không có quyền có test riêng, dùng `grantNothing()`.
 */
function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>([PERMISSION.FINANCE_VIEW, ...permissions]);
}

function grantNothing() {
  perms.granted = new Set<string>();
}

function renderPage() {
  return render(
    <App>
      <ReceiptsPage />
    </App>,
  );
}

function lastReplacedUrl(): string {
  const calls = nav.replace.mock.calls;
  return calls.length ? (calls[calls.length - 1]![0] as string) : '';
}

function bodyRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

/**
 * ⚠️ GIỚI HẠN ĐÃ BIẾT của bộ test này.
 *
 * `Select` của AntD 6 KHÔNG chốt được lựa chọn dưới jsdom bằng sự kiện tổng hợp — đã thử cả
 * `click` trên mục `role="option"` lẫn đường bàn phím `ArrowDown`/`Enter`, `onChange` không chạy.
 * Vì vậy đường "đổi filter bằng dropdown → ghi URL" KHÔNG được phủ ở đây.
 *
 * Cùng hợp đồng đó vẫn được khoá qua hai đường chạy thật trong jsdom:
 *  - `URL → filters`: khẳng định trên `query.lastFilters` (đọc tham số),
 *  - `filters → URL`: khẳng định trên `router.replace` khi bấm nút "Xoá bộ lọc" và khi đổi trang.
 *
 * KHÔNG dùng khẳng định phủ định (`not.toContain`) một mình cho đường ghi URL: nếu tương tác
 * không chạy thì URL là chuỗi rỗng và phép phủ định đó đúng một cách vô nghĩa. Mọi test ghi URL
 * dưới đây đều kèm một khẳng định KHẲNG ĐỊNH (`toHaveBeenCalledTimes` / `toContain`).
 */

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  query.refetch.mockReset();
  approve.mutate.mockReset();
  cancel.mutate.mockReset();
  overlays.formOpen = false;
  overlays.categoriesOpen = false;
  setQuery();
  grant();
});

afterEach(cleanup);

/* ------------------------------------------------------------------ tải / lỗi */

describe('/manage/receipts — tải và lỗi', () => {
  it('lần tải đầu hiện trạng thái chờ, chưa nói "chưa có phiếu"', () => {
    // ĐỔI CÓ CHỦ ĐÍCH ở Wave 1C-E: skeleton thay cho bảng rỗng + spinner (Figma `134:2011` R1).
    setQuery({ isFetching: true });
    renderPage();

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Chưa có phiếu thu/chi nào')).toBeNull();
  });

  it('lỗi khi chưa có dữ liệu: câu chữ riêng của module kèm Thử lại', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách phiếu')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('Thử lại gọi refetch', () => {
    setQuery({ isError: true });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('lỗi khi ĐÃ có dữ liệu thì giữ bảng', () => {
    setQuery({ isError: true, data: { items: [receipt()], meta: META } });
    renderPage();

    expect(screen.getByText('PT-0001')).toBeTruthy();
    expect(screen.queryByText('Không tải được danh sách phiếu')).toBeNull();
  });

  it('thanh lọc vẫn hiện trong lúc tải và cả khi lỗi', () => {
    // Wave "nối tiền": hai `<Select>` thô đổi sang `FilterBar` dùng chung (được thêm kiểu trường
    // `dateRange` CHÍNH VÌ trang này). Điều được khoá vẫn là "lỗi không nuốt mất thanh lọc".
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByPlaceholderText(/Mã phiếu/)).toBeTruthy();
    expect(screen.getByText('Loại')).toBeTruthy();
    expect(screen.getByText('Trạng thái')).toBeTruthy();
  });

  it('thiếu finance.view: thay TOÀN BỘ trang bằng màn không-có-quyền', () => {
    // Trước đây trang vẫn dựng đủ tiêu đề + bộ lọc + một bảng lỗi 403 — trông như hỏng chứ không
    // như "bạn không được vào". Chặn thật vẫn là guard backend; đây là lớp trải nghiệm.
    grantNothing();
    setQuery({ data: { items: [receipt()], meta: META } });
    renderPage();

    expect(screen.getByText('Không có quyền xem sổ thu chi')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByPlaceholderText(/Mã phiếu/)).toBeNull();
  });
});

/* ------------------------------------------------------------------ rỗng vs không-kết-quả */

describe('/manage/receipts — rỗng và không có kết quả', () => {
  it('không lọc và rỗng: "Chưa có phiếu thu/chi nào"', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có phiếu thu/chi nào')).toBeTruthy();
  });

  it('rỗng + có quyền tạo: mở lối tạo phiếu đầu tiên', () => {
    grant(PERMISSION.RECEIPT_CREATE);
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Tạo phiếu đầu tiên/ }));
    expect(screen.getByTestId('receipt-form')).toBeTruthy();
  });

  it('rỗng + KHÔNG có quyền tạo: không có lối tạo nào', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.queryByRole('button', { name: /Tạo phiếu/ })).toBeNull();
  });

  it('lọc theo loại và rỗng: chuyển sang câu chữ không-có-kết-quả', () => {
    nav.params = new URLSearchParams('type=expense');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có phiếu khớp bộ lọc')).toBeTruthy();
    // Hai lối xoá: một trên thanh lọc, một trong khối "không có kết quả" — cả hai đều hợp lệ.
    expect(screen.getAllByRole('button', { name: 'Xoá bộ lọc' }).length).toBeGreaterThan(0);
  });

  it('lọc theo khoảng ngày / danh mục RA RỖNG cũng là "không có kết quả"', () => {
    // ĐÃ SỬA (epic nối tiền): `hasFilters` trước đây chỉ đọc `type`/`status`, nên lọc theo ngày
    // ra rỗng lại báo "Chưa có phiếu thu/chi nào" — người dùng đóng màn hình vì tưởng chưa nhập
    // gì, trong khi chỉ là lọc quá tay. Nay mọi filter đều được đếm.
    nav.params = new URLSearchParams('from=2026-01-01&to=2026-01-31&categoryId=c1');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có phiếu khớp bộ lọc')).toBeTruthy();
    expect(screen.queryByText('Chưa có phiếu thu/chi nào')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Xoá bộ lọc' }).length).toBeGreaterThan(0);
  });

  it('"Xoá bộ lọc" xoá HẾT mọi filter, kể cả khoảng ngày, và đưa về trang 1', () => {
    // Cũng đã sửa: giữ lại `from` khi người dùng bấm "Xoá bộ lọc" là không làm đúng thứ nút đó
    // hứa, và họ không có cách nào khác để về danh sách đầy đủ.
    nav.params = new URLSearchParams('type=income&status=draft&from=2026-01-01&q=abc&page=6');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(screen.getAllByRole('button', { name: 'Xoá bộ lọc' })[0]!);

    // Khẳng định KHẲNG ĐỊNH trước: chứng minh tương tác thật sự ghi URL, để các phép phủ định
    // bên dưới không thể đúng một cách vô nghĩa.
    expect(nav.replace).toHaveBeenCalled();
    const url = lastReplacedUrl();
    expect(url).toContain('/manage/receipts');
    expect(url).not.toContain('type=');
    expect(url).not.toContain('status=');
    expect(url).not.toContain('from=');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('page=');
  });
});

/* ------------------------------------------------------------------ tiền + dữ liệu */

describe('/manage/receipts — hiển thị tiền', () => {
  it('phiếu thu hiện dấu cộng trước số tiền đã định dạng', () => {
    setQuery({ data: { items: [receipt({ type: 'income', amount: '1500000' })], meta: META } });
    renderPage();

    expect(screen.getByText('+1.500.000 ₫')).toBeTruthy();
  });

  it('phiếu chi hiện dấu trừ — dấu là NGHĨA nghiệp vụ, không phải trang trí', () => {
    setQuery({ data: { items: [receipt({ type: 'expense', amount: '1500000' })], meta: META } });
    renderPage();

    // Dấu trừ U+2212, không phải hyphen.
    expect(screen.getByText('−1.500.000 ₫')).toBeTruthy();
  });

  it('số tiền rất lớn không mất chính xác (ADR 0007 — chuỗi, không phải number)', () => {
    setQuery({ data: { items: [receipt({ amount: '999999999999' })], meta: META } });
    renderPage();

    expect(screen.getByText('+999.999.999.999 ₫')).toBeTruthy();
  });

  it('hiện mã phiếu, danh mục, diễn giải và hình thức thanh toán', () => {
    setQuery({ data: { items: [receipt()], meta: META } });
    renderPage();

    expect(screen.getByText('PT-0001')).toBeTruthy();
    expect(screen.getByText('Tiền thuê xe')).toBeTruthy();
    expect(screen.getByText('Thu tiền đơn XP-001')).toBeTruthy();
    expect(screen.getByText('Tiền mặt')).toBeTruthy();
  });

  it('thiếu mã phiếu / danh mục / diễn giải thì hiện gạch ngang', () => {
    setQuery({
      data: {
        items: [receipt({ receiptNo: null, categoryName: null, description: null })],
        meta: META,
      },
    });
    renderPage();

    expect(within(bodyRows()[0]!).getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });
});

/* ------------------------------------------------------------------ quyền + hành động tiền */

describe('/manage/receipts — quyền và hành động ảnh hưởng tiền', () => {
  it('KHÔNG có quyền duyệt: hàng không có hành động nào', () => {
    setQuery({ data: { items: [receipt()], meta: META } });
    renderPage();

    expect(within(bodyRows()[0]!).queryAllByRole('button')).toHaveLength(0);
  });

  it('có quyền duyệt: phiếu chờ duyệt có cả Duyệt và Huỷ', () => {
    grant(PERMISSION.RECEIPT_APPROVE);
    setQuery({ data: { items: [receipt({ status: 'pending_approval' })], meta: META } });
    renderPage();

    const row = bodyRows()[0]!;
    expect(within(row).getByRole('button', { name: 'Duyệt' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Huỷ' })).toBeTruthy();
  });

  it('phiếu nháp cũng duyệt được', () => {
    grant(PERMISSION.RECEIPT_APPROVE);
    setQuery({ data: { items: [receipt({ status: 'draft' })], meta: META } });
    renderPage();

    expect(within(bodyRows()[0]!).getByRole('button', { name: 'Duyệt' })).toBeTruthy();
  });

  it('phiếu ĐÃ duyệt thì không duyệt lại được, nhưng vẫn huỷ được', () => {
    grant(PERMISSION.RECEIPT_APPROVE);
    setQuery({ data: { items: [receipt({ status: 'approved' })], meta: META } });
    renderPage();

    const row = bodyRows()[0]!;
    expect(within(row).queryByRole('button', { name: 'Duyệt' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Huỷ' })).toBeTruthy();
  });

  it('phiếu ĐÃ huỷ thì không còn hành động nào', () => {
    grant(PERMISSION.RECEIPT_APPROVE);
    setQuery({ data: { items: [receipt({ status: 'cancelled' })], meta: META } });
    renderPage();

    expect(within(bodyRows()[0]!).queryAllByRole('button')).toHaveLength(0);
  });

  it('duyệt phiếu phải xác nhận trước, rồi gọi mutation với đúng id', async () => {
    grant(PERMISSION.RECEIPT_APPROVE);
    setQuery({ data: { items: [receipt({ id: 'r-42' })], meta: META } });
    renderPage();

    fireEvent.click(within(bodyRows()[0]!).getByRole('button', { name: 'Duyệt' }));
    expect(approve.mutate).not.toHaveBeenCalled();

    expect(await screen.findByText('Duyệt phiếu này?')).toBeTruthy();
    // Nút xác nhận trong Popconfirm cũng mang nhãn "Duyệt"; lấy nút cuối = nút trong popup.
    const confirmButtons = screen.getAllByRole('button', { name: 'Duyệt' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(approve.mutate).toHaveBeenCalledTimes(1));
    expect(approve.mutate.mock.calls[0]![0]).toBe('r-42');
  });

  it('huỷ phiếu phải xác nhận, gọi mutation dạng object { id }', async () => {
    grant(PERMISSION.RECEIPT_APPROVE);
    setQuery({ data: { items: [receipt({ id: 'r-7' })], meta: META } });
    renderPage();

    fireEvent.click(within(bodyRows()[0]!).getByRole('button', { name: 'Huỷ' }));
    expect(cancel.mutate).not.toHaveBeenCalled();

    expect(await screen.findByText('Huỷ phiếu này?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ phiếu' }));

    await waitFor(() => expect(cancel.mutate).toHaveBeenCalledTimes(1));
    // Hợp đồng khác `approve` (chuỗi id) — giữ nguyên khi gom `RowActions`.
    expect(cancel.mutate.mock.calls[0]![0]).toEqual({ id: 'r-7' });
  });

  it('quyền tạo mở nút "Tạo phiếu" ở đầu trang', () => {
    grant(PERMISSION.RECEIPT_CREATE);
    setQuery({ data: { items: [receipt()], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Tạo phiếu/ }));
    expect(screen.getByTestId('receipt-form')).toBeTruthy();
  });

  it('nút "Danh mục" luôn mở được, không phụ thuộc quyền', () => {
    setQuery({ data: { items: [receipt()], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Danh mục/ }));
    expect(screen.getByTestId('category-manager')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ filter + phân trang */

describe('/manage/receipts — filter và phân trang', () => {
  it('filter từ URL truyền nguyên vẹn xuống lớp dữ liệu', () => {
    nav.params = new URLSearchParams(
      'type=income&status=approved&categoryId=c9&from=2026-01-01&to=2026-01-31&page=2&limit=50',
    );
    setQuery({ data: { items: [receipt()], meta: META } });
    renderPage();

    expect(query.lastFilters).toEqual({
      type: 'income',
      status: 'approved',
      categoryId: 'c9',
      from: '2026-01-01',
      to: '2026-01-31',
      page: 2,
      limit: 50,
    });
  });

  it('hai select lọc hiển thị lựa chọn hiện tại lấy từ URL', () => {
    nav.params = new URLSearchParams('type=expense&status=approved');
    setQuery({ data: { items: [receipt()], meta: META } });
    renderPage();

    const [typeSelect, statusSelect] = screen.getAllByRole('combobox');
    expect(typeSelect!.closest('[title]')?.getAttribute('title')).toBe('Phiếu chi');
    expect(statusSelect!.closest('[title]')?.getAttribute('title')).toBe('Đã duyệt');
  });

  it('đổi trang ghi page và limit vào URL', () => {
    setQuery({
      data: { items: [receipt()], meta: { page: 1, limit: 20, total: 60, hasNext: true } },
    });
    renderPage();

    fireEvent.click(screen.getByTitle('2'));

    const url = lastReplacedUrl();
    expect(url).toContain('page=2');
    expect(url).toContain('limit=20');
  });

  it('tổng số hiển thị theo đơn vị "phiếu"', () => {
    setQuery({ data: { items: [receipt()], meta: { ...META, total: 245 } } });
    renderPage();

    expect(screen.getByText('245 phiếu')).toBeTruthy();
  });

  it('có ô tìm kiếm, và chuỗi gõ vào đi thẳng xuống lớp dữ liệu', () => {
    // Figma `127:2339` xếp 07 Finance là "✅ Có search"; code trước đây thì không (chênh lệch ghi
    // ở P24). Epic nối tiền đóng chênh lệch đó — backend tìm mã phiếu / mã tra soát / mã đơn.
    nav.params = new URLSearchParams('q=PT-0001');
    setQuery({ data: { items: [receipt()], meta: META } });
    renderPage();

    expect(screen.getByPlaceholderText(/Mã phiếu/)).toBeTruthy();
    expect(query.lastFilters).toMatchObject({ q: 'PT-0001' });
  });

  it('bấm một dòng mở chi tiết phiếu', () => {
    // `GET /receipts/:id` tồn tại từ Phase 6 mà không giao diện nào gọi — đây là đường vào nó.
    setQuery({ data: { items: [receipt({ id: 'r-42' })], meta: META } });
    renderPage();

    fireEvent.click(screen.getByText('PT-0001'));
    expect(screen.getByTestId('receipt-detail').textContent).toBe('r-42');
  });

  it('phiếu TỰ ĐỘNG không có hành động Huỷ — đảo phải đi qua nghiệp vụ gốc', () => {
    grant(PERMISSION.RECEIPT_APPROVE);
    setQuery({
      data: {
        items: [receipt({ status: 'approved', source: 'payment', sourceRefId: 'p1' })],
        meta: META,
      },
    });
    renderPage();

    // Backend đã chặn bằng `RECEIPT_SOURCE_LOCKED`; ẩn nút để người dùng không bấm vào một hành
    // động chắc chắn thất bại.
    expect(screen.queryByRole('button', { name: 'Huỷ' })).toBeNull();
  });
});
