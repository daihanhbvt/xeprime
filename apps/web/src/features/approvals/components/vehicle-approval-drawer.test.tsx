import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_ERROR_CODE,
  APPROVAL_DECISION,
  APPROVAL_STATUS,
  VEHICLE_REVIEW_BASIS,
} from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { carReview, electricCarReview, motorbikeReview } from '../test-utils';
import type { VehicleApprovalDetail } from '../types';
import { VehicleApprovalDrawer } from './VehicleApprovalDrawer';

/**
 * Drawer chi tiết phiếu duyệt xe.
 *
 * Khoá những thứ mà nếu sai thì người duyệt QUYẾT ĐỊNH SAI, không chỉ nhìn xấu:
 *  - hồ sơ hiện đúng trường của loại xe / nguồn năng lượng, không bịa trường không áp dụng;
 *  - KHÔNG có bất kỳ phần giấy tờ nào (luồng đăng xe không thu đăng ký/đăng kiểm/bảo hiểm);
 *  - danh mục tự động chấm bằng CHÍNH cổng gửi duyệt; danh mục thủ công lưu qua API;
 *  - Phê duyệt khoá tới khi đủ thủ công, và luôn có bước xác nhận;
 *  - Từ chối / Yêu cầu bổ sung bắt buộc lý do;
 *  - phiếu đã bị người khác xử lý thì nói ra và không mời bấm nữa;
 *  - xe sống đã khác hồ sơ gửi duyệt thì Phê duyệt tắt và nói vì sao;
 *  - rời phiếu khi ghi chú còn chữ chưa lưu thì phải hỏi lại.
 */
const detail = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const decision = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  variables: undefined as unknown,
}));
const setCheck = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));
const saveNote = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

// Giữ bản THẬT của các hàm thuần (`isStaleApprovalError`) — chỉ thay các hook gọi mạng.
vi.mock('../hooks/use-vehicle-approvals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/use-vehicle-approvals')>()),
  useVehicleApproval: () => detail,
  useVehicleApprovalDecision: () => decision,
  useSetVehicleApprovalCheck: () => setCheck,
  useSaveVehicleApprovalNote: () => saveNote,
}));

vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

const messages = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
const modals = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    App: Object.assign(actual.App, { useApp: () => ({ message: messages, modal: modals }) }),
  };
});

const onNavigate = vi.fn();
const onClose = vi.fn();

function renderDrawer(
  data: VehicleApprovalDetail | undefined,
  neighbours: { previousId?: string | null; nextId?: string | null } = {},
) {
  detail.data = data;
  return render(
    <App>
      <VehicleApprovalDrawer
        taskId={data?.approvalTaskId ?? 'T-LOADING'}
        previousId={neighbours.previousId ?? null}
        nextId={neighbours.nextId ?? null}
        onNavigate={onNavigate}
        onClose={onClose}
      />
    </App>,
  );
}

/** Lưới nhãn–giá trị: tìm giá trị đứng cạnh một nhãn. */
function valueFor(label: string): string {
  const dt = screen.getAllByText(label, { selector: 'dt' })[0]!;
  return dt.nextElementSibling?.textContent ?? '';
}

const allChecksPassed = (d: VehicleApprovalDetail): VehicleApprovalDetail => ({
  ...d,
  manualChecks: d.manualChecks.map((check) => ({
    ...check,
    passed: true,
    updatedAt: '2026-06-08T03:00:00.000Z',
    updatedByName: 'Reviewer A',
  })),
});

const approveButton = () => screen.getByRole('button', { name: 'Phê duyệt' });

/**
 * Hộp thoại đã được lệnh ĐÓNG. jsdom không chạy animation nên DOM của modal còn lại ở pha
 * `ant-zoom-leave` — lớp đó (không phải việc biến mất khỏi DOM) là dấu hiệu `open` đã về `false`.
 */
function isClosing(modal: HTMLElement): boolean {
  return modal.classList.contains('ant-zoom-leave');
}

