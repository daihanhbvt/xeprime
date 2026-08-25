import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VEHICLE_OPERATION_STATUS } from '@xeprime/types';

import { RECEIPT_LINK_MODE, type ReceiptLinkMode } from '../constants';

import { renderWithIntl } from '@/i18n/test-utils';

import type { ReceiptVehicleOption } from '../types';

import { ReceiptFormDrawer } from './ReceiptFormDrawer';

/**
 * Form tạo phiếu thu/chi — phần **phiếu này gắn vào đâu**.
 *
 * Ba điều phải sống sót:
 *  1. Chế độ QUYẾT ĐỊNH cái gì được gửi. Chọn một đơn rồi đổi sang "gắn xe" mà vẫn gửi
 *     `bookingId` cũ là gửi một liên kết người dùng đã bỏ — và backend sẽ từ chối bằng một lỗi
 *     họ không hiểu, vì ô đơn thuê đã biến mất khỏi màn hình.
 *  2. Chọn chế độ có liên kết thì PHẢI chọn đối tượng — không có nó, "quên chọn xe" đi lọt
 *     xuống server và quay về dưới dạng một phiếu không gắn vào đâu.
 *  3. Xe đã xoá / không còn thuộc gian hàng được nói ra NGAY tại ô chọn, không phải sau khi
 *     người dùng gõ xong mọi ô rồi bấm Lưu.
 *
 * ⚠️ Giới hạn đã biết (giống `receipts-page.test.tsx`): `Select` của AntD 6 không chốt được lựa
 * chọn dưới jsdom bằng sự kiện tổng hợp. Nên xe được đưa vào form qua `initialVehicleId` (chính
 * là đường đi thật khi mở từ hồ sơ xe), còn `Radio.Group` thì bấm được bình thường.
 */

const hooks = vi.hoisted(() => ({
  vehicles: {
    data: [] as ReceiptVehicleOption[] | undefined,
    isFetching: false,
    isError: false,
  },
  vehicleArgs: undefined as unknown,
  createMutate: vi.fn(),
}));

vi.mock('../hooks/use-finance-categories', () => ({
  useFinanceCategories: () => ({ data: [], isFetching: false }),
}));

vi.mock('../hooks/use-booking-options', () => ({
  useBookingOptions: () => ({ data: [], isFetching: false, isError: false }),
}));

vi.mock('../hooks/use-vehicle-options', () => ({
  useVehicleOptions: (q: string, enabled: boolean, includeId?: string | null) => {
    hooks.vehicleArgs = { q, enabled, includeId };
    return hooks.vehicles;
  },
}));

vi.mock('../hooks/use-receipt-mutations', () => ({
  useCreateReceipt: () => ({ mutate: hooks.createMutate, isPending: false }),
}));

/** Upload đi qua R2 — ngoài phạm vi form này, và jsdom không có `fetch` tới đó. */
vi.mock('@/services/upload', () => ({ presignReceiptAttachment: vi.fn() }));

function vehicle(over: Partial<ReceiptVehicleOption> = {}): ReceiptVehicleOption {
  return {
    id: 'v-9',
    code: 'XE-009',
    name: 'Vios 2021',
    plateNumber: '51A-12345',
    imageUrl: null,
    operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
    branchId: 'b-1',
    branchName: 'Chi nhánh Quận 1',
    currentBookingId: null,
    currentBookingCode: null,
    currentCustomerName: null,
    currentDebtAmount: null,
    ...over,
  };
}

function renderDrawer(initialVehicleId?: string | null) {
  return renderWithIntl(
    <App>
      <ReceiptFormDrawer open onClose={vi.fn()} initialVehicleId={initialVehicleId} />
    </App>,
  );
}

/**
 * Thẻ chọn chế độ mang cả nhãn lẫn câu mô tả, nên tìm theo TÊN hiển thị là tìm theo một chuỗi
 * gộp dễ vỡ. Đi theo `value` — chính là mã nghiệp vụ đi trong form (`RECEIPT_LINK_MODE`).
 */
