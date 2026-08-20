import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TENANT_STATUS } from '@xeprime/types';
import { ShopProfileWorkspace } from './ShopProfileWorkspace';
import type { MyShop } from '../types';

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

function renderWorkspace(shop: MyShop, onSubmit = vi.fn(), canEdit = true) {
  const view = render(
    <App>
      <ShopProfileWorkspace
        shop={shop}
        canEdit={canEdit}
        saving={false}
        onSubmit={onSubmit}
        banner={null}
      />
    </App>,
  );
  return { ...view, onSubmit };
}

const saveButton = () => screen.getByRole('button', { name: /Lưu thông tin/ });
const phoneInput = () => screen.getByLabelText(/Số điện thoại/);

/** Một chỉnh sửa bất kỳ để form chuyển sang trạng thái "có thay đổi". */
function editSomething(value = '0988888888') {
  fireEvent.change(phoneInput(), { target: { value } });
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
    const { container } = renderWorkspace(makeShop(), vi.fn(), false);

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
    const { onSubmit } = renderWorkspace(makeShop({ ownerFullName: null, ownerPhone: null }));

    // Sửa một ô để bật nút Lưu, nhưng vẫn để trống hai ô bắt buộc.
    fireEvent.change(screen.getByLabelText(/Mã số thuế/), { target: { value: '0312345678' } });
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.getByText('Họ tên chủ gian hàng là bắt buộc')).toBeTruthy());
    expect(screen.getByText('Số điện thoại chủ gian hàng là bắt buộc')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('SĐT sai định dạng → chặn tại chỗ', async () => {
    const { onSubmit } = renderWorkspace(makeShop());

    editSomething('12345');
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.getByText('Số điện thoại không hợp lệ')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('gửi lên MÃ tỉnh + thông tin chủ gian hàng, và KHÔNG gửi tên tỉnh', async () => {
    const { onSubmit } = renderWorkspace(makeShop());

    editSomething('0988888888');
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false));
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const body = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.provinceCode).toBe('79');
    expect(body).not.toHaveProperty('provinceName');
    expect(body.ownerFullName).toBe('Nguyễn Văn A');
    expect(body.ownerPhone).toBe('0988888888');
    expect(body.ownerEmail).toBe('chu@xeprime.vn');
  });
});
