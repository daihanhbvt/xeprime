import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/services/api-client';
import { PlanFormModal } from './PlanFormModal';
import type { Plan } from '../types';

/**
 * Đặc tả PlanFormModal sau ADR 0041: chế độ thu phí quyết định form là CÁI GÌ (tuyến hoa hồng
 * chỉ có %, bậc gian hàng có trần + bảng giá), giá gửi lên là con số TUYỆT ĐỐI của từng kỳ hạn,
 * kỳ bỏ trống KHÔNG lọt vào `termPrices`, `code` bị khoá khi sửa (định danh — ADR 0010), và
 * nhân bản là TẠO MỚI điền sẵn.
 *
 * Nhãn ô có dấu bắt buộc đặt SAU chữ ("Tên gói*"), nên các truy vấn theo nhãn dùng regex neo đầu.
 */
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const remove = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-plan-mutations', () => ({
  useCreatePlan: () => create,
  useUpdatePlan: () => update,
  useDeletePlan: () => remove,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const PLAN: Plan = {
  id: 'P1',
  code: 'shop-basic',
  name: 'Gói cơ bản',
  description: 'Mô tả',
  billingMode: BILLING_MODE.PACKAGE,
  commissionPercent: null,
  limits: {
    maxVehicles: 3,
    maxBranches: 1,
    maxMembers: null,
    termPrices: [
      { months: 1, price: '100000' },
      { months: 12, price: '800000' },
    ],
    salesOnly: false,
    recommended: true,
    graceDays: 7,
    features: ['finance'],
  },
  currency: 'VND',
  sortOrder: 1,
  subscriptionCount: 3,
  deletable: false,
  status: 'active',
  createdAt: '2026-08-01T00:00:00.000Z',
} as Plan;

const COMMISSION_PLAN: Plan = {
  ...PLAN,
  id: 'P0',
  code: 'free',
  name: 'Tuyến hoa hồng mặc định',
  billingMode: BILLING_MODE.COMMISSION,
  commissionPercent: 10,
  limits: { ...PLAN.limits, maxVehicles: null, maxBranches: null, termPrices: [], features: [] },
} as Plan;

function renderModal(
  plan: Plan | null,
  { template = null, allowCommission = false }: { template?: Plan | null; allowCommission?: boolean } = {},
) {
  const onClose = vi.fn();
  renderWithIntl(
    <App>
      <PlanFormModal
        open
        plan={plan}
        template={template}
        allowCommission={allowCommission}
        onClose={onClose}
      />
    </App>,
  );
  return { onClose };
}

const byLabel = (text: string) => screen.getByLabelText<HTMLInputElement>(new RegExp(`^${text}`));
const queryLabel = (text: string) => screen.queryByLabelText(new RegExp(`^${text}`));

/** Điền bộ tối thiểu hợp lệ của một BẬC GIAN HÀNG ở chế độ tạo (mặc định của form). */
function fillMinimalPackage() {
  fireEvent.change(byLabel('Mã gói'), { target: { value: '  shop-gold  ' } });
  fireEvent.change(byLabel('Tên gói'), { target: { value: 'Gói Gold' } });
}

beforeEach(() => {
  create.mutate.mockReset();
  update.mutate.mockReset();
  remove.mutate.mockReset();
  remove.isPending = false;
  create.isPending = false;
  update.isPending = false;
});

afterEach(cleanup);

