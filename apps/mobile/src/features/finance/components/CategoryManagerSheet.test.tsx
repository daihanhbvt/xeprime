import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import {
  FEATURE_STATE,
  PERMISSION,
  PLAN_FEATURE,
  RECEIPT_TYPE,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { CategoryManagerSheet } from './CategoryManagerSheet';
import { financeCategoriesApi, type FinanceCategory } from '../api';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const CATEGORIES: FinanceCategory[] = [
  { id: 'cat-1', type: RECEIPT_TYPE.INCOME, name: 'Thanh toán đơn', isSystem: true },
  { id: 'cat-9', type: RECEIPT_TYPE.EXPENSE, name: 'Rửa xe', isSystem: false },
];

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

async function renderSheet(
  permissions: Permission[],
  options: { features?: { feature: string; state: string }[]; failList?: boolean } = {},
) {
  jest
    .spyOn(authApi, 'fetchCurrentUser')
    .mockResolvedValue(options.features ? user(permissions, options.features) : user(permissions));

  const listSpy = jest.spyOn(financeCategoriesApi, 'list');
  if (options.failList) listSpy.mockRejectedValue(new Error('boom'));
  else listSpy.mockResolvedValue(CATEGORIES);

  const createSpy = jest.spyOn(financeCategoriesApi, 'create').mockResolvedValue({
    id: 'cat-10',
    type: RECEIPT_TYPE.EXPENSE,
    name: 'Gửi bãi',
    isSystem: false,
  });
  const removeSpy = jest.spyOn(financeCategoriesApi, 'remove').mockResolvedValue(undefined);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <CategoryManagerSheet open onClose={jest.fn()} />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  const view = await render(ui);
  return { ...view, listSpy, createSpy, removeSpy };
}

afterEach(() => jest.restoreAllMocks());

/**
 * Danh mục thu chi (FIN-03). Luật quan trọng nhất: **danh mục HỆ THỐNG không xoá được** — chúng
 * là đích của phiếu tự động (`system_key`), xoá một cái là mọi phiếu bảo dưỡng sau đó mất danh
 * mục. Ẩn nút ở đây chỉ là chỉ dẫn; backend mới là lớp chặn.
 */
describe('CategoryManagerSheet', () => {
  it('liệt kê danh mục kèm nhãn Thu/Chi và NGUỒN của từng danh mục', async () => {
    const { findByText } = await renderSheet([PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_CREATE]);

    expect(await findByText('Thanh toán đơn')).toBeTruthy();
    expect(await findByText('Rửa xe')).toBeTruthy();
    /*
      CẢ HAI nguồn đều có nhãn. Chỉ gắn nhãn cho danh mục hệ thống thì hàng không nhãn đọc ra là
      "chưa tải xong" chứ không phải "của gian hàng tự thêm" — mà đó mới là điều nói cho người
      dùng biết hàng nào xoá được.
    */
    expect(await findByText('Hệ thống')).toBeTruthy();
    expect(await findByText('Tự tạo')).toBeTruthy();
  });

  it('chỉ danh mục KHÔNG phải hệ thống mới có nút xoá', async () => {
    const { findAllByLabelText } = await renderSheet([
      PERMISSION.FINANCE_VIEW,
      PERMISSION.RECEIPT_CREATE,
    ]);

    const deletes = await findAllByLabelText('Xoá danh mục');
    expect(deletes).toHaveLength(1);
  });

  it('xoá phải XÁC NHẬN trước — một cú chạm nhầm không được xoá danh mục của gian hàng', async () => {
    const { findAllByLabelText, findByText, removeSpy } = await renderSheet([
      PERMISSION.FINANCE_VIEW,
      PERMISSION.RECEIPT_CREATE,
    ]);

    await fireEvent.press((await findAllByLabelText('Xoá danh mục'))[0]!);
    expect(removeSpy).not.toHaveBeenCalled();

    await fireEvent.press(await findByText('Xoá'));
    await waitFor(() => expect(removeSpy).toHaveBeenCalledWith('cat-9'));
  });

  it('thêm danh mục: gửi tên đã trim và dọn ô nhập', async () => {
    const { findByPlaceholderText, findByText, createSpy } = await renderSheet([
      PERMISSION.FINANCE_VIEW,
      PERMISSION.RECEIPT_CREATE,
    ]);

    const input = await findByPlaceholderText('Tên danh mục mới');
    await fireEvent.changeText(input, '  Gửi bãi  ');
    await fireEvent.press(await findByText('Thêm'));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({ type: 'expense', name: 'Gửi bãi' }),
    );
  });

  it('thiếu `receipt.create`: chỉ ĐỌC được danh mục, không có ô thêm và không có nút xoá', async () => {
    const { findByText, queryByText, queryByLabelText } = await renderSheet([
      PERMISSION.FINANCE_VIEW,
    ]);

    expect(await findByText('Rửa xe')).toBeTruthy();
    expect(queryByText('Thêm')).toBeNull();
    expect(queryByLabelText('Xoá danh mục')).toBeNull();
  });

  it('gói hết hạn: đọc được danh mục, nhưng không thêm được và nói rõ lý do', async () => {
    const { findByText, queryByText } = await renderSheet(
      [PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_CREATE],
      { features: [{ feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.READ_ONLY }] },
    );

    expect(await findByText('Rửa xe')).toBeTruthy();
    expect(
      await findByText('Gói đã hết hạn nên tính năng này chỉ xem được. Gia hạn để thao tác tiếp.'),
    ).toBeTruthy();
    expect(queryByText('Thêm')).toBeNull();
  });

  it('tải hỏng: báo LỖI kèm lối thử lại, không giả thành danh sách rỗng', async () => {
    const { findByText } = await renderSheet([PERMISSION.FINANCE_VIEW], { failList: true });

    expect(await findByText('Không tải được dữ liệu')).toBeTruthy();
    expect(await findByText('Thử lại')).toBeTruthy();
  });
});
