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
 * 4. **Gửi duyệt VALIDATE TRƯỚC**, và **LƯU NỐT thay đổi còn dở**: backend snapshot hồ sơ từ
 *    DATABASE, nên gửi thẳng khi form còn dirty là đưa cho người duyệt đúng bản cũ.
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
type SubmitMock = ReturnType<typeof vi.fn<(pending: UpdateProfileInput | null) => void>>;

function renderWorkspace(
  shop: MyShop,
  {
    onSave = vi.fn<(body: UpdateProfileInput) => void>(),
    onSubmitReview = vi.fn<(pending: UpdateProfileInput | null) => void>(),
    canEdit = true,
    canSubmit = true,
  }: {
    onSave?: SaveMock;
    onSubmitReview?: SubmitMock;
    canEdit?: boolean;
    canSubmit?: boolean;
  } = {},
) {
  const view = render(
    <App>
      <ShopProfileWorkspace
        shop={shop}
        canEdit={canEdit}
        canSubmit={canSubmit}
        saving={false}
        submitting={false}
        onSave={onSave}
        onSubmitReview={onSubmitReview}
      />
    </App>,
  );
  return { ...view, onSave, onSubmitReview };
}

const saveButton = () => screen.getByRole('button', { name: /Lưu thông tin/ });
const displayNameInput = () => screen.getByLabelText(/Tên hiển thị/);
/**
 * Nút trên DẢI trạng thái, không phải nút OK trong hộp xác nhận (hai nút cùng chữ).
 *
 * Từ ADR 0040 nó CHỈ xuất hiện khi người duyệt đang yêu cầu bổ sung / đã từ chối: thanh toán mở
 * tuyến gói, nên ở `unverified` việc gửi xác minh không đổi lấy được gì cho người bấm (mà vẫn
 * khoá hồ sơ suốt thời gian chờ). Nhãn nút đổi theo trạng thái — `resubmit` ở hai trạng thái đó.
 */
const submitReviewButton = () => screen.getAllByRole('button', { name: /^Gửi lại xác minh$/ })[0]!;

/** Hồ sơ BỊ TRẢ VỀ — trạng thái duy nhất còn dựng nút gửi (lại) xác minh. */
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

/** Mở hộp xác nhận rồi bấm OK trong CHÍNH hộp đó. */
async function confirmSubmitReview() {
  fireEvent.click(submitReviewButton());
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Gửi duyệt/ }));
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

  it('hồ sơ đang chờ xác minh: khoá sửa và nói rõ vì sao', () => {
    const { container } = renderWorkspace({
      ...makeShop(),
      verification: SHOP_VERIFICATION.PENDING,
    });

    expect(container.querySelector('fieldset')).toHaveProperty('disabled', true);
    expect(screen.getByText('Hồ sơ đang chờ duyệt nên tạm khoá chỉnh sửa.')).toBeTruthy();
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
  it('đủ bốn mục bắt buộc: nhóm đó báo đã đủ điều kiện, mục NÊN CÓ vẫn liệt kê nhưng không chặn', () => {
    renderWorkspace(makeShop());

    expect(checklist().getByText('Đã đủ điều kiện gửi duyệt')).toBeTruthy();
    // Logo chưa có, và nó vẫn nằm trong bảng — chỉ là không cản đường gửi duyệt.
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

    expect(checklist().getByText('Bắt buộc để gửi duyệt')).toBeTruthy();
    expect(checklist().queryByText('Đã đủ điều kiện gửi duyệt')).toBeNull();
  });

  it('checklist đi theo ô ĐANG NHẬP, không phải hồ sơ đã lưu', async () => {
    renderWorkspace(makeShop({ displayName: '' }));
    expect(checklist().queryByText('Đã đủ điều kiện gửi duyệt')).toBeNull();

    // Vừa gõ xong là mục đó tick ngay — nút Gửi duyệt sẽ lưu nốt trước khi gửi, nên bảng này
    // đọc bản đang gõ mới đúng với thứ sắp được gửi đi.
    editSomething('Demo XePrime');

    await waitFor(() => expect(checklist().getByText('Đã đủ điều kiện gửi duyệt')).toBeTruthy());
  });

  /* Tài khoản nhận tiền không còn là một mục — nó không sống trên hồ sơ này nữa. */
  it('KHÔNG còn mục "Tài khoản nhận tiền" trong checklist', () => {
    renderWorkspace(makeShop());

    expect(checklist().queryByText('Tài khoản nhận tiền')).toBeNull();
  });

  it('hồ sơ đang chờ xác minh: không còn checklist — không có gì để sửa nữa', () => {
    renderWorkspace({ ...makeShop(), verification: SHOP_VERIFICATION.PENDING });

    expect(screen.queryByRole('region', { name: 'Hoàn thiện hồ sơ' })).toBeNull();
  });
});

