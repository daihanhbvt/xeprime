import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import {
  API_ERROR_CODE,
  MARKETPLACE_VISIBILITY_REASON,
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
} from '@xeprime/types';

import { vehiclePublicationTask } from '../publication';
import type { VehicleDetail } from '../types';
import { VehiclePublicationTaskItem } from './VehiclePublicationTaskItem';

/**
 * Việc "đưa xe lên chợ" trong thẻ Việc cần làm (ADR 0048, bố cục 23/09/2026).
 *
 * Điều bộ này khoá: MỘT việc, đúng tiêu đề của trạng thái, và **chỉ những nút backend thật sự
 * cho phép**. Ca dễ sai nhất là `hidden` — nền tảng đã gỡ xe xuống, nên một nút "Gửi duyệt lại"
 * ở đây sẽ dẫn thẳng tới 409 và dạy chủ xe rằng hệ thống hỏng.
 */
const submit = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('../hooks/use-vehicle-mutations', () => ({
  useSubmitVehiclePublic: () => submit,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const messages = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    App: Object.assign(actual.App, { useApp: () => ({ message: messages }) }),
  };
});

/** Xe ĐỦ điều kiện theo `publishChecklist` — mỗi test tự bỏ đi thứ nó cần thiếu. */
function makeVehicle(over: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: '01HVEH0000000000000000000',
    code: 'V-000001',
    name: 'Toyota Vios',
    vehicleType: 'car',
    plateNumber: '51K-123.45',
    publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
    marketplaceEnabled: true,
    isMarketplaceVisible: false,
    marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.NOT_APPROVED,
    mainImageUrl: 'https://img.example/main.jpg',
    images: ['https://img.example/1.jpg', 'https://img.example/2.jpg', 'https://img.example/3.jpg'],
    serviceTypes: ['self_drive'],
    weekdayPrice: '600000',
    brand: 'toyota',
    model: 'Vios',
    manufactureYear: 2022,
    seatCount: 5,
    fuelType: 'gasoline',
    transmission: 'automatic',
    fuelConsumptionCombined: 7.5,
    branch: { id: 'B1', code: 'CN01', name: 'Chi nhánh', provinceCode: '79' },
    latestPublicReview: null,
    ...over,
  } as unknown as VehicleDetail;
}

/** Dựng việc bằng CHÍNH luật của sản phẩm — không dựng task bằng tay, nếu không test chỉ kiểm chữ. */
function renderTask(over: Partial<VehicleDetail> = {}) {
  const vehicle = makeVehicle(over);
  const task = vehiclePublicationTask(vehicle);
  if (!task) throw new Error('fixture này không sinh ra việc nào — kiểm lại đề bài của test');
  return render(
    <App>
      <VehiclePublicationTaskItem vehicle={vehicle} task={task} />
    </App>,
  );
}

beforeEach(() => {
  perms.granted = new Set<string>([PERMISSION.VEHICLE_SUBMIT_PUBLIC, PERMISSION.VEHICLE_UPDATE]);
  submit.mutate.mockReset();
  submit.isPending = false;
  messages.error.mockReset();
  messages.success.mockReset();
});

afterEach(cleanup);

describe('vehiclePublicationTask — luật', () => {
  it('xe đã duyệt và đang bật: KHÔNG có việc nào', () => {
    expect(
      vehiclePublicationTask(
        makeVehicle({
          publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
          marketplaceEnabled: true,
          isMarketplaceVisible: true,
        }),
      ),
    ).toBeNull();
  });

  it('xe đã duyệt nhưng chủ xe tạm ẩn: một GỢI Ý (`info`), không phải cảnh báo', () => {
    const task = vehiclePublicationTask(
      makeVehicle({
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        marketplaceEnabled: false,
        isMarketplaceVisible: false,
        marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED,
      }),
    );
    expect(task?.key).toBe('ownerPaused');
    expect(task?.tone).toBe('info');
  });

  it('xe lưu trữ không còn việc nào để giục', () => {
    expect(
      vehiclePublicationTask(makeVehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.ARCHIVED })),
    ).toBeNull();
  });

  it('chỉ mở nút gửi duyệt khi checklist đã đủ — nút chắc chắn lỗi là nút không nên vẽ', () => {
    expect(vehiclePublicationTask(makeVehicle())?.primary?.kind).toBe('submit');
    expect(vehiclePublicationTask(makeVehicle({ weekdayPrice: null }))?.primary?.kind).toBe('edit');
    // Xe bị từ chối mà hồ sơ còn thiếu: chỉ còn lối SỬA, không có "Gửi duyệt lại".
    expect(
      vehiclePublicationTask(
        makeVehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.REJECTED, weekdayPrice: null }),
      )?.secondary,
    ).toBeNull();
  });
});

