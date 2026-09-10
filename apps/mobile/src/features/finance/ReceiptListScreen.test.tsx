import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import {
  FEATURE_STATE,
  PAYMENT_METHOD,
  PERMISSION,
  PLAN_FEATURE,
  RECEIPT_SOURCE,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { ReceiptListScreen } from './ReceiptListScreen';
import {
  financeCategoriesApi,
  receiptsApi,
  type FinanceCategory,
  type Receipt,
  type ReceiptSummary,
} from './api';

const mockPush = jest.fn();
const routeParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  /* Chạy callback lúc mount, cleanup lúc unmount — đủ để mô phỏng "màn đang focus". */
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => routeParams,
}));

/** Thanh trên của khu quản lý cần context Drawer — không thuộc phạm vi test màn sổ. */
jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

function user(
  permissions: Permission[],
  features: { feature: string; state: string }[] = [
    { feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.ENABLED },
  ],
): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Kế toán',
    email: 'ketoan@xeprime.test',
    avatarUrl: null,
    phone: '0902222222',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_staff',
      features,
      planCode: 'full_manage',
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  } as authApi.CurrentUser;
}

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: '01JQZX0000000000000000000R',
    receiptNo: 'PT-0001',
    type: RECEIPT_TYPE.INCOME,
    status: RECEIPT_STATUS.APPROVED,
    source: RECEIPT_SOURCE.MANUAL,
    amount: '1500000',
    paymentMethod: PAYMENT_METHOD.CASH,
    categoryId: 'cat-1',
    categoryName: 'Thanh toán đơn',
    bookingId: null,
    bookingCode: 'BK-0001',
    vehicleId: null,
    vehicleName: 'Vios',
    plateNumber: '51A-12345',
    tenantCustomerId: 'c1',
    customerName: 'Nguyễn Văn An',
    description: 'Thu nốt tiền thuê',
    occurredAt: '2026-09-01T02:00:00.000Z',
    createdAt: '2026-09-01T02:00:00.000Z',
    ...overrides,
  } as Receipt;
}

const SUMMARY: ReceiptSummary = {
  totalIncome: '1500000',
  totalExpense: '300000',
  balance: '1200000',
  incomeCash: '1000000',
  incomeTransfer: '500000',
  approvedCount: 4,
};

const CATEGORIES: FinanceCategory[] = [
  { id: 'cat-1', type: RECEIPT_TYPE.INCOME, name: 'Thanh toán đơn', isSystem: true },
  { id: 'cat-9', type: RECEIPT_TYPE.EXPENSE, name: 'Rửa xe', isSystem: false },
];

async function renderScreen(
  permissions: Permission[],
  options: {
    items?: Receipt[];
    total?: number;
    params?: Record<string, string>;
    features?: { feature: string; state: string }[];
  } = {},
) {
  const items = options.items ?? [receipt()];
  const total = options.total ?? items.length;

  for (const key of Object.keys(routeParams)) delete routeParams[key];
  Object.assign(routeParams, options.params ?? {});

  jest
    .spyOn(authApi, 'fetchCurrentUser')
    .mockResolvedValue(options.features ? user(permissions, options.features) : user(permissions));

  const listSpy = jest.spyOn(receiptsApi, 'list').mockResolvedValue({
    items,
    meta: { page: 1, limit: 20, total, hasNext: total > 20 },
  });
  const summarySpy = jest.spyOn(receiptsApi, 'summary').mockResolvedValue(SUMMARY);
  const categoriesSpy = jest.spyOn(financeCategoriesApi, 'list').mockResolvedValue(CATEGORIES);
  const detailSpy = jest.spyOn(receiptsApi, 'detail');

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  /*
   * Hàm chứ không phải một element dùng lại: `rerender` nhận ĐÚNG element cũ thì React được
   * phép bỏ qua cả cây con, và một test "tham số đổi thì màn cập nhật" sẽ đỏ vì lý do không liên
   * quan gì tới màn.
   */
  const makeUi = (): ReactElement =>
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <ReceiptListScreen />
        </QueryClientProvider>
      </ReduxProvider>,
    );
  const view = await render(makeUi());
  return { ...view, makeUi, listSpy, summarySpy, categoriesSpy, detailSpy };
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

/**
 * Sổ Thu-Chi (FIN-02) — ba thứ phải sống sót qua mọi lần sửa:
 *  1. thiếu `finance.view` thì KHÔNG một request tài chính nào được bắn đi;
 *  2. thẻ tổng cộng trên ĐÚNG bộ lọc đang xem, và khoá của nó không mang phân trang;
 *  3. phạm vi đến từ lối vào phải NHÌN THẤY ĐƯỢC — một cuốn sổ bị lọc âm thầm đọc ra là
 *     "gian hàng chỉ có ngần này phiếu".
 */