/**
 * Hộp thoại theo TIÊU ĐỀ. Không tìm bằng `getByRole('dialog', { name })`: trong môi trường test
 * AntD gán cùng một id `test-id` cho `aria-labelledby` của cả panel lẫn modal, nên tên khả truy
 * cập của modal trỏ nhầm sang tiêu đề panel.
 */
async function findModal(title: string): Promise<HTMLElement> {
  const heading = await screen.findByText(title, { selector: '.ant-modal-title' });
  return heading.closest('.ant-modal') as HTMLElement;
}

beforeEach(() => {
  detail.data = undefined;
  detail.isLoading = false;
  detail.isError = false;
  detail.refetch.mockReset();
  decision.mutate.mockReset();
  decision.isPending = false;
  decision.variables = undefined;
  setCheck.mutate.mockReset();
  saveNote.mutate.mockReset();
  messages.error.mockReset();
  messages.success.mockReset();
  modals.confirm.mockReset();
  onNavigate.mockReset();
  onClose.mockReset();
});

afterEach(cleanup);

describe('Header + nguồn đăng', () => {
  it('ô tô gian hàng: tiêu đề, mã xe, trạng thái, tên xe, chip "Ô tô" và "Gian hàng: Huế Rental"', () => {
    renderDrawer(carReview());

    expect(screen.getByText('Chi tiết xe')).toBeTruthy();
    expect(screen.getAllByText('XE-240608-014').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chờ duyệt').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Toyota Vios 2023' })).toBeTruthy();
    expect(screen.getByText('Gian hàng: Huế Rental')).toBeTruthy();
  });

  it('xe máy cá nhân: chip chỉ "Cá nhân" — không kèm tên người', () => {
    renderDrawer(motorbikeReview());

    expect(screen.queryByText(/^Cá nhân: /)).toBeNull();
    expect(screen.getAllByText('Cá nhân').length).toBeGreaterThan(0);
  });

  it('nút trước/sau điều hướng trong hàng đợi; ở đầu hàng thì nút trước bị khoá', () => {
    renderDrawer(carReview(), { previousId: null, nextId: 'T-NEXT' });

    expect(screen.getByRole('button', { name: 'Xe trước' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Xe sau' }));
    expect(onNavigate).toHaveBeenCalledWith('T-NEXT');
    expect(modals.confirm).not.toHaveBeenCalled();
  });

  it('ghi chú còn chữ CHƯA LƯU: sang xe khác / đóng phải xác nhận, không bỏ âm thầm', async () => {
    renderDrawer(carReview(), { nextId: 'T-NEXT' });

    fireEvent.change(screen.getByRole('textbox', { name: /Ghi chú nội bộ/ }), {
      target: { value: 'Chủ xe hẹn gửi ảnh biển số rõ hơn' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xe sau' }));

    await waitFor(() => expect(modals.confirm).toHaveBeenCalledTimes(1));
    expect(onNavigate).not.toHaveBeenCalled();

    // Người duyệt chọn bỏ ghi chú ⇒ mới điều hướng.
    const options = modals.confirm.mock.calls[0]![0] as { onOk: () => void };
    options.onOk();
    expect(onNavigate).toHaveBeenCalledWith('T-NEXT');
  });
});

describe('Hồ sơ theo loại xe / nguồn năng lượng', () => {
  it('ô tô xăng: số chỗ, kiểu dáng, hộp số, mức tiêu thụ; KHÔNG phân khúc xe máy', () => {
    renderDrawer(carReview());

    expect(valueFor('Số chỗ')).toBe('5 chỗ');
    expect(valueFor('Kiểu dáng')).toBe('Sedan');
    expect(valueFor('Hộp số')).toBe('Số tự động (AT)');
    expect(valueFor('Mức tiêu thụ nhiên liệu')).toBe('6,2 L/100km');
    expect(valueFor('Hãng xe')).toBe('Toyota');
    expect(screen.queryByText('Phân khúc', { selector: 'dt' })).toBeNull();
    expect(screen.queryByText('Dung tích động cơ', { selector: 'dt' })).toBeNull();
  });

  it('xe máy: phân khúc + dung tích; KHÔNG số chỗ, KHÔNG lít/100km trống', () => {
    renderDrawer(motorbikeReview());

    expect(valueFor('Phân khúc')).toBe('Xe số');
    expect(valueFor('Dung tích động cơ')).toBe('155 cc');
    expect(screen.queryByText('Số chỗ', { selector: 'dt' })).toBeNull();
    expect(screen.queryByText('Mức tiêu thụ nhiên liệu', { selector: 'dt' })).toBeNull();
  });

  it('xe điện: quãng đường mỗi lần sạc + dung lượng pin; KHÔNG lít/100km', () => {
    renderDrawer(electricCarReview());

    expect(valueFor('Quãng đường mỗi lần sạc')).toBe('326 km');
    expect(valueFor('Dung lượng pin')).toBe('37,23 kWh');
    expect(screen.queryByText('Mức tiêu thụ nhiên liệu', { selector: 'dt' })).toBeNull();
  });

  it('giá & chính sách đúng dữ liệu đã nhập: giao xe, miễn phí, bậc phí, giới hạn km, điều khoản', () => {
    renderDrawer(carReview());

    expect(valueFor('Giá ngày thường')).toMatch(/700\.000/);
    expect(valueFor('Giảm giá')).toBe('10%');
    expect(valueFor('Tự động nhận chuyến')).toBe('Tắt');
    expect(valueFor('Giao xe tận nơi')).toBe('Bật');
    expect(valueFor('Bán kính giao xe tối đa')).toBe('30 km');
    expect(valueFor('Miễn phí giao xe')).toBe('Trong 5 km');
    expect(valueFor('Phí giao xe')).toMatch(/5–30 km: 150\.000/);
    expect(valueFor('Giới hạn quãng đường')).toBe('300 km/ngày');
    expect(valueFor('Phí vượt giới hạn')).toMatch(/3\.000.*\/km/);
    expect(valueFor('Điều khoản riêng')).toBe('Xuất trình giấy phép lái xe khi nhận xe');
    expect(screen.getByText('Chính sách riêng của xe')).toBeTruthy();
  });

  it('điểm nhận xe: địa chỉ ĐẦY ĐỦ, không chỉ tên tỉnh; chủ xe ≠ người gửi', () => {
    renderDrawer(carReview());

    expect(valueFor('Điểm nhận xe')).toBe('Chi nhánh Trung tâm');
    expect(valueFor('Địa chỉ')).toBe('25 Hùng Vương, Phường Phú Nhuận, Thành phố Huế');
    expect(valueFor('Chủ xe')).toMatch(/Chủ Huế Rental/);
    expect(valueFor('Người gửi duyệt')).toMatch(/Nguyễn Văn Minh/);
    expect(valueFor('Người gửi duyệt')).toMatch(/0901234567/);
  });

  it('chủ xe tự gửi: nói ra điều đó thay vì lặp lại cùng một người', () => {
    renderDrawer(motorbikeReview());
    expect(valueFor('Người gửi duyệt')).toBe('Chủ xe tự gửi');
  });

  it('tiện nghi hiện NHÃN, không bao giờ khoá kỹ thuật', async () => {
    renderDrawer(carReview());
    fireEvent.click(screen.getByText('Tiện nghi & mô tả'));

    await waitFor(() => expect(screen.getByText('Camera lùi')).toBeTruthy());
    expect(screen.queryByText('backup_camera')).toBeNull();
  });

  it('toàn bộ ảnh trong snapshot đều hiện, có alt', () => {
    renderDrawer(carReview());
    const images = screen.getAllByRole('img', { name: /Ảnh \d của Toyota Vios 2023/ });
    expect(images).toHaveLength(4);
  });
});

describe('Không có giấy tờ nào chưa được thu thập', () => {
  it.each([
    ['ô tô', carReview()],
    ['xe máy', motorbikeReview()],
  ])('%s: không có mục / nhãn giấy tờ, đăng ký, đăng kiểm, bảo hiểm', (_name, data) => {
    const { container } = renderDrawer(data);
    const text = container.ownerDocument.body.textContent ?? '';

    expect(text).not.toMatch(/Giấy tờ/i);
    expect(text).not.toMatch(/Đăng ký xe|Đăng kiểm|Bảo hiểm|TNDS/i);
    expect(text).not.toMatch(/khớp giấy tờ/i);
  });
});

describe('Danh mục kiểm tra', () => {
  it('tự động: chấm bằng cổng gửi duyệt — chỉ mục áp dụng, mục thiếu là "Chưa đạt"', () => {
    const base = carReview();
    renderDrawer({ ...base, vehicle: { ...base.vehicle, plateNumber: null } });

    const auto = within(screen.getByRole('region', { name: 'Kiểm tra tự động' }));
    // Xe chỉ tự lái: không bị chấm giá có tài xế / giá dài hạn.
    expect(auto.queryByText('Có giá thuê có tài xế')).toBeNull();
    expect(auto.queryByText('Có giá thuê dài hạn')).toBeNull();
    const plateRow = auto.getByText('Đã nhập biển số').closest('li')!;
    expect(within(plateRow).getByText('Chưa đạt')).toBeTruthy();
    expect(auto.getByText('Đủ tối thiểu 4 ảnh khác nhau')).toBeTruthy();
    expect(auto.getByText('6/7 đạt')).toBeTruthy();
  });

  it('thủ công: đánh dấu một mục gọi API lưu (không chỉ đổi state)', () => {
    renderDrawer(carReview());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ảnh đúng với xe đăng' }));
    expect(setCheck.mutate).toHaveBeenCalledWith(
      { id: carReview().approvalTaskId, key: 'photos_match', passed: true },
      expect.anything(),
    );
  });

  it('thủ công: mục đã lưu hiện người + thời điểm (tải lại không mất)', () => {
    renderDrawer(allChecksPassed(carReview()));

    expect(screen.getAllByText(/Reviewer A · /).length).toBe(5);
    expect(screen.getByText('5/5 đạt')).toBeTruthy();
  });
});

describe('Quyết định', () => {
  it('xe sống đã khác hồ sơ gửi duyệt: Phê duyệt tắt kể cả khi đủ thủ công, và nói vì sao', () => {
    renderDrawer({
      ...allChecksPassed(carReview()),
      approvalBlockers: { changedLockedFields: ['plateNumber'], missingRequirements: ['photos'] },
    });

    expect(approveButton()).toHaveProperty('disabled', true);
    const alert = screen
      .getByText('Chưa thể phê duyệt: xe đã khác hồ sơ gửi duyệt')
      .closest('.ant-alert') as HTMLElement;
    expect(within(alert).getByText('Biển số')).toBeTruthy();
    expect(within(alert).getByText('Đủ tối thiểu 4 ảnh khác nhau')).toBeTruthy();
    expect(
      screen.getByText('Xe đã khác hồ sơ gửi duyệt — chỉ có thể yêu cầu bổ sung hoặc từ chối'),
    ).toBeTruthy();
    // Lối đi tiếp vẫn mở.
    expect(screen.getByRole('button', { name: 'Yêu cầu bổ sung' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('lượt quyết định của phiếu KHÁC còn đang bay không khoá nút của phiếu này', () => {
    decision.isPending = true;
    decision.variables = { id: '01TASKOTHER00000000000000', kind: APPROVAL_DECISION.APPROVE };
    renderDrawer(allChecksPassed(carReview()));

    expect(approveButton()).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Từ chối' })).toHaveProperty('disabled', false);
  });

  it('thiếu mục thủ công: Phê duyệt KHOÁ, dòng nhắc hiện', () => {
    renderDrawer(carReview());

    expect(approveButton()).toHaveProperty('disabled', true);
    expect(screen.getByText('Hoàn tất kiểm tra thủ công trước khi phê duyệt')).toBeTruthy();
  });

  it('đủ thủ công: Phê duyệt mở bước XÁC NHẬN, xác nhận mới gọi API', async () => {
    renderDrawer(allChecksPassed(carReview()));

    expect(approveButton()).toHaveProperty('disabled', false);
    fireEvent.click(approveButton());
    expect(decision.mutate).not.toHaveBeenCalled();

    const dialog = await findModal('Phê duyệt xe này?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Phê duyệt' }));
    expect(decision.mutate).toHaveBeenCalledWith(
      { id: carReview().approvalTaskId, kind: APPROVAL_DECISION.APPROVE, reason: undefined },
      expect.anything(),
    );
  });

  it('từ chối BẮT BUỘC lý do: nút gửi khoá khi trống, gửi kèm lý do đã trim', async () => {
    renderDrawer(carReview());

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    const dialog = await findModal('Từ chối xe');
    const submit = within(dialog).getByRole('button', { name: 'Từ chối xe' });
    expect(submit).toHaveProperty('disabled', true);

    fireEvent.change(within(dialog).getByLabelText(/Lý do gửi chủ xe/), {
      target: { value: '  Ảnh không phải xe thật  ' },
    });
    await waitFor(() => expect(submit).toHaveProperty('disabled', false));
    fireEvent.click(submit);

    await waitFor(() =>
      expect(decision.mutate).toHaveBeenCalledWith(
        {
          id: carReview().approvalTaskId,
          kind: APPROVAL_DECISION.REJECT,
          reason: 'Ảnh không phải xe thật',
        },
        expect.anything(),
      ),
    );
  });

  it('yêu cầu bổ sung dùng được khi checklist CHƯA xong; chỉ khoảng trắng → không gửi', async () => {
    renderDrawer(carReview());

    fireEvent.click(screen.getByRole('button', { name: 'Yêu cầu bổ sung' }));
    const dialog = await findModal('Yêu cầu bổ sung');
    fireEvent.change(within(dialog).getByLabelText(/Lý do gửi chủ xe/), {
      target: { value: '   ' },
    });
    expect(within(dialog).getByRole('button', { name: 'Gửi yêu cầu' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(decision.mutate).not.toHaveBeenCalled();
  });

  it('phiếu đã bị người khác xử lý: báo lỗi theo MÃ lỗi', async () => {
    decision.mutate.mockImplementation((_vars, options: { onError: (e: unknown) => void }) =>
      options.onError(
        new ApiClientError({
          code: API_ERROR_CODE.APPROVAL_ALREADY_DECIDED,
          message: 'Phiếu này đã được xử lý.',
          status: 409,
        }),
      ),
    );
    renderDrawer(allChecksPassed(carReview()));

    fireEvent.click(approveButton());
    const dialog = await findModal('Phê duyệt xe này?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Phê duyệt' }));

    // Câu lỗi dịch từ MÃ (`Errors.code.APPROVAL_ALREADY_DECIDED`), không phải message tiếng Việt
    // của backend; việc nạp lại chi tiết + hàng đợi là của hook (`refreshIfStale`).
    expect(decision.mutate).toHaveBeenCalledTimes(1);
    expect(messages.error).toHaveBeenCalledWith(
      'Phiếu này vừa được người khác xử lý. Đang tải lại trạng thái mới nhất.',
    );
  });

  it.each([
    [API_ERROR_CODE.APPROVAL_ALREADY_DECIDED, true],
    [API_ERROR_CODE.APPROVAL_SUBJECT_CHANGED, true],
    [API_ERROR_CODE.INTERNAL_ERROR, false],
  ])(
    'lỗi %s: hộp thoại đóng = %s (thứ đang hiện đã cũ thì không còn gì để hỏi)',
    async (code, closes) => {
      decision.mutate.mockImplementation((_vars, options: { onError: (e: unknown) => void }) =>
        options.onError(new ApiClientError({ code, message: 'x', status: closes ? 409 : 500 })),
      );
      renderDrawer(allChecksPassed(carReview()));

      fireEvent.click(approveButton());
      const dialog = await findModal('Phê duyệt xe này?');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Phê duyệt' }));

      expect(messages.error).toHaveBeenCalledTimes(1);
      if (closes) {
        await waitFor(() => expect(isClosing(dialog)).toBe(true));
      } else {
        // Lỗi mạng/máy chủ: giữ hộp thoại để người duyệt thử lại, không bắt mở lại từ đầu.
        expect(isClosing(dialog)).toBe(false);
      }
    },
  );

  it('kết quả về muộn của phiếu A không đóng hộp thoại đang mở của phiếu B', async () => {
    let settleA: ((error: unknown) => void) | undefined;
    decision.mutate.mockImplementationOnce(
      (_vars, options: { onError: (e: unknown) => void }) => (settleA = options.onError),
    );
    const { rerender } = renderDrawer(allChecksPassed(carReview()));
    fireEvent.click(approveButton());
    fireEvent.click(
      within(await findModal('Phê duyệt xe này?')).getByRole('button', { name: 'Phê duyệt' }),
    );

    // Sang phiếu B khi lượt của A còn đang bay, và mở hộp thoại của B.
    const b = allChecksPassed(carReview({ approvalTaskId: '01TASKB000000000000000000' }));
    detail.data = b;
    rerender(
      <App>
        <VehicleApprovalDrawer
          taskId={b.approvalTaskId}
          previousId={null}
          nextId={null}
          onNavigate={onNavigate}
          onClose={onClose}
        />
      </App>,
    );
    // Hộp thoại của A còn trong DOM (pha đóng) cũng có nút "Phê duyệt" — bấm nút ở thanh quyết định.
    const footer = document.querySelector('.ant-drawer-footer') as HTMLElement;
    fireEvent.click(within(footer).getByRole('button', { name: 'Phê duyệt' }));
    const dialogB = await findModal('Phê duyệt xe này?');
    await waitFor(() => expect(isClosing(dialogB)).toBe(false));

    settleA?.(
      new ApiClientError({
        code: API_ERROR_CODE.APPROVAL_ALREADY_DECIDED,
        message: 'x',
        status: 409,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isClosing(dialogB)).toBe(false);
  });

  it('phiếu đã xử lý: không còn nút quyết định, hiện kết quả + lý do đã gửi chủ xe', () => {
    renderDrawer({
      ...carReview(),
      approvalStatus: APPROVAL_STATUS.NEEDS_REVISION,
      reviewedAt: '2026-06-09T02:00:00.000Z',
      reviewedByName: 'Reviewer B',
      reason: 'Bổ sung ảnh nội thất.',
    });

    expect(screen.queryByRole('button', { name: 'Phê duyệt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).toBeNull();
    expect(screen.getByText('Phiếu đã được xử lý: Yêu cầu bổ sung')).toBeTruthy();
    expect(screen.getByText('Lý do đã gửi chủ xe: Bổ sung ảnh nội thất.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Ảnh đúng với xe đăng' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('Trạng thái tải / lỗi / phiếu cũ', () => {
  it('đang tải: khung xương, chưa có nút quyết định', () => {
    detail.isLoading = true;
    renderDrawer(undefined);

    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Phê duyệt' })).toBeNull();
  });

  it('lỗi: câu riêng + Thử lại gọi refetch', () => {
    detail.isError = true;
    renderDrawer(undefined);

    expect(screen.getByText('Không tải được hồ sơ xe')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(detail.refetch).toHaveBeenCalledTimes(1);
  });

  it('phiếu cũ không có snapshot: cảnh báo đây là dữ liệu HIỆN TẠI', () => {
    renderDrawer({ ...carReview(), basis: VEHICLE_REVIEW_BASIS.LIVE });

    expect(
      screen.getByText('Phiếu này gửi trước khi hệ thống lưu ảnh chụp hồ sơ đầy đủ'),
    ).toBeTruthy();
  });
});
