import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  FEATURE_STATE,
  type FeatureState,
  MEMBER_ROSTER_KIND,
  MEMBER_ROSTER_STATUS,
  MEMBERSHIP_BRANCH_SCOPE,
  type MembershipBranchScope,
  PERMISSION,
  PLAN_FEATURE,
  type PlanFeature,
  TENANT_ROLE,
  type Permission,
} from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { branchesApi, type Branch, type BranchList } from '@/api/branches/api';
import { queryKeys } from '@/queries/query-keys';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { membersApi, type Member, type MemberRosterItem } from './api';
import { MemberListScreen } from './MemberListScreen';

/**
 * Danh sách nhân viên sau ADR 0087 (web PR #289): MỘT danh sách gộp thành viên + lời mời cũ
 * (`GET /members/roster`), chủ CẤP tài khoản (`POST /members/accounts`) thay cho mời bằng SĐT,
 * khoá/mở, đặt lại mật khẩu cho tài khoản do gian hàng cấp.
 */

/** Cờ NĂNG LỰC THEO GÓI đi kèm phiên — union, không phải chuỗi trần (ADR 0005). */
type TenantFeature = { feature: PlanFeature; state: FeatureState };

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  /* Chạy callback lúc mount, cleanup lúc unmount — đủ để mô phỏng "màn đang focus". */
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

const ME = '01JQZX0000000000000000000U';
const STAFF_ID = '01JQZX0000000000000000000S';

const ALL: Permission[] = [
  PERMISSION.MEMBER_VIEW,
  PERMISSION.MEMBER_INVITE,
  PERMISSION.MEMBER_UPDATE_ROLE,
  PERMISSION.MEMBER_REMOVE,
];

function currentUser(
  permissions: Permission[],
  features: TenantFeature[] = [],
  branchScope: MembershipBranchScope = MEMBERSHIP_BRANCH_SCOPE.ALL,
): authApi.CurrentUser {
  return {
    id: ME,
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
      onboardingState: 'package_active',
      branchScope,
      logoUrl: null,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      features,
      planCode: null,
      planName: null,
      serviceFeePercent: null,
      billingMode: 'package',
      planEndsAt: null,
      billingPhase: 'current',
      graceEndsAt: null,
      publicVehicleCount: 1,
    },
    openRenterTripCount: 0,
    platformRole: null,
    permissions,
  } as authApi.CurrentUser;
}

function row(overrides: Partial<MemberRosterItem> = {}): MemberRosterItem {
  return {
    kind: MEMBER_ROSTER_KIND.MEMBER,
    id: STAFF_ID,
    userId: STAFF_ID,
    displayName: 'Trần Thị B',
    username: 'tranb',
    managedAccount: true,
    roleKey: TENANT_ROLE.SHOP_STAFF,
    status: MEMBER_ROSTER_STATUS.ACTIVE,
    branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL,
    branchIds: [],
    lastActiveAt: null,
    joinedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  } as MemberRosterItem;
}

const OWNER = row({
  id: ME,
  userId: ME,
  displayName: 'Chủ shop',
  username: null,
  managedAccount: false,
  roleKey: TENANT_ROLE.SHOP_OWNER,
});

const BRANCH_A = { id: '01JQZX00000000000000000BRA', name: 'Quận 1', provinceName: 'TP HCM' } as Branch;
const BRANCH_B = { id: '01JQZX00000000000000000BRB', name: 'Quận 5', provinceName: 'TP HCM' } as Branch;

