import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TENANT_STATUS } from '@xeprime/types';
import { ShopProfileWorkspace } from './ShopProfileWorkspace';
import type { MyShop, UpdateProfileInput } from '../types';

/**
 * Màn hồ sơ gian hàng.
 *
 * Những thứ test này khoá, đều là chỗ đã sai hoặc dễ sai lại:
 *
 * 1. **Hai nút ở tiêu đề đi theo `isDirty`.** Chưa sửa gì: Lưu mờ, Huỷ bỏ không tồn tại. Sửa rồi:
 *    Lưu sáng, Huỷ bỏ xuất hiện. Đây là ràng buộc về HÀNH VI, không phải trang trí — một nút Lưu
 *    lúc nào cũng sáng làm người dùng không trả lời được câu "mình đã đổi gì chưa".
 * 2. **Chủ gian hàng là bắt buộc** — hồ sơ duyệt phải liên hệ được với một người thật.
 * 3. **Gửi lên là MÃ tỉnh, không phải TÊN tỉnh.** Tên do server tra ra; client gửi tên là dữ liệu
 *    không kiểm soát được và nó từng làm hai cột tỉnh lệch hẳn nhau.
 * 4. **SĐT hiện dạng `09…` dù backend lưu `84…`** — không ai đọc số của mình ở dạng lưu.
 * 5. **Gửi duyệt VALIDATE TRƯỚC.** Nút này từng bỏ qua form hoàn toàn: nó sáng cả khi họ tên và
 *    SĐT chủ gian hàng còn trống, nên người duyệt nhận một hồ sơ không liên hệ được với ai.
 * 6. **Gửi duyệt LƯU NỐT thay đổi còn dở.** Backend snapshot hồ sơ từ DATABASE, nên gửi thẳng
 *    khi form còn dirty là đưa cho người duyệt đúng bản cũ mà chủ shop vừa sửa xong.
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

function makeShop(overrides: Partial<MyShop['profile']> = {}): MyShop {
  return {
    id: '01HSHOP00000000000000000A',
    code: 'SHOP-1',
    slug: 'demo-xeprime',
    name: 'Demo XePrime',
    tenantType: 'individual',
    status: 'draft',
    phone: null,
    email: null,
    latestApproval: null,
    defaultBranch: {
      id: '01HBRANCH0000000000000000',
      code: 'CN01',
      name: 'Chi nhánh Hồ Chí Minh',
      provinceCode: '79',
      provinceName: 'Hồ Chí Minh',
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
      bankName: null,
      bankAccountNo: null,
      bankAccountName: null,
      qrUrl: null,
      ownerFullName: 'Nguyễn Văn A',
      ownerPhone: '84901234567',
      ownerEmail: 'chu@xeprime.vn',
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
const phoneInput = () => screen.getByLabelText(/Số điện thoại/);
/** Nút trên DẢI trạng thái, không phải nút OK trong hộp xác nhận (hai nút cùng chữ). */
const submitReviewButton = () => screen.getAllByRole('button', { name: /^Gửi duyệt$/ })[0]!;
/** Thẻ checklist — nhãn mục ở đây TRÙNG nhãn ô trên form, nên mọi khẳng định phải khoanh vùng. */
const checklist = () => within(screen.getByRole('region', { name: 'Hoàn thiện hồ sơ' }));

/** Một chỉnh sửa bất kỳ để form chuyển sang trạng thái "có thay đổi". */
function editSomething(value = '0988888888') {
  fireEvent.change(phoneInput(), { target: { value } });
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

    editSomething('0901234567'); // đúng giá trị đang lưu
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', true));
    expect(screen.queryByRole('button', { name: /Huỷ bỏ/ })).toBeNull();
  });

  it('bấm Huỷ bỏ: form về giá trị đã lưu và chính nút đó biến mất', async () => {
    renderWorkspace(makeShop());

    editSomething();
    const cancel = await screen.findByRole('button', { name: /Huỷ bỏ/ });
    fireEvent.click(cancel);

    await waitFor(() => expect(phoneInput()).toHaveProperty('value', '0901234567'));
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

  it('hồ sơ đang chờ duyệt: khoá sửa và nói rõ vì sao', () => {
    const { container } = renderWorkspace({
      ...makeShop(),
      status: TENANT_STATUS.PENDING_REVIEW,
    });

    expect(container.querySelector('fieldset')).toHaveProperty('disabled', true);
    expect(screen.getByText('Hồ sơ đang chờ duyệt nên tạm khoá chỉnh sửa.')).toBeTruthy();
  });
});