describe('ReceiptListScreen — quyền', () => {
  it('thiếu `finance.view`: hiện màn thiếu quyền và KHÔNG gọi API nào', async () => {
    const { findByText, listSpy, summarySpy, categoriesSpy } = await renderScreen([]);

    expect(await findByText('Không có quyền xem sổ thu chi')).toBeTruthy();
    expect(listSpy).not.toHaveBeenCalled();
    expect(summarySpy).not.toHaveBeenCalled();
    expect(categoriesSpy).not.toHaveBeenCalled();
  });

  it('có `finance.view` nhưng thiếu `receipt.create`: không có lối tạo phiếu', async () => {
    const { queryByLabelText, findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await findByText(/PT-0001/);
    expect(queryByLabelText('Tạo phiếu')).toBeNull();
  });

  it('có `receipt.create`: lối tạo phiếu hiện ra', async () => {
    const { findByLabelText } = await renderScreen([
      PERMISSION.FINANCE_VIEW,
      PERMISSION.RECEIPT_CREATE,
    ]);

    expect(await findByLabelText('Tạo phiếu')).toBeTruthy();
  });
});

describe('ReceiptListScreen — gói hết hạn (read_only)', () => {
  it('vẫn ĐỌC được sổ, nhưng nút tạo bị khoá và nói rõ lý do', async () => {
    const { findByText, findByLabelText } = await renderScreen(
      [PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_CREATE],
      {
        features: [{ feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.READ_ONLY }],
      },
    );

    // Dữ liệu cũ vẫn nguyên — "không ai mất quyền xem sổ sách của chính mình" (ADR 0027).
    expect(await findByText(/PT-0001/)).toBeTruthy();
    expect(
      await findByText('Gói đã hết hạn nên tính năng này chỉ xem được. Gia hạn để thao tác tiếp.'),
    ).toBeTruthy();

    const create = await findByLabelText('Tạo phiếu');
    expect(create.props.accessibilityState?.disabled).toBe(true);
  });
});

describe('ReceiptListScreen — phạm vi từ lối vào', () => {
  it('`tenantCustomerId` đi xuống API và hiện thành một viên gỡ được', async () => {
    const { listSpy, findByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      params: { tenantCustomerId: 'c1' },
    });

    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ tenantCustomerId: 'c1' })),
    );
    expect(await findByText('Khách hàng: Nguyễn Văn An')).toBeTruthy();
  });

  it('`sourceGroup` từ thẻ tổng cũng là một viên, nhãn dịch từ MÃ', async () => {
    const { listSpy, findByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      params: { sourceGroup: 'held_funds', status: RECEIPT_STATUS.APPROVED },
    });

    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sourceGroup: 'held_funds', status: 'approved' }),
      ),
    );
    expect(await findByText('Nguồn: Tiền giữ hộ')).toBeTruthy();
  });

  /**
   * Sổ Thu-Chi là một TAB, và tab được giữ sống sau lần mở đầu tiên.
   *
   * Bộ lọc chỉ đọc tham số ở `useState(...)` thì lần bấm THỨ HAI từ màn Tổng quan mở ra cuốn sổ
   * cũ với bộ lọc cũ — thẻ nói một đằng, danh sách nói một nẻo. Lần đầu vẫn đúng, nên chỉ có test
   * dựng lại với tham số MỚI mới bắt được.
   */
  it('quay lại sổ với bộ lọc MỚI thì áp dụng bộ lọc mới, không giữ bộ lọc của lần trước', async () => {
    const { makeUi, rerender, listSpy } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    listSpy.mockClear();

    Object.assign(routeParams, {
      type: RECEIPT_TYPE.EXPENSE,
      status: RECEIPT_STATUS.APPROVED,
      categoryId: 'cat-9',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    await rerender(makeUi());

    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RECEIPT_TYPE.EXPENSE,
          status: RECEIPT_STATUS.APPROVED,
          categoryId: 'cat-9',
          from: '2026-09-01',
          to: '2026-09-30',
        }),
      ),
    );
  });

  it('gỡ viên phạm vi thì bộ lọc đó biến khỏi request', async () => {
    const { listSpy, findByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      params: { vehicleId: 'v1' },
    });

    const chip = await findByText('Xe: Vios');
    await fireEvent.press(chip);

    await waitFor(() => {
      const last = listSpy.mock.calls[listSpy.mock.calls.length - 1]![0];
      expect(last.vehicleId).toBeUndefined();
    });
  });
});

