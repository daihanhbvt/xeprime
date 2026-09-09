import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  BRANCH_STATUS,
  FEATURE_STATE,
  type FeatureState,
  PERMISSION,
  PLAN_FEATURE,
  type PlanFeature,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { locationsApi } from '@/features/locations/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { branchesApi, BRANCH_ACTION, type Branch, type BranchList } from './api';
import { branchScopeReset } from './branch-scope.slice';
import { BranchListScreen } from './BranchListScreen';

/** Cờ NĂNG LỰC THEO GÓI đi kèm phiên — union, không phải chuỗi trần (ADR 0005). */
type TenantFeature = { feature: PlanFeature; state: FeatureState };

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

function currentUser(
  permissions: Permission[],
  features: authApi.CurrentUser['tenant'] extends null ? never : TenantFeature[] = [],
): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Chủ shop',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_owner',
      features,
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  };
}

function branch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: '01JQZX0000000000000000000B',
    code: 'CN01',
    name: 'Chi nhánh Hải Châu',
    provinceCode: '48',
    provinceName: 'Đà Nẵng',
    address: '12 Bạch Đằng',
    phone: '0901234567',
    latitude: null,
    longitude: null,
    isDefault: true,
    status: BRANCH_STATUS.ACTIVE,
    vehicleCount: 4,
    needsLocationReview: false,
    legacyProvinceValue: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const SECOND = branch({
  id: '01JQZX0000000000000000000C',
  code: 'CN02',
  name: 'Chi nhánh Sơn Trà',
  isDefault: false,
  vehicleCount: 2,
});

function list(items: Branch[]): BranchList {
  return {
    items,
    total: items.length,
    activeCount: items.filter((b) => b.status === BRANCH_STATUS.ACTIVE).length,
    needsReviewCount: items.filter((b) => b.needsLocationReview).length,
  };
}

async function renderScreen(
  permissions: Permission[],
  items: Branch[] = [branch(), SECOND],
  features: TenantFeature[] = [],
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser(permissions, features));
  jest
    .spyOn(locationsApi, 'provinces')
    .mockResolvedValue([
      { code: '48', name: 'Đà Nẵng', administrativeType: 'municipality', slug: 'da-nang' },
    ]);
  const listSpy = jest.spyOn(branchesApi, 'list').mockResolvedValue(list(items));
  const createSpy = jest.spyOn(branchesApi, 'create').mockResolvedValue(SECOND);
  const actionSpy = jest.spyOn(branchesApi, 'action').mockResolvedValue(SECOND);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <BranchListScreen />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, listSpy, createSpy, actionSpy };
}

beforeEach(() => {
  jest.restoreAllMocks();
  store.dispatch(branchScopeReset());
});

describe('BranchListScreen — quyền', () => {
  it('thiếu `branches.view`: màn thiếu quyền, KHÔNG gọi API', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);

    expect(await view.findByText('Bạn không có quyền xem chi nhánh')).toBeTruthy();
    expect(view.listSpy).not.toHaveBeenCalled();
  });

  it('có xem, thiếu `branches.manage`: KHÔNG có nút thêm và không có hàng thao tác', async () => {
    const view = await renderScreen([PERMISSION.BRANCH_VIEW]);

    await view.findByText('Chi nhánh Hải Châu');
    expect(view.queryByLabelText('Thêm chi nhánh')).toBeNull();
    expect(view.queryByText('Đặt làm mặc định')).toBeNull();
  });

  it('có `branches.manage`: đủ nút thêm/sửa/đặt mặc định/ngừng', async () => {
    const view = await renderScreen([PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE]);

    await view.findByText('Chi nhánh Sơn Trà');
    expect(view.getByLabelText('Thêm chi nhánh')).toBeTruthy();
    expect(view.getByText('Đặt làm mặc định')).toBeTruthy();
    expect(view.getAllByText('Sửa').length).toBeGreaterThan(0);
  });
});

describe('BranchListScreen — luật nghiệp vụ hiện thành LÝ DO, không thành nút biến mất', () => {
  it('chi nhánh MẶC ĐỊNH: nút ngừng bị khoá kèm lý do', async () => {
    const view = await renderScreen([PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE], [branch()]);

    await view.findByText('Chi nhánh Hải Châu');
    expect(
      view.getByText('Chi nhánh mặc định không thể ngừng — đặt chi nhánh khác làm mặc định trước'),
    ).toBeTruthy();
  });

  it('chi nhánh chưa có tỉnh: không đặt làm mặc định được, và nói ra vì sao', async () => {
    const view = await renderScreen(
      [PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE],
      [
        branch(),
        branch({
          id: '01JQZX0000000000000000000D',
          code: 'CN03',
          name: 'Chi nhánh cũ',
          isDefault: false,
          provinceCode: null,
          provinceName: null,
          needsLocationReview: true,
        }),
      ],
    );

    await view.findByText('Chi nhánh cũ');
    expect(view.getByText('Chi nhánh chưa có tỉnh/thành')).toBeTruthy();
    // Dải cảnh báo đầu danh sách cũng phải nói ra hệ quả: xe không lên chợ được.
    expect(
      view.getByText(
        'Xe thuộc các chi nhánh này KHÔNG hiển thị trên marketplace cho tới khi bạn bổ sung tỉnh/thành.',
      ),
    ).toBeTruthy();
  });

  it('chi nhánh đang ngừng: không đặt làm mặc định được', async () => {
    const view = await renderScreen(
      [PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE],
      [branch(), branch({ ...SECOND, status: BRANCH_STATUS.INACTIVE })],
    );

    await view.findByText('Chi nhánh Sơn Trà');
    expect(view.getByText('Chi nhánh đang ngừng hoạt động')).toBeTruthy();
    // Ngừng rồi thì nút phải là "Bật lại", không phải "Ngừng hoạt động".
    expect(view.getByText('Bật lại')).toBeTruthy();
  });
});