describe('PlanFormModal — chế độ tạo', () => {
  /*
   * Danh mục chỉ được có ĐÚNG MỘT bậc `commission` và nó đã tồn tại từ seed
   * (`COMMISSION_PLAN_IS_SINGLETON` — ADR 0038 điều 13). Mở form ở chế độ đó là mở sẵn con đường
   * duy nhất mà server sẽ từ chối.
   */
  it('mặc định là BẬC GIAN HÀNG, không phải tuyến hoa hồng', () => {
    renderModal(null);
    expect(screen.getByText('Tạo gói dịch vụ')).toBeTruthy();
    expect(byLabel('Mã gói')).toBeTruthy();
    expect(byLabel('Số xe tối đa')).toBeTruthy();
    expect(queryLabel('Tỷ lệ hoa hồng')).toBeNull();
  });

  it('ô trống của trần xe hiện "Không giới hạn", lời giải thích nằm sau dấu "i"', () => {
    renderModal(null);
    expect(byLabel('Số xe tối đa').placeholder).toBe('Không giới hạn');
    expect(screen.getAllByRole('button', { name: 'Giải thích về ô để trống' }).length).toBeGreaterThan(0);
    // Không còn dòng ghi chú hiện thẳng dưới ô.
    expect(screen.queryByText('Bỏ trống = không giới hạn')).toBeNull();
  });

  it('gửi payload: giá TUYỆT ĐỐI dạng string, kỳ bỏ trống KHÔNG vào bảng giá', async () => {
    renderModal(null);
    fillMinimalPackage();
    fireEvent.change(byLabel('Số xe tối đa'), { target: { value: '3' } });
    fireEvent.change(byLabel('Giá kỳ 1 tháng'), { target: { value: '100000' } });
    fireEvent.change(byLabel('Giá kỳ 12 tháng'), { target: { value: '800000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    const payload = create.mutate.mock.calls[0]![0];
    expect(payload.code).toBe('shop-gold');
    expect(payload.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(payload.limits.maxVehicles).toBe(3);
    // Chỉ hai kỳ được nhập — kỳ trống là "không bán", khác hẳn với 0đ (ADR 0041 điều 2).
    expect(payload.limits.termPrices).toEqual([
      { months: 1, price: '100000' },
      { months: 12, price: '800000' },
    ]);
    // ADR 0007: tiền qua API là string, không phải number.
    expect(typeof payload.limits.termPrices[0].price).toBe('string');
  });

  it('kỳ 1 tháng là "Giá tham chiếu"; % tiết kiệm tính NGAY từ giá đang gõ', async () => {
    renderModal(null);
    fireEvent.change(byLabel('Giá kỳ 1 tháng'), { target: { value: '100000' } });
    fireEvent.change(byLabel('Giá kỳ 3 tháng'), { target: { value: '250000' } });

    expect(await screen.findByText('Giá tham chiếu')).toBeTruthy();
    // 250.000 so với 3 × 100.000 ⇒ tiết kiệm 17%.
    expect(await screen.findByText('Tiết kiệm 17%')).toBeTruthy();
  });

  it('nút xoá giá của một kỳ = không bán kỳ đó', async () => {
    renderModal(PLAN);
    const clear = screen.getByRole('button', { name: 'Xoá giá kỳ 12 tháng' }) as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    // Kỳ chưa có giá thì không có gì để xoá.
    expect(
      (screen.getByRole('button', { name: 'Xoá giá kỳ 3 tháng' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(clear);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    expect(update.mutate.mock.calls[0]![0].limits.termPrices).toEqual([
      { months: 1, price: '100000' },
    ]);
  });

  it('bật "Chỉ bán qua tư vấn" thì bảng giá biến mất và payload có termPrices rỗng', async () => {
    renderModal(null);
    fillMinimalPackage();
    fireEvent.change(byLabel('Giá kỳ 1 tháng'), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('switch', { name: /Chỉ bán qua tư vấn/ }));

    await waitFor(() => expect(queryLabel('Giá kỳ 1 tháng')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    const payload = create.mutate.mock.calls[0]![0];
    expect(payload.limits.salesOnly).toBe(true);
    expect(payload.limits.termPrices).toEqual([]);
  });

  it('bấm dấu "i" trong hàng công tắc KHÔNG lật công tắc', () => {
    renderModal(null);
    const toggle = screen.getByRole('switch', { name: /Chỉ bán qua tư vấn/ });
    fireEvent.click(screen.getByRole('button', { name: 'Giải thích về bán qua tư vấn' }));
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  /*
   * Mã gói là định danh và unique ở DB PHÂN BIỆT hoa/thường — cho lưu chữ hoa là để "XX003" và
   * "xx003" thành hai gói. Nên form nhận chữ hoa/có dấu/dấu cách rồi chuẩn hoá NGAY khi gõ.
   */
  it('mã gói gõ chữ hoa, có dấu, dấu cách được chuẩn hoá ngay khi gõ', async () => {
    renderModal(null);
    fireEvent.change(byLabel('Mã gói'), { target: { value: 'Gói VIP 1' } });
    expect(byLabel('Mã gói').value).toBe('goi-vip-1');

    fireEvent.change(byLabel('Mã gói'), { target: { value: 'XX003-' } });
    expect(byLabel('Mã gói').value).toBe('xx003-');
    fireEvent.change(byLabel('Tên gói'), { target: { value: 'Gói XX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    // Gạch cuối (đang gõ dở) bị cắt lúc gửi.
    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(create.mutate.mock.calls[0]![0].code).toBe('xx003');
  });

  it('mã gói quá ngắn thì không gửi', async () => {
    renderModal(null);
    fillMinimalPackage();
    fireEvent.change(byLabel('Mã gói'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() =>
      expect(screen.getByText('Mã gói cần 2–50 ký tự (chữ, số, gạch nối)')).toBeTruthy(),
    );
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it('lỗi ở một ô NÂNG CAO đang gập thì tự mở phần đó ra', async () => {
    renderModal(null);
    fillMinimalPackage();
    // Số lẻ: `InputNumber` không phát onChange cho số âm (dưới `min`), nhưng số lẻ thì có — và
    // schema chặn nó bằng lỗi "số nguyên".
    fireEvent.change(byLabel('Ân hạn sau hết hạn'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Cài đặt nâng cao/ }).getAttribute('aria-expanded'),
      ).toBe('true'),
    );
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it('thành công: báo "Đã tạo gói" rồi đóng', async () => {
    const { onClose } = renderModal(null);
    fillMinimalPackage();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalled());
    create.mutate.mock.calls[0]![1].onSuccess();

    expect(await screen.findByText('Đã tạo gói')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('chỉ cho chọn "Hoa hồng theo chuyến" khi danh mục CHƯA có bậc đó', () => {
    renderModal(null, { allowCommission: false });
    expect((byLabel('Loại gói') as HTMLInputElement).disabled).toBe(true);
    cleanup();

    renderModal(null, { allowCommission: true });
    expect((byLabel('Loại gói') as HTMLInputElement).disabled).toBe(false);
  });
});

describe('PlanFormModal — nhân bản', () => {
  it('TẠO MỚI điền sẵn từ gói gốc: mã trống, tên "(bản sao)", bỏ nhãn đề xuất', async () => {
    renderModal(null, { template: PLAN });

    expect(screen.getByText('Nhân bản gói dịch vụ')).toBeTruthy();
    expect(byLabel('Mã gói').value).toBe('');
    expect(byLabel('Tên gói').value).toBe('Gói cơ bản (bản sao)');
    expect(byLabel('Số xe tối đa').value).toBe('3');

    fireEvent.change(byLabel('Mã gói'), { target: { value: 'shop-basic-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    const payload = create.mutate.mock.calls[0]![0];
    expect(payload.code).toBe('shop-basic-2');
    expect(payload.limits.termPrices).toEqual(
      PLAN.limits.termPrices.map((term) => ({ months: term.months, price: term.price })),
    );
    expect(payload.limits.recommended).toBe(false);
    expect(payload.sortOrder).toBe(PLAN.sortOrder + 1);
    expect(update.mutate).not.toHaveBeenCalled();
  });
});

describe('PlanFormModal — chế độ sửa', () => {
  it('tiêu đề sửa, KHÔNG có ô mã gói, loại gói bị khoá, điền sẵn trần + bảng giá', () => {
    renderModal(PLAN);
    expect(screen.getByText('Sửa gói dịch vụ')).toBeTruthy();
    expect(queryLabel('Mã gói')).toBeNull();
    expect((byLabel('Loại gói') as HTMLInputElement).disabled).toBe(true);
    expect(byLabel('Tên gói').value).toBe('Gói cơ bản');
    expect(byLabel('Số xe tối đa').value).toBe('3');
    // MoneyInput format có dấu chấm nhóm.
    expect(byLabel('Giá kỳ 1 tháng').value).toContain('100');
  });

  it('gọi update kèm id, KHÔNG gửi commissionPercent cho bậc gian hàng', async () => {
    const { onClose } = renderModal(PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    const payload = update.mutate.mock.calls[0]![0];
    expect(payload.id).toBe('P1');
    // Tuyến gói: KHÔNG gửi commissionPercent — service tự xoá, không có tổ hợp package + %.
    expect('commissionPercent' in payload).toBe(false);
    expect(payload.limits.termPrices).toHaveLength(2);
    expect(payload.limits.recommended).toBe(true);
    expect(create.mutate).not.toHaveBeenCalled();

    update.mutate.mock.calls[0]![1].onSuccess();
    expect(await screen.findByText('Đã cập nhật gói')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PlanFormModal — xoá gói nháp', () => {
  const DRAFT = { ...PLAN, id: 'P-draft', name: 'Gói nháp', subscriptionCount: 0, deletable: true } as Plan;

  it('chỉ gói server báo `deletable` mới có nút "Xoá gói"', () => {
    renderModal({ ...PLAN, deletable: false } as Plan);
    expect(screen.queryByRole('button', { name: 'Xoá gói' })).toBeNull();
    cleanup();

    renderModal(null);
    expect(screen.queryByRole('button', { name: 'Xoá gói' })).toBeNull();
    cleanup();

    renderModal(DRAFT);
    expect(screen.getByRole('button', { name: 'Xoá gói' })).toBeTruthy();
  });

  it('xoá phải xác nhận; thành công thì báo và đóng', async () => {
    const { onClose } = renderModal(DRAFT);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá gói' }));
    expect(remove.mutate).not.toHaveBeenCalled();

    expect(await screen.findAllByText('Xoá gói “Gói nháp”?')).not.toHaveLength(0);
    const confirmButtons = screen.getAllByRole('button', { name: 'Xoá gói' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(remove.mutate).toHaveBeenCalledTimes(1));
    expect(remove.mutate.mock.calls[0]![0]).toBe('P-draft');
    remove.mutate.mock.calls[0]![1].onSuccess();

    expect(await screen.findByText('Đã xoá gói “Gói nháp”')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bị từ chối vì đã có người dùng: báo theo MÃ, KHÔNG đóng form', async () => {
    const { onClose } = renderModal(DRAFT);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá gói' }));
    await screen.findAllByText('Xoá gói “Gói nháp”?');
    const confirmButtons = screen.getAllByRole('button', { name: 'Xoá gói' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(remove.mutate).toHaveBeenCalledTimes(1));
    remove.mutate.mock.calls[0]![1].onError(
      new ApiClientError({ status: 409, code: 'PLAN_IN_USE', message: 'x' }),
    );

    expect(await screen.findByText(/không xoá được — hãy tắt gói thay vì xoá/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('PlanFormModal — tuyến hoa hồng', () => {
  it('chỉ có %, không có trần nào để sửa và không có bảng giá', () => {
    renderModal(COMMISSION_PLAN);

    expect(byLabel('Tỷ lệ hoa hồng / chuyến')).toBeTruthy();
    expect(queryLabel('Số xe tối đa')).toBeNull();
    expect(queryLabel('Giá kỳ 1 tháng')).toBeNull();
    expect(queryLabel('Tính năng của gói')).toBeNull();
  });

  /*
   * Trần của tuyến hoa hồng là `OWNER_LITE_VEHICLE_LIMIT` trong code, không phải dữ liệu bậc —
   * form hiện nó ra như THÔNG TIN để admin không đi tìm, nhưng không có ô nhập nào.
   */
  it('hiện trần Owner Lite dưới dạng thông tin, không phải ô nhập', () => {
    renderModal(COMMISSION_PLAN);
    expect(screen.getByText('3 xe')).toBeTruthy();
    expect(screen.getByText('1 chi nhánh')).toBeTruthy();
  });

  /*
   * Form của tuyến hoa hồng KHÔNG có ô cho `graceDays`/`features`, nên gửi một `limits` dựng từ
   * default của form sẽ lặng lẽ xoá cờ năng lực và số ngày ân hạn mà seed đã đặt. Bỏ trống
   * `limits` là cách nói "giữ nguyên" với `updatePlan`.
   */
  it('KHÔNG gửi limits — giữ nguyên cờ năng lực và ân hạn đang lưu', async () => {
    renderModal(COMMISSION_PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    const payload = update.mutate.mock.calls[0]![0];
    expect('limits' in payload).toBe(false);
    expect(payload.commissionPercent).toBe(10);
  });
});

describe('PlanFormModal — lỗi', () => {
  it('lỗi thường: toast theo MÃ (fallback khi không có mã) và KHÔNG đóng', async () => {
    const { onClose } = renderModal(PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalled());
    update.mutate.mock.calls[0]![1].onError(new Error('Mã gói đã tồn tại'));

    // ADR 0012: không hiện message thô của backend — không có mã thì rơi về câu chung.
    expect(await screen.findByText('Đã có lỗi xảy ra. Vui lòng thử lại.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('PlanFormModal — vỏ dialog', () => {
  it('đang gửi thì nút chính loading và nút Huỷ bị khoá', () => {
    update.isPending = true;
    renderModal(PLAN);
    expect(screen.getByRole('button', { name: /Lưu/ }).className).toContain('ant-btn-loading');
    expect((screen.getByRole('button', { name: 'Huỷ' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('nút Huỷ gọi onClose', () => {
    const { onClose } = renderModal(PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