async function renderScreen(
  permissions: Permission[],
  rows: MemberRosterItem[] = [OWNER, row()],
  opts: { features?: TenantFeature[]; branches?: Branch[]; myScope?: MembershipBranchScope } = {},
) {
  jest
    .spyOn(authApi, 'fetchCurrentUser')
    .mockResolvedValue(currentUser(permissions, opts.features ?? [], opts.myScope));
  jest
    .spyOn(branchesApi, 'list')
    .mockResolvedValue({ items: opts.branches ?? [] } as unknown as BranchList);
  const rosterSpy = jest.spyOn(membersApi, 'roster').mockResolvedValue({
    items: rows,
    meta: { page: 1, limit: 20, total: rows.length, hasNext: false },
  });
  const rolesSpy = jest.spyOn(membersApi, 'roles').mockResolvedValue([
    { roleKey: TENANT_ROLE.SHOP_STAFF, memberCount: 1, permissions: [PERMISSION.MEMBER_VIEW] },
  ]);
  jest.spyOn(membersApi, 'activity').mockResolvedValue([]);
  const createSpy = jest
    .spyOn(membersApi, 'createAccount')
    .mockResolvedValue({ userId: STAFF_ID } as Member);
  const lockSpy = jest.spyOn(membersApi, 'lock').mockResolvedValue({ userId: STAFF_ID } as Member);
  const unlockSpy = jest
    .spyOn(membersApi, 'unlock')
    .mockResolvedValue({ userId: STAFF_ID } as Member);
  const resetSpy = jest.spyOn(membersApi, 'resetPassword').mockResolvedValue({ ok: true });
  const removeSpy = jest.spyOn(membersApi, 'remove').mockResolvedValue({ userId: STAFF_ID });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <MemberListScreen />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return {
    ...view,
    rosterSpy,
    rolesSpy,
    createSpy,
    lockSpy,
    unlockSpy,
    resetSpy,
    removeSpy,
    queryClient,
  };
}

/** Mở tấm chi tiết của một thẻ — lối vào các thao tác khoá / đặt lại mật khẩu / gỡ (như web drawer). */
async function openDetail(view: Awaited<ReturnType<typeof renderScreen>>, index = 0) {
  const buttons = await view.findAllByRole('button', { name: 'Xem chi tiết' });
  await fireEvent.press(buttons[index]!);
}

beforeEach(() => jest.restoreAllMocks());

describe('MemberListScreen - ma trận quyền', () => {
  it('thiếu `members.view`: màn thiếu quyền, KHÔNG gọi API', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);

    expect(await view.findByText('Không có quyền truy cập')).toBeTruthy();
    expect(view.rosterSpy).not.toHaveBeenCalled();
  });

  it('chỉ `members.view`: không thêm nhân viên, không chỉnh sửa', async () => {
    const view = await renderScreen([PERMISSION.MEMBER_VIEW]);

    await view.findByText('Trần Thị B');
    expect(view.queryByLabelText('Thêm nhân viên')).toBeNull();
    expect(view.queryByText('Chỉnh sửa')).toBeNull();
    // Màn "Vai trò & quyền" mở cho mọi người xem được danh sách.
    expect(view.getByLabelText('Vai trò & quyền')).toBeTruthy();
  });

  it('đủ quyền: có nút thêm nhân viên và "Chỉnh sửa" trên thẻ', async () => {
    const view = await renderScreen(ALL);

    await view.findByText('Trần Thị B');
    expect(view.getByLabelText('Thêm nhân viên')).toBeTruthy();
    expect(view.getByText('Chỉnh sửa')).toBeTruthy();
  });
});

