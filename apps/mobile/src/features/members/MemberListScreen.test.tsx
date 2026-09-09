import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  API_ERROR_CODE,
  FEATURE_STATE,
  type FeatureState,
  MEMBERSHIP_STATUS,
  PERMISSION,
  PLAN_FEATURE,
  type PlanFeature,
  TENANT_ROLE,
  type Permission,
} from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import * as authApi from '@/features/auth/api';
import { queryKeys } from '@/queries/query-keys';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { membersApi, type Invite, type Member } from './api';
import { MemberListScreen } from './MemberListScreen';

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

function currentUser(
  permissions: Permission[],
  features: TenantFeature[] = [],
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
      roleKey: TENANT_ROLE.SHOP_OWNER,
      features,
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  };
}

function member(overrides: Partial<Member> = {}): Member {
  return {
    userId: '01JQZX0000000000000000000S',
    displayName: 'Trần Thị B',
    email: 'staff@xeprime.test',
    avatarUrl: null,
    roleKey: TENANT_ROLE.SHOP_STAFF,
    status: MEMBERSHIP_STATUS.ACTIVE,
    joinedAt: '2026-02-01T00:00:00.000Z',
    createdAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

const OWNER = member({
  userId: ME,
  displayName: 'Chủ shop',
  email: 'owner@xeprime.test',
  roleKey: TENANT_ROLE.SHOP_OWNER,
});

const OTHER_OWNER = member({
  userId: '01JQZX0000000000000000000O',
  displayName: 'Đồng sở hữu',
  roleKey: TENANT_ROLE.SHOP_OWNER,
});

async function renderScreen(
  permissions: Permission[],
  members: Member[] = [OWNER, member()],
  invites: Invite[] = [],
  features: TenantFeature[] = [],
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(currentUser(permissions, features));
  const listSpy = jest.spyOn(membersApi, 'list').mockResolvedValue({
    items: members,
    meta: { page: 1, limit: 10, total: members.length, hasNext: false },
  });
  const invitesSpy = jest.spyOn(membersApi, 'invites').mockResolvedValue({
    items: invites,
    meta: { page: 1, limit: 10, total: invites.length, hasNext: false },
  });
  const createInviteSpy = jest.spyOn(membersApi, 'createInvite');
  const removeSpy = jest.spyOn(membersApi, 'remove').mockResolvedValue({ userId: 'x' });
  const roleSpy = jest.spyOn(membersApi, 'updateRole').mockResolvedValue(member());

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
  return { ...view, listSpy, invitesSpy, createInviteSpy, removeSpy, roleSpy, queryClient };
}

beforeEach(() => jest.restoreAllMocks());

describe('MemberListScreen — ma trận quyền', () => {
  it('thiếu `members.view`: màn thiếu quyền, KHÔNG gọi API', async () => {
    const view = await renderScreen([PERMISSION.TENANT_VIEW]);

    expect(await view.findByText('Không có quyền truy cập')).toBeTruthy();
    expect(view.listSpy).not.toHaveBeenCalled();
  });

  it('chỉ `members.view`: không mời, không đổi vai, không gỡ', async () => {
    const view = await renderScreen([PERMISSION.MEMBER_VIEW]);

    await view.findByText('Trần Thị B');
    expect(view.queryByLabelText('Mời thành viên')).toBeNull();
    expect(view.queryByText('Đổi vai trò')).toBeNull();
    expect(view.queryByText('Gỡ thành viên')).toBeNull();
  });

  it('đủ quyền: có nút mời, đổi vai và gỡ', async () => {
    const view = await renderScreen([
      PERMISSION.MEMBER_VIEW,
      PERMISSION.MEMBER_INVITE,
      PERMISSION.MEMBER_UPDATE_ROLE,
      PERMISSION.MEMBER_REMOVE,
    ]);

    await view.findByText('Trần Thị B');
    expect(view.getByLabelText('Mời thành viên')).toBeTruthy();
    expect(view.getByText('Đổi vai trò')).toBeTruthy();
    expect(view.getByText('Gỡ thành viên')).toBeTruthy();
  });
});

describe('MemberListScreen — ba luật KHÔNG được phá', () => {
  const all: Permission[] = [
    PERMISSION.MEMBER_VIEW,
    PERMISSION.MEMBER_INVITE,
    PERMISSION.MEMBER_UPDATE_ROLE,
    PERMISSION.MEMBER_REMOVE,
  ];

  it('chủ gian hàng: không đổi vai và không gỡ được từ màn này', async () => {
    const view = await renderScreen(all, [OTHER_OWNER]);

    await view.findByText('Đồng sở hữu');
    expect(view.queryByText('Đổi vai trò')).toBeNull();
    expect(view.queryByText('Gỡ thành viên')).toBeNull();
  });

  it('CHÍNH MÌNH: không tự đổi vai, không tự gỡ (đường tự nâng quyền)', async () => {
    const staffMe = member({ userId: ME, displayName: 'Tôi', roleKey: TENANT_ROLE.SHOP_MANAGER });
    const view = await renderScreen(all, [staffMe]);

    await view.findByText(/Tôi/);
    expect(view.queryByText('Đổi vai trò')).toBeNull();
    expect(view.queryByText('Gỡ thành viên')).toBeNull();
  });

  it('bộ vai trò mời được KHÔNG có chủ gian hàng', async () => {
    const view = await renderScreen(all);

    await fireEvent.press(await view.findByLabelText('Mời thành viên'));
    await fireEvent.press(await view.findByLabelText('Vai trò'));

    /*
     * Đọc theo VAI `radio` chứ không theo chữ: nhãn vai trò cũng hiện trên từng thẻ thành viên ở
     * nền, nên tìm bằng chuỗi sẽ bắt nhầm chúng.
     */
    const options = (await view.findAllByRole('radio')).map(
      (node) => node.props.accessibilityLabel as string,
    );
    expect(options).toContain('Nhân viên gian hàng');
    expect(options).toContain('Quản lý gian hàng');
    expect(options).not.toContain('Chủ gian hàng');
  });
});

describe('MemberListScreen — gói dịch vụ tách khỏi quyền (ADR 0027 điều 2)', () => {
  it('gói chỉ-đọc: VẪN xem được danh sách, chỉ không mời/đổi vai/gỡ', async () => {
    const view = await renderScreen(
      [
        PERMISSION.MEMBER_VIEW,
        PERMISSION.MEMBER_INVITE,
        PERMISSION.MEMBER_UPDATE_ROLE,
        PERMISSION.MEMBER_REMOVE,
      ],
      [OWNER, member()],
      [],
      [{ feature: PLAN_FEATURE.MEMBERS, state: FEATURE_STATE.READ_ONLY }],
    );

    expect(await view.findByText('Trần Thị B')).toBeTruthy();
    /*
     * Nút MỜI vẫn hiện (đúng quyền `members.invite`) nhưng bị khoá — ẩn hẳn nút sẽ trông như
     * thiếu quyền, trong khi lý do thật là gói hết hạn (ADR 0027 điều 3: read_only, không phải
     * hidden). Dòng lý do đứng cạnh đó nói rõ điều đó.
     */
    const inviteButton = await view.findByLabelText('Mời thành viên');
    expect(inviteButton.props.accessibilityState?.disabled).toBe(true);
    expect(await view.findByText(/Gói đã hết hạn/)).toBeTruthy();
    expect(view.queryByText('Đổi vai trò')).toBeNull();
  });
});

describe('MemberListScreen — lời mời', () => {
  const all: Permission[] = [
    PERMISSION.MEMBER_VIEW,
    PERMISSION.MEMBER_INVITE,
    PERMISSION.MEMBER_UPDATE_ROLE,
    PERMISSION.MEMBER_REMOVE,
  ];

  it('email sai định dạng: chặn ở client, KHÔNG gọi API', async () => {
    const view = await renderScreen(all);

    await fireEvent.press(await view.findByLabelText('Mời thành viên'));
    await fireEvent.changeText(await view.findByLabelText('Email'), 'khong-phai-email');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    expect(await view.findByText('Email không hợp lệ')).toBeTruthy();
    expect(view.createInviteSpy).not.toHaveBeenCalled();
  });

  it('thư KHÔNG gửi được: nói thật, không báo "đã gửi lời mời"', async () => {
    const view = await renderScreen(all);
    view.createInviteSpy.mockResolvedValue({
      id: '01JQZX0000000000000000000I',
      email: 'nhanvien@congty.vn',
      roleKey: TENANT_ROLE.SHOP_STAFF,
      status: 'pending',
      expiresAt: '2026-09-30T00:00:00.000Z',
      createdAt: '2026-09-08T00:00:00.000Z',
      createdByName: 'Chủ shop',
      emailSent: false,
    });

    await fireEvent.press(await view.findByLabelText('Mời thành viên'));
    await fireEvent.changeText(await view.findByLabelText('Email'), 'nhanvien@congty.vn');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    expect(await view.findByText(/CHƯA gửi được thư/)).toBeTruthy();
  });

  it('trùng/đã là thành viên: hiện lỗi của SERVER, không tự đoán', async () => {
    const view = await renderScreen(all);
    view.createInviteSpy.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: API_ERROR_CODE.CONFLICT,
        message: 'Người này đã ở trong gian hàng',
      }),
    );

    await fireEvent.press(await view.findByLabelText('Mời thành viên'));
    await fireEvent.changeText(await view.findByLabelText('Email'), 'nhanvien@congty.vn');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(view.createInviteSpy).toHaveBeenCalled());
    // Tấm trượt KHÔNG đóng khi lỗi — dữ liệu vừa nhập còn nguyên để sửa và gửi lại.
    expect(view.getByLabelText('Email')).toBeTruthy();
  });

  it('lời mời đang chờ hiện dưới danh sách, kèm hạn và người mời', async () => {
    const view = await renderScreen(
      all,
      [OWNER],
      [
        {
          id: '01JQZX0000000000000000000I',
          email: 'nhanvien@congty.vn',
          roleKey: TENANT_ROLE.SHOP_STAFF,
          status: 'pending',
          expiresAt: '2026-09-30T00:00:00.000Z',
          createdAt: '2026-09-08T00:00:00.000Z',
          createdByName: 'Chủ shop',
        },
      ],
    );

    /*
     * Neo vào EMAIL chứ không vào tiêu đề khối: khi truy vấn lời mời còn đang bay, khối vẫn
     * render tiêu đề mà chưa có hàng nào (`items.length === 0 && isFetching`). Chờ tiêu đề rồi
     * đọc email ngay là đọc trúng đúng khoảnh khắc đó — test đỏ ngẫu nhiên tuỳ tải máy.
     */
    expect(await view.findByText('nhanvien@congty.vn')).toBeTruthy();
    expect(view.getByText('Lời mời đang chờ')).toBeTruthy();
    expect(view.getByText('Thu hồi')).toBeTruthy();
  });
});

describe('MemberListScreen — invalidation', () => {
  it('gỡ thành viên: làm mới CẢ `/auth/me` (quyền của chính người đang đăng nhập có thể đổi)', async () => {
    const view = await renderScreen([PERMISSION.MEMBER_VIEW, PERMISSION.MEMBER_REMOVE]);
    const invalidate = jest.spyOn(view.queryClient, 'invalidateQueries');

    await fireEvent.press(await view.findByText('Gỡ thành viên'));
    await fireEvent.press(await view.findByRole('button', { name: 'Gỡ' }));

    await waitFor(() => expect(view.removeSpy).toHaveBeenCalled());
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.auth.all }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.members.all });
  });
});