function radios(): HTMLInputElement[] {
  return screen
    .getAllByRole('radio')
    .filter((input): input is HTMLInputElement => input instanceof HTMLInputElement);
}

function pickMode(mode: ReceiptLinkMode) {
  const input = radios().find((candidate) => candidate.value === mode);
  if (!input) throw new Error(`Không thấy thẻ chế độ "${mode}"`);
  fireEvent.click(input);
}

/** Chế độ đang chọn — đọc từ chính input radio, `jest-dom` không có ở bộ test này. */
function checkedMode(): string | undefined {
  return radios().find((input) => input.checked)?.value;
}

/** Điền số tiền + diễn giải (bắt buộc) rồi gửi — mọi test dưới đây chỉ nói về phần liên kết. */
function fillAndSubmit(amount = '250000') {
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: amount } });
  fireEvent.change(screen.getByRole('textbox', { name: /Diễn giải/ }), {
    target: { value: 'Rửa xe' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Tạo khoản/ }));
}

function submittedBody(): Record<string, unknown> {
  return hooks.createMutate.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  hooks.vehicles = { data: [vehicle()], isFetching: false, isError: false };
  hooks.vehicleArgs = undefined;
  hooks.createMutate.mockReset();
});

afterEach(cleanup);

describe('ReceiptFormDrawer — chọn cái gì để gắn', () => {
  it('mặc định KHÔNG gắn gì: gửi lên không có đơn lẫn xe', async () => {
    renderDrawer();

    expect(checkedMode()).toBe(RECEIPT_LINK_MODE.NONE);
    fillAndSubmit();

    await waitFor(() => expect(hooks.createMutate).toHaveBeenCalledTimes(1));
    const body = submittedBody();
    expect(body.bookingId).toBeUndefined();
    expect(body.vehicleId).toBeUndefined();
    expect(body.amount).toBe('250000');
  });

  it('mở từ hồ sơ xe: vào thẳng chế độ "Xe", xe đã chọn sẵn và đọc lại được', () => {
    renderDrawer('v-9');

    expect(checkedMode()).toBe(RECEIPT_LINK_MODE.VEHICLE);
    // Xin server đích danh xe đang chọn — đó là thứ giữ cho ô chọn hiện tên xe chứ không phải id.
    expect(hooks.vehicleArgs).toMatchObject({ enabled: true, includeId: 'v-9' });
    // Đủ để nhận ra nhầm lẫn giữa hai chiếc cùng đời ở hai bãi khác nhau.
    expect(screen.getByText('XE-009 · Vios 2021 · 51A-12345')).toBeTruthy();
    expect(screen.getByText('Vios 2021 (51A-12345)')).toBeTruthy();
    expect(screen.getByText('Chi nhánh Quận 1')).toBeTruthy();
    expect(screen.getByText('Sẵn sàng')).toBeTruthy();
  });

  it('gắn xe: gửi lên có vehicleId, KHÔNG có bookingId', async () => {
    renderDrawer('v-9');
    fillAndSubmit();

    await waitFor(() => expect(hooks.createMutate).toHaveBeenCalledTimes(1));
    expect(submittedBody()).toMatchObject({ vehicleId: 'v-9' });
    expect(submittedBody().bookingId).toBeUndefined();
  });

  it('đổi sang "Không gắn" thì xe đã chọn KHÔNG lén đi theo', async () => {
    renderDrawer('v-9');
    pickMode(RECEIPT_LINK_MODE.NONE);
    fillAndSubmit();

    await waitFor(() => expect(hooks.createMutate).toHaveBeenCalledTimes(1));
    expect(submittedBody().vehicleId).toBeUndefined();
  });

  it('chọn chế độ "Đơn thuê" mà chưa chọn đơn thì không gửi đi', async () => {
    renderDrawer('v-9');
    pickMode(RECEIPT_LINK_MODE.BOOKING);
    fillAndSubmit();

    expect(await screen.findByText('Chọn đơn thuê để gắn phiếu')).toBeTruthy();
    expect(hooks.createMutate).not.toHaveBeenCalled();
  });

  it('chọn chế độ "Xe" mà chưa chọn xe thì không gửi đi', async () => {
    renderDrawer();
    pickMode(RECEIPT_LINK_MODE.VEHICLE);
    fillAndSubmit();

    expect(await screen.findByText('Chọn xe để gắn phiếu')).toBeTruthy();
    expect(hooks.createMutate).not.toHaveBeenCalled();
  });

  it('chỉ hỏi danh sách xe khi đang ở chế độ gắn xe', () => {
    renderDrawer();
    expect(hooks.vehicleArgs).toMatchObject({ enabled: false });

    pickMode(RECEIPT_LINK_MODE.VEHICLE);
    expect(hooks.vehicleArgs).toMatchObject({ enabled: true });
  });
});