describe('MemberListScreen - luật KHÔNG được phá', () => {
  it('chủ gian hàng: không chỉnh sửa từ màn này', async () => {
    const otherOwner = row({
      id: '01JQZX0000000000000000000O',
      userId: '01JQZX0000000000000000000O',
      displayName: 'Đồng sở hữu',
      roleKey: TENANT_ROLE.SHOP_OWNER,
    });
    const view = await renderScreen(ALL, [otherOwner]);

    await view.findByText('Đồng sở hữu');
    expect(view.queryByText('Chỉnh sửa')).toBeNull();
  });

  it('CHÍNH MÌNH: không tự chỉnh sửa (đường tự nâng quyền)', async () => {
    const meRow = row({ id: ME, userId: ME, displayName: 'Tôi', roleKey: TENANT_ROLE.SHOP_MANAGER });
    const view = await renderScreen(ALL, [meRow]);

    await view.findByText(/Tôi/);
    expect(view.queryByText('Chỉnh sửa')).toBeNull();
  });

  it('bộ vai trò cấp được KHÔNG có chủ gian hàng', async () => {
    const view = await renderScreen(ALL);

    await fireEvent.press(await view.findByLabelText('Thêm nhân viên'));
    await fireEvent.press(await view.findByLabelText('Vai trò'));

    /*
     * Đọc theo VAI `radio` chứ không theo chữ: nhãn vai trò cũng hiện trên từng thẻ ở nền, nên tìm
     * bằng chuỗi sẽ bắt nhầm chúng.
     */
    const options = (await view.findAllByRole('radio')).map(
      (node) => node.props.accessibilityLabel as string,
    );
    expect(options).toContain('Nhân viên gian hàng');
    expect(options).not.toContain('Chủ gian hàng');
  });

  it('tài khoản TỰ ĐĂNG KÝ: không có "Đặt lại mật khẩu"', async () => {
    const selfRegistered = row({ managedAccount: false, username: null });
    const view = await renderScreen(ALL, [selfRegistered]);

    await openDetail(view);
    expect(await view.findByText('Chỉnh sửa')).toBeTruthy();
    expect(view.queryByText('Đặt lại mật khẩu')).toBeNull();
  });

  it('khoá DO HỆ THỐNG (gói hết hạn): không cho mở khoá tay', async () => {
    const systemLocked = row({ status: MEMBER_ROSTER_STATUS.LOCKED, lockedReason: 'plan_lapsed' });
    const view = await renderScreen(ALL, [systemLocked]);

    await openDetail(view);
    await view.findAllByText('Trần Thị B');
    expect(view.queryByText('Mở khoá')).toBeNull();
  });
});

describe('MemberListScreen - gói dịch vụ tách khỏi quyền (ADR 0027 điều 2)', () => {
  it('gói chỉ-đọc: VẪN xem được danh sách, nút thêm bị khoá, không chỉnh sửa', async () => {
    const view = await renderScreen(ALL, [OWNER, row()], {
      features: [{ feature: PLAN_FEATURE.MEMBERS, state: FEATURE_STATE.READ_ONLY }],
    });

    expect(await view.findByText('Trần Thị B')).toBeTruthy();
    const addButton = await view.findByLabelText('Thêm nhân viên');
    expect(addButton.props.accessibilityState?.disabled).toBe(true);
    expect(await view.findByText(/chế độ chỉ xem/)).toBeTruthy();
    expect(view.queryByText('Chỉnh sửa')).toBeNull();
  });
});

describe('MemberListScreen - cấp tài khoản nhân viên (ADR 0087)', () => {
  async function fillAndSubmit(view: Awaited<ReturnType<typeof renderScreen>>) {
    await fireEvent.press(await view.findByLabelText('Thêm nhân viên'));
    await fireEvent.changeText(await view.findByLabelText('Họ tên'), 'Nguyễn Văn C');
    await fireEvent.changeText(view.getByLabelText('Tên đăng nhập'), 'NguyenC');
    await fireEvent.changeText(view.getByLabelText('Mật khẩu'), 'abc12345');
  }

  it('tên đăng nhập sai định dạng: chặn ở client, KHÔNG gọi API', async () => {
    const view = await renderScreen(ALL);

    await fireEvent.press(await view.findByLabelText('Thêm nhân viên'));
    await fireEvent.changeText(await view.findByLabelText('Họ tên'), 'Nguyễn Văn C');
    await fireEvent.changeText(view.getByLabelText('Tên đăng nhập'), '1x');
    await fireEvent.press(view.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await view.findByText(/Tên đăng nhập 4-32 ký tự/)).toBeTruthy();
    expect(view.createSpy).not.toHaveBeenCalled();
  });

  it('tạo xong: tên đăng nhập chuẩn hoá chữ thường, hiện thông tin đăng nhập MỘT lần, "Xong" mới đóng', async () => {
    const view = await renderScreen(ALL);
    await fillAndSubmit(view);
    await fireEvent.press(view.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() =>
      expect(view.createSpy).toHaveBeenCalledWith({
        displayName: 'Nguyễn Văn C',
        username: 'nguyenc',
        password: 'abc12345',
        roleKey: TENANT_ROLE.SHOP_STAFF,
        branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL,
      }),
    );
    expect(await view.findByText('Đã tạo tài khoản')).toBeTruthy();
    expect(view.getByText('abc12345')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Xong' }));
    await waitFor(() => expect(view.queryByText('abc12345')).toBeNull());
  });

  it('chọn một chi nhánh ⇒ gửi limited + branchIds', async () => {
    const view = await renderScreen(ALL, [OWNER], { branches: [BRANCH_A, BRANCH_B] });
    await fillAndSubmit(view);
    await fireEvent.press(await view.findByLabelText('Quận 5 · TP HCM'));
    await fireEvent.press(view.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() =>
      expect(view.createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED,
          branchIds: [BRANCH_B.id],
        }),
      ),
    );
  });

  it('gian hàng chưa có chi nhánh: ẩn ô chi nhánh', async () => {
    const view = await renderScreen(ALL, [OWNER]);
    await fireEvent.press(await view.findByLabelText('Thêm nhân viên'));
    await view.findByLabelText('Họ tên');
    expect(view.queryByText(/Chi nhánh phụ trách/)).toBeNull();
  });
});