describe('VehiclePublicationTaskItem — nháp', () => {
  it('thiếu điều kiện: tiêu đề "Hoàn tất hồ sơ…", nêu ngắn phần thiếu, CTA mở đúng tab', () => {
    renderTask({ weekdayPrice: null });

    expect(screen.getByText('Hoàn tất hồ sơ để đưa xe lên chợ')).toBeTruthy();
    expect(screen.getByText('Còn thiếu: Giá tự lái (ngày thường).')).toBeTruthy();
    // Mục thiếu đầu tiên là GIÁ, nên nút mở thẳng tab giá chứ không thả vào tab mặc định.
    const cta = screen.getByRole('link', { name: /Hoàn tất hồ sơ/ });
    expect(cta.getAttribute('href')).toContain('/edit?tab=pricing');
    // Không có nút gửi duyệt khi hồ sơ còn thiếu.
    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
  });

  it('danh sách dài không đổ hết ra thẻ — phần dư đếm số, chi tiết nằm sau dấu "i"', () => {
    renderTask({ weekdayPrice: null, mainImageUrl: null, images: [], plateNumber: null });

    expect(screen.getByText(/mục khác/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Xem đầy đủ các mục còn thiếu/ })).toBeTruthy();
  });

  it('đủ điều kiện: tiêu đề "sẵn sàng", CTA "Gửi duyệt" gọi thẳng mutation', () => {
    renderTask();

    expect(screen.getByText('Xe đã sẵn sàng để xét duyệt')).toBeTruthy();
    expect(screen.getByText('Gửi hồ sơ để nền tảng kiểm tra trước khi hiển thị.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    expect(submit.mutate).toHaveBeenCalledTimes(1);
  });

  it('thiếu quyền gửi duyệt: không vẽ nút', () => {
    perms.granted = new Set<string>([PERMISSION.VEHICLE_UPDATE]);
    renderTask();

    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).toBeNull();
  });
});