describe('ReceiptFormDrawer — phần điền và nút gửi', () => {
  /*
   * Diễn giải BẮT BUỘC là ràng buộc của phiếu NHẬP TAY, không phải của DTO (backend vẫn nhận
   * null cho phiếu tự động). Một dòng sổ "500.000 · Tiền mặt · chi" không nói được nó là xăng
   * hay phí gửi xe, và ba tháng sau không ai đối chiếu được nữa.
   */
  it('thiếu diễn giải thì không gửi đi', async () => {
    renderDrawer();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '250000' } });
    fireEvent.click(screen.getByRole('button', { name: /Tạo khoản/ }));

    expect(await screen.findByText('Nhập diễn giải / lý do')).toBeTruthy();
    expect(hooks.createMutate).not.toHaveBeenCalled();
  });

  it('nhãn nút nói rõ đang tạo khoản THU hay khoản CHI', () => {
    renderDrawer();
    // Mặc định là phiếu chi — nút phải nói đúng thứ sắp xảy ra, không phải "Lưu" chung chung.
    expect(screen.getByRole('button', { name: 'Tạo khoản chi' })).toBeTruthy();
  });

  it('số tiền đọc thành chữ ngay dưới ô nhập', () => {
    renderDrawer();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2340000' } });

    expect(screen.getByText(/Hai triệu ba trăm bốn mươi nghìn/i)).toBeTruthy();
  });

  it('"Tạo và tiếp tục nhập mới": giữ form mở và GIỮ ngữ cảnh xe vừa dùng', async () => {
    renderDrawer('v-9');
    fireEvent.click(screen.getByRole('checkbox', { name: /tiếp tục nhập mới/i }));
    fillAndSubmit();

    await waitFor(() => expect(hooks.createMutate).toHaveBeenCalledTimes(1));
    // Nhập một xấp hoá đơn của cùng một chiếc xe: chọn lại xe sau mỗi phiếu là trả giá cho
    // việc thường xuyên nhất.
    expect(checkedMode()).toBe(RECEIPT_LINK_MODE.VEHICLE);
    expect(radios().find((input) => input.checked)).toBeTruthy();
  });
});

describe('ReceiptFormDrawer — bố cục', () => {
  /*
   * NHÃN NẰM TRÊN Ô NHẬP.
   *
   * `Form.Item` không có `<Form>` tổ tiên rơi về layout NGANG mặc định của AntD: nhãn nằm bên
   * trái kèm dấu hai chấm, ăn mất một phần ba bề ngang và đẩy ba thẻ "Khoản này là" xuống hai
   * dòng. Không typecheck nào bắt được — nó chỉ lộ ra trên màn hình, nên khoá bằng test.
   */
  it('mọi trường xếp dọc: nhãn trên ô nhập, không có dấu hai chấm', () => {
    renderDrawer();

    const items = document.querySelectorAll('.ant-form-item');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.classList.contains('ant-form-item-vertical')).toBe(true);
    }
    // Dấu hai chấm là triệu chứng nhìn thấy được của layout ngang — nó phải không có ở đâu cả.
    expect(screen.getByText('Ngày phát sinh').textContent).toBe('Ngày phát sinh');
  });

  it('chứng từ: ẢNH hiện ra chính nó, PDF mới rơi về icon + tên', () => {
    renderDrawer();

    // Chưa nộp gì thì chỉ có ô "Thêm tệp", và điều kiện nhận tệp là MỘT dòng gọn.
    expect(screen.getByRole('button', { name: 'Thêm tệp' })).toBeTruthy();
    expect(screen.getByText('JPG, PNG, PDF · tối đa 10MB')).toBeTruthy();
  });
});

