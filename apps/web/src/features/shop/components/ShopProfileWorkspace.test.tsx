import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHOP_ONBOARDING_STATE, SHOP_VERIFICATION, TENANT_STATUS } from '@xeprime/types';
import { ShopProfileWorkspace } from './ShopProfileWorkspace';
import type { MyShop, UpdateProfileInput } from '../types';

/**
 * Màn hồ sơ gian hàng dạng MỘT MÀN — dùng ở `/account/registration`.
 *
 * Những thứ test này khoá, đều là chỗ đã sai hoặc dễ sai lại:
 *
 * 1. **Hai nút ở tiêu đề đi theo `isDirty`.** Chưa sửa gì: Lưu mờ, Huỷ bỏ không tồn tại. Sửa rồi:
 *    Lưu sáng, Huỷ bỏ xuất hiện. Đây là ràng buộc về HÀNH VI, không phải trang trí — một nút Lưu
 *    lúc nào cũng sáng làm người dùng không trả lời được câu "mình đã đổi gì chưa".
 * 2. **Gửi lên là MÃ tỉnh, không phải TÊN tỉnh.** Tên do server tra ra; client gửi tên là dữ liệu
 *    không kiểm soát được và nó từng làm hai cột tỉnh lệch hẳn nhau.
 * 3. **Chủ gian hàng KHÔNG còn là ô nhập** (16/09/2026). Ba cột `tenant_profiles.owner_*` đã
 *    drop; cổng gửi duyệt đọc họ tên + SĐT từ TÀI KHOẢN CHỦ. Form này vì thế không được gửi lên
 *    ba khoá đó nữa, và checklist phải chấm theo `ownerAccount`.
 * 4. **Không còn luồng xin XÁC MINH** (24/09/2026): nền tảng tạm ngừng xác minh gian hàng, nên
 *    màn này không có nút gửi, không có dải "đang chờ / cần bổ sung", và một phiếu chờ cũ KHÔNG
 *    còn khoá hồ sơ — không ai xử lý nó nữa, nên cái khoá sẽ là vĩnh viễn.
 */
const provinces = vi.hoisted(() => ({
  options: [
    { value: '79', label: 'Hồ Chí Minh' },
    { value: '48', label: 'Đà Nẵng' },
  ] as { value: string; label: string }[],
  isLoading: false,
  isError: false,
}));
vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({ ...provinces, error: null, refetch: vi.fn() }),
}));
/*
 * Danh mục cấp xã và bản đồ: stub RỖNG. Màn này kiểm luồng gửi duyệt và dải trạng thái, không
 * kiểm ô địa chỉ — hành vi của ô đó nằm ở `components/form/AddressField.test.tsx`. Để chúng gọi
 * thật thì mỗi lần render sẽ đòi một QueryClientProvider và một khoá bản đồ.
 */