describe('MemberListScreen - khoá / đặt lại mật khẩu / gỡ', () => {
  it('tạm khoá: hỏi xác nhận rồi gọi `lock`', async () => {
    const view = await renderScreen(ALL);

    await openDetail(view, 1);
    await fireEvent.press(await view.findByRole('button', { name: 'Tạm khoá' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Tạm khoá' }));

    await waitFor(() => expect(view.lockSpy).toHaveBeenCalledWith(STAFF_ID));
    expect(view.unlockSpy).not.toHaveBeenCalled();
  });

  it('đặt lại mật khẩu: gửi mật khẩu mới cho đúng người', async () => {
    const view = await renderScreen(ALL);

    await openDetail(view, 1);
    await fireEvent.press(await view.findByRole('button', { name: 'Đặt lại mật khẩu' }));
    await fireEvent.changeText(await view.findByLabelText('Mật khẩu'), 'newpass99');
    const submits = view.getAllByRole('button', { name: 'Đặt lại mật khẩu' });
    await fireEvent.press(submits[submits.length - 1]!);

    await waitFor(() => expect(view.resetSpy).toHaveBeenCalledWith(STAFF_ID, 'newpass99'));
  });

  it('gỡ thành viên: làm mới CẢ `/auth/me` (quyền của chính người đang đăng nhập có thể đổi)', async () => {
    const view = await renderScreen(ALL);
    const invalidate = jest.spyOn(view.queryClient, 'invalidateQueries');

    await openDetail(view, 1);
    await fireEvent.press(await view.findByRole('button', { name: 'Gỡ khỏi gian hàng' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Gỡ' }));

    await waitFor(() => expect(view.removeSpy).toHaveBeenCalledWith(STAFF_ID));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.auth.all }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.members.all });
  });
});

describe('MemberListScreen - chi nhánh phụ trách (ADR 0052)', () => {
  it('người bị GIỚI HẠN: thành viên rộng hơn mình KHÔNG chỉnh sửa được', async () => {
    const view = await renderScreen(ALL, [row({ displayName: 'Toàn gian hàng' })], {
      branches: [BRANCH_A],
      myScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED,
    });
    await view.findByText('Toàn gian hàng');
    await waitFor(() => expect(view.queryByText('Chỉnh sửa')).toBeNull());
  });

  it('người bị GIỚI HẠN: thành viên nằm gọn trong phạm vi thì vẫn chỉnh sửa được', async () => {
    const inside = row({
      displayName: 'Trong phạm vi',
      branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED,
      branchIds: [BRANCH_A.id],
    });
    const view = await renderScreen(ALL, [inside], {
      branches: [BRANCH_A],
      myScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED,
    });
    await view.findByText('Trong phạm vi');
    expect(await view.findByText('Chỉnh sửa')).toBeTruthy();
  });
});