describe('Gửi duyệt', () => {
  it('hồ sơ thiếu mục bắt buộc → KHÔNG mở hộp xác nhận, không gọi API, nói còn thiếu mấy mục', async () => {
    const { onSubmitReview } = renderWorkspace(needsRevisionShop({ displayName: '' }));

    fireEvent.click(submitReviewButton());

    await waitFor(() => expect(screen.getByText(/Còn 1 mục chưa điền đúng/)).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSubmitReview).not.toHaveBeenCalled();
  });

  it('hồ sơ đủ và không có thay đổi chưa lưu → gửi thẳng, không kèm bản sửa', async () => {
    const { onSubmitReview } = renderWorkspace(needsRevisionShop());

    await confirmSubmitReview();

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledTimes(1));
    expect(onSubmitReview.mock.calls[0]?.[0]).toBeNull();
  });

  it('còn thay đổi chưa lưu → gửi kèm bản sửa để trang lưu trước rồi mới gửi', async () => {
    const { onSubmitReview } = renderWorkspace(needsRevisionShop());

    editSomething('Demo XePrime đổi tên');
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    await confirmSubmitReview();

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledTimes(1));
    const body = onSubmitReview.mock.calls[0]?.[0];
    expect(body?.displayName).toBe('Demo XePrime đổi tên');
  });

  it('thiếu quyền `tenant.submit_review` → không có nút Gửi duyệt', () => {
    renderWorkspace(needsRevisionShop(), { canSubmit: false });

    expect(screen.queryByRole('button', { name: /^Gửi lại xác minh$/ })).toBeNull();
  });

  /*
   * ADR 0040 — thanh toán mở tuyến gói, không còn cổng "phải xác minh trước". Nút gửi xác minh ở
   * trạng thái `unverified` vì thế không đổi lấy được gì cho người bấm, trong khi nó vẫn KHOÁ hồ
   * sơ khỏi việc sửa suốt thời gian chờ. Một hành động chỉ có giá mà không có giá trị thì ẩn hẳn.
   */
  it('chưa xác minh: KHÔNG mời gửi xác minh — nó không còn mở ra gì', () => {
    renderWorkspace(makeShop());

    expect(screen.queryByRole('button', { name: /Gửi.*xác minh/ })).toBeNull();
  });

  /*
   * 16/09/2026 — dải trạng thái KHÔNG còn rơi về nút "Thêm xe" khi không có gì để gửi. Đăng xe
   * chẳng liên quan gì tới chủ đề của dải, và đặt nó đúng chỗ người dùng vừa học được là "nút ở
   * đây giải quyết tình trạng ở đây" là một nút nói dối.
   */
  it('đang chờ xác minh: dải chỉ còn là thông tin, không có nút nào', () => {
    renderWorkspace({ ...makeShop(), verification: SHOP_VERIFICATION.PENDING });

    expect(screen.queryByRole('button', { name: /Gửi.*xác minh/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Thêm xe/ })).toBeNull();
    expect(screen.getByText('Hồ sơ đang chờ nền tảng xác minh')).toBeTruthy();
  });
});

describe('Dải trạng thái nói đúng chặng đang đứng', () => {
  /*
   * ADR 0036: dải này nói về trục XÁC MINH, không về `tenants.status`. Và nó tuyệt đối không
   * được nói "xe chỉ lên chợ sau khi hồ sơ được duyệt" nữa — câu đó đúng trước ADR 0036 và sai
   * sau nó, vì tuyến hoa hồng đăng xe thẳng qua cổng duyệt XE.
   */
  /*
   * ADR 0040: "chưa xác minh" thôi là một tin. Nó không chặn gì và không còn việc gì để làm, nên
   * một dải chiếm trọn bề ngang nói về nó chỉ dạy người dùng bỏ qua vùng đó.
   */
  it('chưa xác minh: KHÔNG dựng dải nào', () => {
    renderWorkspace(makeShop());

    expect(screen.queryByText('Gian hàng chưa được xác minh')).toBeNull();
    expect(screen.queryByText('Hồ sơ đang chờ nền tảng xác minh')).toBeNull();
  });

  it('bị trả về: hiện NGUYÊN VĂN lý do đội duyệt viết', () => {
    renderWorkspace(needsRevisionShop());

    expect(screen.getByText('Nền tảng yêu cầu bổ sung hồ sơ')).toBeTruthy();
    expect(screen.getByText(/Ảnh giấy phép kinh doanh bị mờ/)).toBeTruthy();
  });

  /* Đã xác minh xong = không có tin gì. Nhãn trạng thái cạnh tên gian hàng đã nói điều đó. */
  it('đã xác minh: KHÔNG dựng dải nào — một dải "mọi thứ đều ổn" chỉ dạy người dùng bỏ qua nó', () => {
    renderWorkspace({ ...makeShop(), verification: SHOP_VERIFICATION.VERIFIED });

    expect(screen.queryByText('Gian hàng đã được xác minh')).toBeNull();
  });
});