describe('Nội dung gửi lên', () => {
  it('hiện SĐT chủ gian hàng ở dạng đọc được (09…) dù backend lưu 84…', () => {
    renderWorkspace(makeShop());
    expect(phoneInput()).toHaveProperty('value', '0901234567');
  });

  it('thiếu họ tên + SĐT chủ gian hàng → KHÔNG gọi API, báo lỗi ngay tại field', async () => {
    const { onSave } = renderWorkspace(makeShop({ ownerFullName: null, ownerPhone: null }));

    // Sửa một ô để bật nút Lưu, nhưng vẫn để trống hai ô bắt buộc.
    fireEvent.change(screen.getByLabelText(/Mã số thuế/), { target: { value: '0312345678' } });
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.getByText('Họ tên chủ gian hàng là bắt buộc')).toBeTruthy());
    expect(screen.getByText('Số điện thoại chủ gian hàng là bắt buộc')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('SĐT sai định dạng → chặn tại chỗ', async () => {
    const { onSave } = renderWorkspace(makeShop());

    editSomething('12345');
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.getByText('Số điện thoại không hợp lệ')).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('gửi lên MÃ tỉnh + thông tin chủ gian hàng, và KHÔNG gửi tên tỉnh', async () => {
    const { onSave } = renderWorkspace(makeShop());

    editSomething('0988888888');
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const body = onSave.mock.calls[0]![0];
    expect(body.provinceCode).toBe('79');
    expect(body).not.toHaveProperty('provinceName');
    expect(body.ownerFullName).toBe('Nguyễn Văn A');
    expect(body.ownerPhone).toBe('0988888888');
    expect(body.ownerEmail).toBe('chu@xeprime.vn');
  });
});

describe('Checklist hồ sơ', () => {
  it('đủ bốn mục bắt buộc: nhóm đó báo đã đủ điều kiện, mục NÊN CÓ vẫn liệt kê nhưng không chặn', () => {
    renderWorkspace(makeShop());

    expect(checklist().getByText('Đã đủ điều kiện gửi duyệt')).toBeTruthy();
    // Logo chưa có, và nó vẫn nằm trong bảng — chỉ là không cản đường gửi duyệt.
    expect(checklist().getByText('Logo gian hàng')).toBeTruthy();
    expect(checklist().getByText('Nên có — giúp khách chọn gian hàng của bạn')).toBeTruthy();
    expect(submitReviewButton()).toBeTruthy();
  });

  it('thiếu mục bắt buộc → nhóm đó vẫn là lời nhắc, không phải lời khẳng định', () => {
    renderWorkspace(makeShop({ ownerPhone: null }));

    expect(checklist().getByText('Bắt buộc để gửi duyệt')).toBeTruthy();
    expect(checklist().queryByText('Đã đủ điều kiện gửi duyệt')).toBeNull();
  });

  it('checklist đi theo ô ĐANG NHẬP, không phải hồ sơ đã lưu', async () => {
    renderWorkspace(makeShop({ ownerPhone: null }));
    expect(checklist().queryByText('Đã đủ điều kiện gửi duyệt')).toBeNull();

    // Vừa gõ xong là mục đó tick ngay — nút Gửi duyệt sẽ lưu nốt trước khi gửi, nên bảng này
    // đọc bản đang gõ mới đúng với thứ sắp được gửi đi.
    editSomething('0988888888');

    await waitFor(() => expect(checklist().getByText('Đã đủ điều kiện gửi duyệt')).toBeTruthy());
  });

  it('hồ sơ đang chờ duyệt: không còn checklist — không có gì để sửa nữa', () => {
    renderWorkspace({ ...makeShop(), status: TENANT_STATUS.PENDING_REVIEW });

    expect(screen.queryByRole('region', { name: 'Hoàn thiện hồ sơ' })).toBeNull();
  });
});

describe('Gửi duyệt', () => {
  it('hồ sơ thiếu mục bắt buộc → KHÔNG mở hộp xác nhận, không gọi API, nói còn thiếu mấy mục', async () => {
    const { onSubmitReview } = renderWorkspace(
      makeShop({ ownerFullName: null, ownerPhone: null }),
    );

    fireEvent.click(submitReviewButton());

    await waitFor(() => expect(screen.getByText(/Còn 2 mục chưa điền đúng/)).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSubmitReview).not.toHaveBeenCalled();
  });

  it('hồ sơ đủ và không có thay đổi chưa lưu → gửi thẳng, không kèm bản sửa', async () => {
    const { onSubmitReview } = renderWorkspace(makeShop());

    await confirmSubmitReview();

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledTimes(1));
    expect(onSubmitReview.mock.calls[0]?.[0]).toBeNull();
  });

  it('còn thay đổi chưa lưu → gửi kèm bản sửa để trang lưu trước rồi mới gửi', async () => {
    const { onSubmitReview } = renderWorkspace(makeShop());

    editSomething('0988888888');
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    await confirmSubmitReview();

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledTimes(1));
    const body = onSubmitReview.mock.calls[0]?.[0];
    expect(body?.ownerPhone).toBe('0988888888');
  });

  it('thiếu quyền `tenant.submit_review` → không có nút Gửi duyệt', () => {
    renderWorkspace(makeShop(), { canSubmit: false });

    expect(screen.queryByRole('button', { name: /^Gửi duyệt$/ })).toBeNull();
  });

  it('đang chờ duyệt: không còn nút gửi, thay bằng việc làm được ngay — thêm xe', () => {
    renderWorkspace({ ...makeShop(), status: TENANT_STATUS.PENDING_REVIEW });

    expect(screen.queryByRole('button', { name: /^Gửi duyệt$/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Thêm xe/ })).toBeTruthy();
  });
});

describe('Dải trạng thái nói đúng chặng đang đứng', () => {
  it('nháp: "chưa được gửi duyệt", KHÔNG phải "đang chờ duyệt"', () => {
    renderWorkspace(makeShop());

    expect(screen.getByText('Hồ sơ chưa được gửi duyệt')).toBeTruthy();
    expect(screen.queryByText('Hồ sơ đang chờ nền tảng duyệt')).toBeNull();
  });

  it('bị trả về: hiện NGUYÊN VĂN lý do đội duyệt viết', () => {
    renderWorkspace({
      ...makeShop(),
      status: TENANT_STATUS.NEEDS_REVISION,
      latestApproval: {
        status: 'needs_revision',
        reason: 'Ảnh giấy phép kinh doanh bị mờ',
        submittedAt: '2026-08-20T03:00:00.000Z',
        reviewedAt: '2026-08-20T04:00:00.000Z',
      },
    });

    expect(screen.getByText('Nền tảng yêu cầu bổ sung')).toBeTruthy();
    expect(screen.getByText(/Ảnh giấy phép kinh doanh bị mờ/)).toBeTruthy();
  });
});
