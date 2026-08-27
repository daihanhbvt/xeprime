import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HANDOVER_TYPE, PERMISSION } from '@xeprime/types';
import { ConfirmHandoverDialog } from './ConfirmHandoverDialog';
import type { Handover, HandoverContext } from '../types';

/**
 * Đặc tả hộp XÁC NHẬN GIAO/NHẬN XE — hành động chính duy nhất của mỗi đầu chuyến (Wave 10).
 *
 * Điều quan trọng nhất khoá ở đây: **ảnh hiện trạng phải BẤM TỚI ĐƯỢC**. Trước 20/08 cả bộ ảnh
 * 5 góc nằm sau prop `onOpenCondition` mà nơi gọi không bao giờ truyền, nên backend có đủ 4
 * endpoint ảnh còn người vận hành thì không có đường nào chụp — giao/nhận xe xong không còn một
 * tấm bằng chứng nào để đối chiếu khi trừ cọc.
 *
 * Điều quan trọng thứ hai: ảnh **TUỲ CHỌN** (design 14 §2). Một chuyến bình thường vẫn phải xong
 * bằng đúng một lần bấm, không ô nào chặn.
 */

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

const invalidate = vi.hoisted(() => vi.fn());
vi.mock('../hooks', () => ({ useInvalidateHandovers: () => invalidate }));

/** Thứ tự gọi API là thứ đang được khoá — nên ghi lại vào một mảng chung. */
const calls = vi.hoisted(() => [] as string[]);
const api = vi.hoisted(() => ({
  confirmHandover: vi.fn(),
  saveHandoverDraft: vi.fn(),
  presignHandoverPhoto: vi.fn(),
  attachHandoverPhoto: vi.fn(),
  removeHandoverPhoto: vi.fn(),
  fetchHandoverPhotoUrl: vi.fn(),
}));
vi.mock('../api', () => ({
  confirmHandover: (...a: unknown[]) => {
    calls.push('confirm');
    return api.confirmHandover(...a);
  },
  saveHandoverDraft: (...a: unknown[]) => {
    calls.push('saveDraft');
    return api.saveHandoverDraft(...a);
  },
  presignHandoverPhoto: (...a: unknown[]) => {
    calls.push('presign');
    return api.presignHandoverPhoto(...a);
  },
  attachHandoverPhoto: (...a: unknown[]) => {
    calls.push('attach');
    return api.attachHandoverPhoto(...a);
  },
  removeHandoverPhoto: (...a: unknown[]) => api.removeHandoverPhoto(...a),
  fetchHandoverPhotoUrl: (...a: unknown[]) => api.fetchHandoverPhotoUrl(...a),
}));

const upload = vi.hoisted(() => ({ toR2: vi.fn() }));
vi.mock('@/services/upload', () => ({
  uploadToR2: (...a: unknown[]) => upload.toR2(...a),
  // Không có lỗi định dạng: test này khoá luồng, không khoá bộ kiểm file.
  validateImageFile: () => null,
}));

function handover(overrides: Partial<Handover> = {}): Handover {
  return {
    id: 'ho-1',
    type: HANDOVER_TYPE.PICKUP,
    status: 'draft',
    rowVersion: 3,
    odometerKm: null,
    condition: null,
    notes: null,
    photos: [],
    confirmedAt: null,
    occurredAt: null,
    ...overrides,
  } as unknown as Handover;
}

function context(overrides: Partial<HandoverContext> = {}): HandoverContext {
  return {
    bookingId: 'bk-1',
    vehicleId: 'v-1',
    bookingCode: 'DH-001',
    vehicleName: 'Toyota Vios',
    plateNumber: '51H-123.45',
    bookingPickupAt: '2026-08-01T02:00:00.000Z',
    bookingReturnAt: '2026-08-03T02:00:00.000Z',
    vehicleOdometerKm: 12000,
    pickup: null,
    return: null,
    canStartPickup: true,
    canStartReturn: false,
    ...overrides,
  } as unknown as HandoverContext;
}

function renderDialog(ctx: HandoverContext = context()) {
  const onClose = vi.fn();
  render(
    <App>
      <ConfirmHandoverDialog
        context={ctx}
        type={HANDOVER_TYPE.PICKUP}
        open
        onClose={onClose}
      />
    </App>,
  );
  return { onClose };
}

/** Mở vùng "Thêm thông tin bàn giao" (đóng sẵn theo thiết kế). */
function openAdvanced() {
  fireEvent.click(screen.getByText(/Thêm thông tin bàn giao/));
}

function pickFile(name = 'truoc.jpg') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], name, { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  calls.length = 0;
  permissions.granted = new Set([
    PERMISSION.HANDOVER_VIEW,
    PERMISSION.HANDOVER_CONFIRM,
    PERMISSION.HANDOVER_MANAGE,
    PERMISSION.HANDOVER_FILE_VIEW,
  ]);
  Object.values(api).forEach((fn) => fn.mockReset());
  upload.toR2.mockReset().mockResolvedValue(undefined);
  invalidate.mockReset();
});

afterEach(cleanup);