describe('BranchListScreen — gói dịch vụ (ADR 0027)', () => {
  it('gói chỉ-đọc: KHÔNG mở thêm chi nhánh, nhưng vẫn xem và SỬA chi nhánh đang có', async () => {
    const view = await renderScreen(
      [PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE],
      [branch(), SECOND],
      [{ feature: PLAN_FEATURE.BRANCHES, state: FEATURE_STATE.READ_ONLY }],
    );

    await view.findByText('Chi nhánh Sơn Trà');
    /*
     * Nút Thêm vẫn HIỆN (đúng quyền `branches.manage`) nhưng bị khoá — ẩn hẳn sẽ trông như
     * thiếu quyền, trong khi lý do thật là gói hết hạn (ADR 0027 điều 3).
     */
    const addButton = await view.findByLabelText('Thêm chi nhánh');
    expect(addButton.props.accessibilityState?.disabled).toBe(true);
    /*
     * Thao tác vòng đời (đặt mặc định / ngừng-bật) trên MỖI thẻ cũng khoá lại kèm lý do —
     * không ẩn đi, và lý do hiện NGAY dưới hàng nút của chính thẻ đó (`BranchCard`).
     */
    expect((await view.findAllByText(/Gói đã hết hạn/)).length).toBeGreaterThan(0);
    // Sửa địa chỉ chi nhánh của chính mình thuộc bộ CƠ BẢN — không bị gói khoá.
    expect(view.getAllByText('Sửa').length).toBeGreaterThan(0);
  });
});

describe('BranchListScreen — thao tác vòng đời', () => {
  it('đặt làm mặc định: gọi đúng endpoint hành động', async () => {
    const view = await renderScreen([PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE]);

    await fireEvent.press(await view.findByText('Đặt làm mặc định'));

    await waitFor(() =>
      expect(view.actionSpy).toHaveBeenCalledWith(SECOND.id, BRANCH_ACTION.SET_DEFAULT),
    );
  });

  it('tạo chi nhánh: thiếu tỉnh thì chặn ở client, KHÔNG gọi API', async () => {
    const view = await renderScreen([PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE]);

    await fireEvent.press(await view.findByLabelText('Thêm chi nhánh'));
    await fireEvent.changeText(await view.findByLabelText('Tên chi nhánh'), 'Chi nhánh mới');
    await fireEvent.press(view.getByText('Tạo chi nhánh'));

    expect(await view.findByText('Chọn tỉnh/thành của chi nhánh')).toBeTruthy();
    expect(view.createSpy).not.toHaveBeenCalled();
  });

  it('tạo chi nhánh đủ trường: gửi MÃ tỉnh, không gửi tên tỉnh', async () => {
    const view = await renderScreen([PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE]);

    await fireEvent.press(await view.findByLabelText('Thêm chi nhánh'));
    await fireEvent.changeText(await view.findByLabelText('Tên chi nhánh'), 'Chi nhánh mới');
    await fireEvent.press(view.getByLabelText('Tỉnh/thành'));
    await fireEvent.press(await view.findByText('Đà Nẵng'));
    await fireEvent.press(view.getByText('Tạo chi nhánh'));

    await waitFor(() => expect(view.createSpy).toHaveBeenCalled());
    expect(view.createSpy.mock.calls[0]?.[0]).toMatchObject({
      name: 'Chi nhánh mới',
      provinceCode: '48',
    });
    expect(view.createSpy.mock.calls[0]?.[0]).not.toHaveProperty('provinceName');
  });
});

describe('BranchListScreen — trạng thái danh sách', () => {
  it('chưa có chi nhánh nào: mời thêm, khác hẳn "không khớp bộ lọc"', async () => {
    const view = await renderScreen([PERMISSION.BRANCH_VIEW, PERMISSION.BRANCH_MANAGE], []);

    expect(await view.findByText('Chưa có chi nhánh nào')).toBeTruthy();
    expect(view.queryByText('Không có chi nhánh khớp bộ lọc')).toBeNull();
  });
});