vi.mock('@/features/locations/hooks/use-wards', () => ({
  useWardOptions: () => ({
    options: [],
    items: [],
    total: 0,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/features/locations/hooks/use-places', () => ({
  PLACE_SEARCH_MIN_LENGTH: 3,
  usePlaceSearch: () => ({ data: { items: [], available: false }, isFetching: false }),
  usePlaceDetail: () => ({ mutateAsync: vi.fn() }),
  useReverseGeocode: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/components/form/MapPinPicker', () => ({ MapPinPicker: () => null }));

/** Tài khoản chủ mặc định — đủ họ tên + SĐT, tức là hồ sơ gửi duyệt được. */
const OWNER: MyShop['ownerAccount'] = {
  userId: '01HUSER000000000000000000',
  displayName: 'Nguyễn Văn A',
  email: 'chu@xeprime.vn',
  phone: '84901234567',
  emailVerified: true,
  phoneVerified: true,
};

function makeShop(
  overrides: Partial<MyShop['profile']> = {},
  owner: Partial<MyShop['ownerAccount']> = {},
): MyShop {
  return {
    id: '01HSHOP00000000000000000A',
    code: 'SHOP-1',
    slug: 'demo-xeprime',
    name: 'Demo XePrime',
    tenantType: 'individual',
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    verification: SHOP_VERIFICATION.UNVERIFIED,
    phone: null,
    email: null,
    latestApproval: null,
    ownerAccount: { ...OWNER, ...owner },
    defaultBranch: {
      id: '01HBRANCH0000000000000000',
      code: 'CN01',
      name: 'Chi nhánh Hồ Chí Minh',
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
      needsLocationReview: false,
    },
    profile: {
      displayName: 'Demo XePrime',
      bio: 'Gian hàng demo',
      logoUrl: null,
      coverUrl: null,
      address: '123 Nguyễn Văn Cừ',
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
      taxCode: null,
      businessLicenseNo: null,
      ...overrides,
    },
  };
}

/** Mock đúng chữ ký của prop — nhờ vậy `mock.calls[0][0]` có kiểu, không phải `any`. */
type SaveMock = ReturnType<typeof vi.fn<(body: UpdateProfileInput) => void>>;

function renderWorkspace(
  shop: MyShop,
  {
    onSave = vi.fn<(body: UpdateProfileInput) => void>(),
    canEdit = true,
  }: {
    onSave?: SaveMock;
    canEdit?: boolean;
  } = {},
) {
  const view = render(
    <App>
      <ShopProfileWorkspace shop={shop} canEdit={canEdit} saving={false} onSave={onSave} />
    </App>,
  );
  return { ...view, onSave };
}

const saveButton = () => screen.getByRole('button', { name: /Lưu thông tin/ });
const displayNameInput = () => screen.getByLabelText(/Tên hiển thị/);
/** Hồ sơ từng BỊ TRẢ VỀ trước khi nền tảng ngừng xác minh — dữ liệu cũ vẫn có thể mang nó. */
function needsRevisionShop(
  overrides: Partial<MyShop['profile']> = {},
  owner: Partial<MyShop['ownerAccount']> = {},
): MyShop {
  return {
    ...makeShop(overrides, owner),
    verification: SHOP_VERIFICATION.NEEDS_REVISION,
    latestApproval: {
      status: 'needs_revision',
      reason: 'Ảnh giấy phép kinh doanh bị mờ',
      submittedAt: '2026-08-20T03:00:00.000Z',
      reviewedAt: '2026-08-20T04:00:00.000Z',
    },
  };
}
/** Thẻ checklist — nhãn mục ở đây TRÙNG nhãn ô trên form, nên mọi khẳng định phải khoanh vùng. */
const checklist = () => within(screen.getByRole('region', { name: 'Hoàn thiện hồ sơ' }));

/** Một chỉnh sửa bất kỳ để form chuyển sang trạng thái "có thay đổi". */
function editSomething(value = 'Demo XePrime đổi tên') {
  fireEvent.change(displayNameInput(), { target: { value } });
}

beforeEach(() => {
  provinces.options = [
    { value: '79', label: 'Hồ Chí Minh' },
    { value: '48', label: 'Đà Nẵng' },
  ];
  provinces.isLoading = false;
  provinces.isError = false;
});

afterEach(cleanup);

describe('Hai nút ở tiêu đề đi theo trạng thái chỉnh sửa', () => {
  it('chưa sửa gì: nút Lưu bị khoá và KHÔNG có nút Huỷ bỏ', () => {
    renderWorkspace(makeShop());

    expect(saveButton()).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: /Huỷ bỏ/ })).toBeNull();
    expect(screen.queryByText('Chưa lưu')).toBeNull();
  });

  it('vừa sửa: nút Lưu sáng lên, nút Huỷ bỏ xuất hiện kèm dấu hiệu "Chưa lưu"', async () => {
    renderWorkspace(makeShop());
    editSomething();

    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    expect(screen.getByRole('button', { name: /Huỷ bỏ/ })).toBeTruthy();
    expect(screen.getByText('Chưa lưu')).toBeTruthy();
  });

  it('sửa rồi gõ trả lại giá trị cũ: hai nút quay về như chưa sửa', async () => {
    renderWorkspace(makeShop());

    editSomething();
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));

    editSomething('Demo XePrime'); // đúng giá trị đang lưu
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', true));
    expect(screen.queryByRole('button', { name: /Huỷ bỏ/ })).toBeNull();
  });

  it('bấm Huỷ bỏ: form về giá trị đã lưu và chính nút đó biến mất', async () => {
    renderWorkspace(makeShop());

    editSomething();
    const cancel = await screen.findByRole('button', { name: /Huỷ bỏ/ });
    fireEvent.click(cancel);

    await waitFor(() => expect(displayNameInput()).toHaveProperty('value', 'Demo XePrime'));
    expect(screen.queryByRole('button', { name: /Huỷ bỏ/ })).toBeNull();
    expect(saveButton()).toHaveProperty('disabled', true);
  });

  it('chỉ xem (thiếu quyền `tenant.update`): ô nhập khoá, không có nút nào sáng', async () => {
    const { container } = renderWorkspace(makeShop(), { canEdit: false });

    // Khoá bằng `fieldset[disabled]` — trình duyệt vô hiệu hoá mọi control bên trong. Ô chọn tỉnh
    // là combobox dựng bằng div nên fieldset không với tới; nó nhận `disabled` tường minh.
    expect(container.querySelector('fieldset')).toHaveProperty('disabled', true);
    expect(container.querySelector('.ant-select-disabled')).toBeTruthy();
    expect(saveButton()).toHaveProperty('disabled', true);
    expect(screen.getByText('Bạn chỉ có quyền xem hồ sơ gian hàng.')).toBeTruthy();
  });

  /*
   * 24/09/2026: phiếu xác minh CŨ còn chờ không còn khoá hồ sơ. Nền tảng đã ngừng xử lý loại
   * phiếu đó, nên giữ khoá là khoá vĩnh viễn — và backend cũng đã gỡ nó.
   */
  it('còn phiếu xác minh chờ (dữ liệu cũ): VẪN sửa được, không có câu "tạm khoá"', async () => {
    const { container, onSave } = renderWorkspace({
      ...makeShop(),
      verification: SHOP_VERIFICATION.PENDING,
    });

    expect(container.querySelector('fieldset')).toHaveProperty('disabled', false);
    expect(screen.queryByText('Hồ sơ đang chờ duyệt nên tạm khoá chỉnh sửa.')).toBeNull();

    editSomething();
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
});

describe('Nội dung gửi lên', () => {
  it('gửi lên MÃ tỉnh, KHÔNG gửi tên tỉnh', async () => {
    const { onSave } = renderWorkspace(makeShop());

    editSomething();
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const body = onSave.mock.calls[0]![0];
    expect(body.provinceCode).toBe('79');
    expect(body).not.toHaveProperty('provinceName');
    expect(body.displayName).toBe('Demo XePrime đổi tên');
  });

  /*
   * Đây là lằn ranh của ADR 0038 điều 3 viết thành test. Ba cột `tenant_profiles.owner_*` đã
   * drop và DTO không còn nhận chúng — gửi lên thì `forbidNonWhitelisted` trả 400. Quan trọng
   * hơn: một ô "họ tên chủ gian hàng" ở form này cho bất kỳ ai có `tenant.update` (gồm cả
   * `shop_manager`) viết lại danh tính của người CHỦ.
   */
  it('KHÔNG còn ô chủ gian hàng, và thân request không mang ba khoá đó', async () => {
    const { onSave } = renderWorkspace(makeShop());

    expect(screen.queryByLabelText(/Họ và tên/)).toBeNull();
    expect(screen.queryByLabelText(/Số điện thoại/)).toBeNull();

    editSomething();
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const body = onSave.mock.calls[0]![0];
    expect(body).not.toHaveProperty('ownerFullName');
    expect(body).not.toHaveProperty('ownerPhone');
    expect(body).not.toHaveProperty('ownerEmail');
  });

  /* Tài khoản nhận tiền sống ở `bank_accounts` — không có ô nào của nó trên form hồ sơ. */
  it('KHÔNG còn ô ngân hàng, và thân request không mang bốn khoá đó', async () => {
    const { onSave } = renderWorkspace(makeShop());

    expect(screen.queryByLabelText(/Ngân hàng/)).toBeNull();
    expect(screen.queryByLabelText(/Số tài khoản/)).toBeNull();

    editSomething();
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const body = onSave.mock.calls[0]![0];
    for (const key of ['bankName', 'bankAccountNo', 'bankAccountName', 'qrUrl']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('tên hiển thị để trống → chặn tại chỗ, không gọi API', async () => {
    const { onSave } = renderWorkspace(makeShop());

    editSomething('');
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.getByText('Tên hiển thị là bắt buộc')).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('Checklist hồ sơ', () => {
  it('đủ bốn mục bắt buộc: nhóm đó báo đã đủ, mục NÊN CÓ vẫn liệt kê nhưng không chặn', () => {
    renderWorkspace(makeShop());

    expect(checklist().getByText('Đã đủ thông tin bắt buộc')).toBeTruthy();
    // Logo chưa có, và nó vẫn nằm trong bảng — chỉ là không bắt buộc.
    expect(checklist().getByText('Logo gian hàng')).toBeTruthy();
    expect(checklist().getByText('Nên có — giúp khách chọn gian hàng của bạn')).toBeTruthy();
  });

  /*
   * Hai mục "chủ gian hàng" chấm theo TÀI KHOẢN, không theo form — cùng nguồn mà
   * `TenantsService.submitForReview` dùng làm cổng thật. Đọc khác nhau nghĩa là checklist xanh
   * hết trong khi server vẫn từ chối.
   */
  it('tài khoản chủ thiếu SĐT → mục bắt buộc chưa đủ, dù form không có ô nào của nó', () => {
    renderWorkspace(makeShop({}, { phone: null }));

    expect(checklist().getByText('Thông tin bắt buộc')).toBeTruthy();
    expect(checklist().queryByText('Đã đủ thông tin bắt buộc')).toBeNull();
  });

  it('checklist đi theo ô ĐANG NHẬP, không phải hồ sơ đã lưu', async () => {
    renderWorkspace(makeShop({ displayName: '' }));
    expect(checklist().queryByText('Đã đủ thông tin bắt buộc')).toBeNull();

    // Vừa gõ xong là mục đó tick ngay — bảng đọc bản đang gõ, không đợi bấm Lưu.
    editSomething('Demo XePrime');

    await waitFor(() => expect(checklist().getByText('Đã đủ thông tin bắt buộc')).toBeTruthy());
  });

  /* Tài khoản nhận tiền không còn là một mục — nó không sống trên hồ sơ này nữa. */
  it('KHÔNG còn mục "Tài khoản nhận tiền" trong checklist', () => {
    renderWorkspace(makeShop());

    expect(checklist().queryByText('Tài khoản nhận tiền')).toBeNull();
  });

  /*
   * Không còn gắn với trạng thái xác minh: web đã bỏ luồng đó, nên một phiếu chờ cũ không che
   * mất bảng — và không chữ nào trong bảng nhắc tới một nút gửi duyệt đã không còn.
   */
  it('còn phiếu xác minh chờ (dữ liệu cũ): checklist vẫn hiện, không nhắc "gửi duyệt"', () => {
    renderWorkspace({ ...makeShop(), verification: SHOP_VERIFICATION.PENDING });

    expect(checklist().getByText('Đã đủ thông tin bắt buộc')).toBeTruthy();
    expect(checklist().queryByText(/gửi duyệt/i)).toBeNull();
  });

  it('hồ sơ đã ĐỦ HẾT: không dựng thẻ 100% thường trực', () => {
    renderWorkspace(
      makeShop({
        logoUrl: 'https://cdn.example/logo.png',
        coverUrl: 'https://cdn.example/cover.png',
      }),
    );

    expect(screen.queryByRole('region', { name: 'Hoàn thiện hồ sơ' })).toBeNull();
  });

  it('chỉ xem (thiếu quyền sửa): không dựng checklist "còn thiếu gì"', () => {
    renderWorkspace(makeShop(), { canEdit: false });

    expect(screen.queryByRole('region', { name: 'Hoàn thiện hồ sơ' })).toBeNull();
  });
});

describe('Không còn luồng xin xác minh gian hàng', () => {
  /*
   * Nút gửi / gửi lại xác minh không còn ở bất kỳ trạng thái nào: phiếu gửi đi sẽ không có ai ở
   * đầu kia. Ẩn hẳn, không thay bằng một dòng giải thích luật nội bộ.
   */
  it.each([
    SHOP_VERIFICATION.UNVERIFIED,
    SHOP_VERIFICATION.PENDING,
    SHOP_VERIFICATION.NEEDS_REVISION,
    SHOP_VERIFICATION.REJECTED,
  ])('trạng thái %s: KHÔNG có nút gửi xác minh', (verification) => {
    renderWorkspace({ ...needsRevisionShop(), verification });

    expect(screen.queryByRole('button', { name: /Gửi.*xác minh/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
    // Và không rơi về một nút chẳng liên quan ("Thêm xe") ở chỗ nút cũ đứng.
    expect(screen.queryByRole('button', { name: /Thêm xe/ })).toBeNull();
  });
});

describe('Dải trạng thái chỉ nói về trạng thái VẬN HÀNH', () => {
  it('đang chờ / bị trả về xác minh: KHÔNG dựng dải nào về xác minh', () => {
    renderWorkspace({ ...makeShop(), verification: SHOP_VERIFICATION.PENDING });
    expect(screen.queryByText('Hồ sơ đang chờ nền tảng xác minh')).toBeNull();
    cleanup();

    renderWorkspace(needsRevisionShop());
    expect(screen.queryByText('Nền tảng yêu cầu bổ sung hồ sơ')).toBeNull();
    expect(screen.queryByText(/Ảnh giấy phép kinh doanh bị mờ/)).toBeNull();
  });

  it('gian hàng bị KHOÁ: dải cảnh báo vẫn hiện — xe đang rời chợ ngay lúc này', () => {
    renderWorkspace({ ...makeShop(), status: TENANT_STATUS.SUSPENDED });

    expect(screen.getByText('Gian hàng đang bị khoá')).toBeTruthy();
  });

  it('đang hoạt động: KHÔNG dựng dải nào — nhãn cạnh tên gian hàng đã nói điều đó', () => {
    renderWorkspace({ ...makeShop(), verification: SHOP_VERIFICATION.VERIFIED });

    expect(screen.queryByText('Gian hàng đã được xác minh')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