describe('VehiclePublicationTaskItem — các trạng thái còn lại', () => {
  /*
   * 24/09/2026 — trạng thái chờ duyệt có lối SỬA, và vẫn không có nút gửi lại.
   *
   * Hai điều đó chỉ cùng đúng được từ khi mỗi lượt lưu dựng lại snapshot của phiếu: sửa xong là
   * người duyệt thấy bản mới, nên không còn gì để "gửi lại". Trước đó, ô này chỉ có lối xem
   * trạng thái và chủ xe phát hiện mình gõ sai biển số thì không có đường nào đi tiếp.
   */
  it('đang chờ duyệt: có lối SỬA hồ sơ, vẫn không có nút gửi lại', () => {
    renderTask({ publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW });

    expect(screen.getByText('Hồ sơ đang được xét duyệt')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cập nhật hồ sơ' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem trạng thái' })).toBeTruthy();
    // Gửi lại là thao tác của xe BỊ TRẢ VỀ. Ở đây phiếu vẫn đang chờ và đã mang bản mới nhất.
    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
    // …và câu mô tả phải NÓI RA điều đó, nếu không chẳng ai biết sửa là đủ.
    expect(screen.getByText(/mỗi lần lưu, người duyệt sẽ thấy bản mới nhất/i)).toBeTruthy();
  });

  it('cần bổ sung: CTA "Cập nhật hồ sơ" và hiện nguyên văn lời người duyệt', () => {
    renderTask({
      publicStatus: VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
      latestPublicReview: {
        status: 'needs_revision',
        reason: 'Ảnh đại diện bị mờ, gửi lại ảnh rõ hơn.',
        submittedAt: '2026-09-20T02:00:00.000Z',
        reviewedAt: '2026-09-21T02:00:00.000Z',
      },
    } as Partial<VehicleDetail>);

    expect(screen.getByText('Cần bổ sung thông tin')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cập nhật hồ sơ' })).toBeTruthy();
    expect(screen.getByText('Ảnh đại diện bị mờ, gửi lại ảnh rõ hơn.')).toBeTruthy();
  });

  it('bị từ chối: có lý do, và gửi lại được khi hồ sơ đã đủ', () => {
    renderTask({
      publicStatus: VEHICLE_PUBLIC_STATUS.REJECTED,
      latestPublicReview: {
        status: 'rejected',
        reason: 'Biển số không khớp giấy tờ.',
        submittedAt: '2026-09-20T02:00:00.000Z',
        reviewedAt: '2026-09-21T02:00:00.000Z',
      },
    } as Partial<VehicleDetail>);

    expect(screen.getByText('Xe chưa được chấp thuận')).toBeTruthy();
    expect(screen.getByText('Biển số không khớp giấy tờ.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gửi duyệt lại' })).toBeTruthy();
  });

  /**
   * Ca quan trọng nhất của ADR 0048 điều 4: `hidden` đã rời `VEHICLE_PUBLIC_STATUS_SUBMITTABLE`,
   * nên backend trả 409 cho mọi lượt gửi duyệt. Một nút ở đây là một cái bẫy.
   */
  it('nền tảng ẩn: KHÔNG có nút gửi duyệt lại, chỉ có đường tới hỗ trợ', () => {
    renderTask({
      publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.PLATFORM_HIDDEN,
      latestPublicReview: {
        status: 'rejected',
        reason: 'Ảnh không phải xe thật.',
        submittedAt: '2026-09-20T02:00:00.000Z',
        reviewedAt: '2026-09-21T02:00:00.000Z',
      },
    } as Partial<VehicleDetail>);

    expect(screen.getByText('Xe đang bị nền tảng ẩn')).toBeTruthy();
    expect(screen.getByText('Ảnh không phải xe thật.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Liên hệ hỗ trợ' })).toBeTruthy();
  });

  it('chủ xe tạm ẩn: CTA neo lên chính công tắc ở đầu trang, không bật hộ từ đây', () => {
    renderTask({
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      marketplaceEnabled: false,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED,
    });

    expect(screen.getByText('Xe đang tạm ẩn khỏi chợ')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Bật hiển thị' }).getAttribute('href')).toBe(
      '#vehicle-marketplace-switch',
    );
  });
});

describe('VehiclePublicationTaskItem — lỗi khi gửi duyệt', () => {
  it('cổng hồ sơ gian hàng: dựng DẢI có link, KHÔNG dùng toast', async () => {
    submit.mutate.mockImplementation((_b: unknown, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.(
        new ApiClientError({
          code: API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING,
          message: 'Hồ sơ gian hàng còn thiếu thông tin bắt buộc.',
          status: 409,
          details: { missing: ['logo'] },
        }),
      ),
    );
    renderTask();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Tải logo/ })).toBeTruthy(),
    );
    expect(messages.error).not.toHaveBeenCalled();
  });

  it('mọi lỗi khác vẫn là toast', async () => {
    submit.mutate.mockImplementation((_b: unknown, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.(
        new ApiClientError({
          code: API_ERROR_CODE.VEHICLE_PUBLISH_INCOMPLETE,
          message: 'Xe còn thiếu thông tin.',
          status: 400,
        }),
      ),
    );
    renderTask();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));

    await waitFor(() => expect(messages.error).toHaveBeenCalledTimes(1));
  });
});