describe('ReceiptLinkCard — đọc lại đối tượng trước khi ghi tiền', () => {
  it('xe đang có khách: thẻ hiện trạng thái, khách và số còn nợ của chuyến', () => {
    hooks.vehicles = {
      data: [
        vehicle({
          operationStatus: VEHICLE_OPERATION_STATUS.RENTING,
          currentBookingId: 'bk-1',
          currentBookingCode: 'BK-0005',
          currentCustomerName: 'Trần Thị Bình',
          currentDebtAmount: '2340000',
        }),
      ],
      isFetching: false,
      isError: false,
    };
    renderDrawer('v-9');

    expect(screen.getByText('Đang thuê')).toBeTruthy();
    expect(screen.getByText('Trần Thị Bình')).toBeTruthy();
    expect(screen.getByText('2.340.000 ₫')).toBeTruthy();
  });

  it('xe đang rảnh: KHÔNG bịa ra dòng khách/còn nợ rỗng', () => {
    renderDrawer('v-9');

    // Nhãn "Khách"/"Còn nợ" không được dựng ra chút nào — dấu hai chấm là của CSS, nên tìm
    // theo 'Khách:' sẽ luôn null và khẳng định đó vô nghĩa.
    expect(screen.queryByText('Khách')).toBeNull();
    expect(screen.queryByText('Còn nợ')).toBeNull();
    // Nhưng chi nhánh thì vẫn phải còn — dải chân không biến mất, chỉ ngắn lại.
    expect(screen.getByText('Chi nhánh Quận 1')).toBeTruthy();
  });

  it('mở hồ sơ xe ở tab mới — form đang điền dở không bị bỏ lại', () => {
    renderDrawer('v-9');

    const link = screen.getByRole('link', { name: /Xem chi tiết/ });
    expect(link.getAttribute('href')).toBe('/manage/vehicles/v-9');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

describe('ReceiptFormDrawer — trạng thái của ô chọn xe', () => {
  it('xe đang chọn không còn thuộc gian hàng: nói ngay tại form', () => {
    // Server có `includeId` mà vẫn không trả xe đó về ⇒ nó đã bị xoá hoặc đã chuyển đi.
    hooks.vehicles = { data: [], isFetching: false, isError: false };
    renderDrawer('v-9');

    expect(screen.getByText(/không còn trong gian hàng/i)).toBeTruthy();
  });

  it('không tìm thấy xe nào khớp: nói rõ là rỗng, không phải đang tải', () => {
    hooks.vehicles = { data: [], isFetching: false, isError: false };
    renderDrawer();
    pickMode(RECEIPT_LINK_MODE.VEHICLE);

    expect(screen.getByText('Không tìm thấy xe nào khớp.')).toBeTruthy();
  });

  it('tải danh sách xe hỏng: báo lỗi kèm lối thử lại, không im lặng', () => {
    hooks.vehicles = { data: undefined, isFetching: false, isError: true };
    renderDrawer();
    pickMode(RECEIPT_LINK_MODE.VEHICLE);

    expect(screen.getByText(/Không tải được danh sách xe/)).toBeTruthy();
    // Đang lỗi thì KHÔNG đồng thời nói "không tìm thấy xe nào" — hai câu mâu thuẫn nhau.
    expect(screen.queryByText('Không tìm thấy xe nào khớp.')).toBeNull();
  });

  it('đang tải thì chưa kết luận xe đã biến mất', () => {
    hooks.vehicles = { data: undefined, isFetching: true, isError: false };
    renderDrawer('v-9');

    expect(screen.queryByText(/không còn trong gian hàng/i)).toBeNull();
  });
});