describe('ConfirmHandoverDialog', () => {
  it('vùng nâng cao đóng sẵn — chuyến bình thường không thấy ô ảnh nào', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Xác nhận đã giao xe' })).toBeTruthy();
    expect(screen.queryByText('Ảnh hiện trạng')).toBeNull();
  });

  it('mở vùng nâng cao → có đủ 5 góc chụp, KHÔNG góc nào đánh dấu bắt buộc', () => {
    renderDialog();
    openAdvanced();

    expect(screen.getByText('Ảnh hiện trạng')).toBeTruthy();
    for (const label of ['Trước', 'Sau', 'Trái', 'Phải', 'Đồng hồ Odo']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Dấu `*` là lời hứa "bắt buộc" mà không tầng nào giữ — không được xuất hiện.
    expect(screen.queryByText('*')).toBeNull();
  });

  it('xác nhận được mà KHÔNG cần ảnh — ảnh là tuỳ chọn', async () => {
    api.confirmHandover.mockResolvedValue(context());
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã giao xe' }));

    await waitFor(() => expect(api.confirmHandover).toHaveBeenCalledTimes(1));
    expect(api.saveHandoverDraft).not.toHaveBeenCalled();
    const [bookingId, type, body] = api.confirmHandover.mock.calls[0]!;
    expect(bookingId).toBe('bk-1');
    expect(type).toBe(HANDOVER_TYPE.PICKUP);
    expect(body).not.toHaveProperty('photos');
  });

  /**
   * Ảnh cần một biên bản để gắn vào, mà luồng nhanh chưa tạo cái nào. Thứ tự `saveDraft →
   * presign → attach` chính là thứ giữ cho `presign` không ăn 404 "Chưa có biên bản bàn giao".
   */
  it('chọn ảnh đầu tiên → tạo biên bản nháp TRƯỚC rồi mới xin chỗ tải lên', async () => {
    api.saveHandoverDraft.mockResolvedValue(handover());
    api.presignHandoverPhoto.mockResolvedValue({ fileId: 'f-1', uploadUrl: 'https://r2/put' });
    api.attachHandoverPhoto.mockResolvedValue(
      handover({ rowVersion: 4, photos: [{ slot: 'front', fileId: 'f-1' }] } as Partial<Handover>),
    );

    renderDialog();
    openAdvanced();
    pickFile();

    await waitFor(() => expect(api.attachHandoverPhoto).toHaveBeenCalled());
    expect(calls).toEqual(['saveDraft', 'presign', 'attach']);
    expect(api.saveHandoverDraft).toHaveBeenCalledWith('bk-1', HANDOVER_TYPE.PICKUP, {});
  });

  /**
   * Ảnh nằm trên server ngay khi tải xong, kể cả khi người dùng đóng hộp mà chưa xác nhận —
   * nên ngữ cảnh bàn giao của màn cha phải được làm mới, không thì mở lại tưởng chưa có ảnh.
   */
  it('tải ảnh xong thì làm mới ngữ cảnh bàn giao của màn cha', async () => {
    api.saveHandoverDraft.mockResolvedValue(handover());
    api.presignHandoverPhoto.mockResolvedValue({ fileId: 'f-1', uploadUrl: 'https://r2/put' });
    api.attachHandoverPhoto.mockResolvedValue(handover({ rowVersion: 4 }));

    renderDialog();
    openAdvanced();
    pickFile();

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it('đã có biên bản nháp sẵn thì KHÔNG tạo thêm bản thứ hai', async () => {
    api.presignHandoverPhoto.mockResolvedValue({ fileId: 'f-1', uploadUrl: 'https://r2/put' });
    api.attachHandoverPhoto.mockResolvedValue(handover({ rowVersion: 4 }));

    renderDialog(context({ pickup: handover() } as Partial<HandoverContext>));
    openAdvanced();
    pickFile();

    await waitFor(() => expect(api.attachHandoverPhoto).toHaveBeenCalled());
    expect(api.saveHandoverDraft).not.toHaveBeenCalled();
    expect(calls).toEqual(['presign', 'attach']);
  });

  /**
   * `rowVersion` nhảy mỗi lần gắn ảnh. Gửi lại số cũ ở bước xác nhận là ăn 409 đúng vào lúc
   * người dùng vừa làm mọi thứ chỉn chu — nên phải dùng bản mới nhất đang cầm.
   */
  it('xác nhận dùng rowVersion MỚI sau khi tải ảnh, không phải số lúc mở hộp', async () => {
    api.presignHandoverPhoto.mockResolvedValue({ fileId: 'f-1', uploadUrl: 'https://r2/put' });
    api.attachHandoverPhoto.mockResolvedValue(handover({ rowVersion: 9 }));
    api.confirmHandover.mockResolvedValue(context());

    renderDialog(context({ pickup: handover({ rowVersion: 3 }) } as Partial<HandoverContext>));
    openAdvanced();
    pickFile();
    await waitFor(() => expect(api.attachHandoverPhoto).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã giao xe' }));

    await waitFor(() => expect(api.confirmHandover).toHaveBeenCalled());
    expect(api.confirmHandover.mock.calls[0]![2]).toMatchObject({ expectedRowVersion: 9 });
  });

  it('không có quyền quản lý biên bản → không dựng khối ảnh (endpoint sẽ 403)', () => {
    permissions.granted = new Set([PERMISSION.HANDOVER_VIEW, PERMISSION.HANDOVER_CONFIRM]);
    renderDialog();
    openAdvanced();

    expect(screen.queryByText('Ảnh hiện trạng')).toBeNull();
    // Vẫn xác nhận được: ảnh chưa bao giờ là điều kiện.
    expect(screen.getByRole('button', { name: 'Xác nhận đã giao xe' })).toBeTruthy();
  });

  it('vùng nâng cao vẫn giữ Odo, thời điểm thực tế và ghi chú', () => {
    renderDialog();
    openAdvanced();

    expect(screen.getByText('Chỉ số Odo khi giao (km)')).toBeTruthy();
    expect(screen.getByText('Thời gian giao xe thực tế')).toBeTruthy();
    expect(screen.getByText('Tình trạng xe')).toBeTruthy();
    expect(screen.getByText('Ghi chú')).toBeTruthy();
  });
});