describe('ReceiptListScreen — thẻ tổng', () => {
  it('thẻ tổng gọi CÙNG bộ lọc với danh sách', async () => {
    const { summarySpy, listSpy } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      params: { tenantCustomerId: 'c1', from: '2026-09-01', to: '2026-09-30' },
    });

    await waitFor(() => expect(summarySpy).toHaveBeenCalled());
    const summaryArgs = summarySpy.mock.calls[0]![0];
    const listArgs = listSpy.mock.calls[0]![0];
    expect(summaryArgs.tenantCustomerId).toBe(listArgs.tenantCustomerId);
    expect(summaryArgs.from).toBe(listArgs.from);
    expect(summaryArgs.to).toBe(listArgs.to);
  });

  /**
   * Khối thống kê MẶC ĐỊNH thu gọn — sổ là màn để tra một phiếu, không phải để đọc số tổng.
   *
   * Nên ba phép thử dưới đây đều phải MỞ nó ra trước. Chúng cũng chính là chỗ khoá cái mặc định
   * đó lại: nếu ai đó đổi về mở sẵn, `expand` sẽ đóng khối và cả ba cùng đỏ.
   */
  it('mặc định THU GỌN — mở ra thì hiện đủ các con số của bộ lọc đang xem', async () => {
    const { findByText, queryByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await findByText('THỐNG KÊ');
    expect(queryByText('1.500.000 ₫')).toBeNull();

    await fireEvent.press(await findByText('THỐNG KÊ'));

    expect(await findByText('1.500.000 ₫')).toBeTruthy();
    expect(await findByText('300.000 ₫')).toBeTruthy();
    expect(await findByText('1.200.000 ₫')).toBeTruthy();
  });

  it('không lọc gì thì chú thích nói "toàn bộ sổ"', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);
    await fireEvent.press(await findByText('THỐNG KÊ'));
    expect(await findByText('Toàn bộ sổ · phiếu chờ duyệt chưa tính')).toBeTruthy();
  });

  it('đang lọc thì chú thích đổi sang "trong bộ lọc đang xem"', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      params: { tenantCustomerId: 'c1' },
    });
    await fireEvent.press(await findByText('THỐNG KÊ'));
    expect(await findByText('Trong bộ lọc đang xem')).toBeTruthy();
  });
});

describe('ReceiptListScreen — rỗng và không có kết quả', () => {
  it('sổ chưa có phiếu nào: câu chữ "chưa có", không phải "không khớp"', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW], { items: [], total: 0 });
    expect(await findByText('Chưa có phiếu thu/chi nào')).toBeTruthy();
  });

  it('đang lọc mà rỗng: câu chữ "không khớp bộ lọc" kèm lối gỡ lọc', async () => {
    const { findByText, findAllByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      items: [],
      total: 0,
      params: { tenantCustomerId: 'c1' },
    });

    expect(await findByText('Không có phiếu khớp bộ lọc')).toBeTruthy();
    expect((await findAllByText('Xoá bộ lọc')).length).toBeGreaterThan(0);
  });

  /*
   * Sổ rỗng KHÔNG mọc thêm một nút tạo phiếu: nút đó đã nằm ở hàng tiêu đề, và danh sách rỗng thì
   * không có gì để cuộn nên hàng đó đứng nguyên trên màn — hai nút cùng một việc trong cùng một
   * khung hình. Test khoá đúng điều đó: lối tạo CÓ, và chỉ có MỘT.
   */
  it('rỗng + có quyền tạo: lối tạo nằm ở hàng tiêu đề, khối rỗng không nhân bản nó', async () => {
    const { findByLabelText, queryByText } = await renderScreen(
      [PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_CREATE],
      { items: [], total: 0 },
    );

    expect(await findByLabelText('Tạo phiếu')).toBeTruthy();
    expect(queryByText('Tạo phiếu đầu tiên')).toBeNull();
  });
});

describe('ReceiptListScreen — chi tiết phiếu', () => {
  it('chạm một thẻ mở CHI TIẾT — cùng một implementation cho mọi lối vào', async () => {
    const { findByLabelText, detailSpy } = await renderScreen([PERMISSION.FINANCE_VIEW]);
    detailSpy.mockResolvedValue({
      ...receipt(),
      attachments: [],
      updatedAt: '2026-09-01T02:00:00.000Z',
    } as never);

    await fireEvent.press(await findByLabelText('PT-0001 · + 1.500.000 ₫'));

    await waitFor(() => expect(detailSpy).toHaveBeenCalledWith('01JQZX0000000000000000000R'));
  });
});

describe('ReceiptListScreen — tiền', () => {
  it('phiếu THU mang dấu cộng, phiếu CHI mang dấu trừ — dấu là NGHĨA, không phải trang trí', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      items: [
        receipt({ id: 'r1', receiptNo: 'PT-0001', type: RECEIPT_TYPE.INCOME, amount: '1000000' }),
        receipt({ id: 'r2', receiptNo: 'PC-0002', type: RECEIPT_TYPE.EXPENSE, amount: '250000' }),
      ],
    });

    expect(await findByText('+ 1.000.000 ₫')).toBeTruthy();
    expect(await findByText('− 250.000 ₫')).toBeTruthy();
  });

  it('số tiền rất lớn không mất chính xác — chuỗi, không phải number (ADR 0007)', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      items: [receipt({ amount: '12345678901234' })],
    });

    expect(await findByText('+ 12.345.678.901.234 ₫')).toBeTruthy();
  });
});
