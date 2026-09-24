import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS } from '@xeprime/types';

const client = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));
vi.mock('@/services/api-client', () => client);

import {
  decideVehicleApproval,
  fetchVehicleApprovals,
  filtersToParams,
  saveVehicleApprovalNote,
  setVehicleApprovalCheck,
} from './api';
import { APPROVAL_STATUS_ANY } from './constants';

beforeEach(() => {
  for (const fn of Object.values(client)) fn.mockReset();
});

describe('filtersToParams — mọi bộ lọc đi lên SERVER', () => {
  it('mặc định: phiếu chờ duyệt, trang 1; chiều "all" không được gửi', () => {
    expect(
      filtersToParams({
        status: APPROVAL_STATUS.PENDING,
        vehicleType: 'all',
        storefrontKind: 'all',
      }),
    ).toEqual({
      status: 'pending',
      vehicleType: null,
      storefrontKind: null,
      q: null,
      submittedFrom: null,
      submittedTo: null,
      page: 1,
      limit: 20,
    });
  });

  it('"tất cả trạng thái" là KHÔNG gửi status — không phải gửi chữ "any"', () => {
    expect(
      filtersToParams({ status: APPROVAL_STATUS_ANY, vehicleType: 'all', storefrontKind: 'all' })
        .status,
    ).toBeNull();
  });

  it('loại xe, nguồn đăng, từ khoá (đã trim) và trang đi nguyên lên', () => {
    expect(
      filtersToParams({
        status: APPROVAL_STATUS.PENDING,
        vehicleType: 'motorbike',
        storefrontKind: 'personal',
        q: '  75A-123 ',
        page: 3,
        limit: 50,
      }),
    ).toMatchObject({
      vehicleType: 'motorbike',
      storefrontKind: 'personal',
      q: '75A-123',
      page: 3,
      limit: 50,
    });
  });

  it('ngày gửi (giờ VN) → mốc ISO: từ 00:00 ngày đầu tới hết ngày cuối', () => {
    const params = filtersToParams({
      status: APPROVAL_STATUS.PENDING,
      vehicleType: 'all',
      storefrontKind: 'all',
      submittedFrom: '2026-06-01',
      submittedTo: '2026-06-08',
    });
    // 00:00 giờ VN = 17:00 UTC ngày hôm trước.
    expect(params.submittedFrom).toBe('2026-05-31T17:00:00.000Z');
    expect(params.submittedTo).toBe('2026-06-08T16:59:59.999Z');
  });
});

describe('endpoint — luôn là hàng đợi XE', () => {
  it('danh sách gọi /platform/vehicle-approvals và trả kèm số theo tab', async () => {
    client.apiRequest.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, hasNext: false },
      counts: { all: 16, car: 10, motorbike: 6 },
    });

    const result = await fetchVehicleApprovals({
      status: APPROVAL_STATUS.PENDING,
      vehicleType: 'car',
      storefrontKind: 'all',
    });

    expect(client.apiRequest).toHaveBeenCalledWith('/platform/vehicle-approvals', {
      query: expect.objectContaining({ vehicleType: 'car', status: 'pending' }),
    });
    expect(result.counts).toEqual({ all: 16, car: 10, motorbike: 6 });
  });

  it('thiếu counts (backend cũ) → số 0, không vỡ màn hình', async () => {
    client.apiRequest.mockResolvedValue({ data: [] });
    const result = await fetchVehicleApprovals({
      status: APPROVAL_STATUS.PENDING,
      vehicleType: 'all',
      storefrontKind: 'all',
    });
    expect(result.counts).toEqual({ all: 0, car: 0, motorbike: 0 });
  });

  it('đánh dấu, ghi chú, quyết định đều đi qua route xe', async () => {
    await setVehicleApprovalCheck('T1', 'photos_match', true);
    expect(client.apiPut).toHaveBeenCalledWith(
      '/platform/vehicle-approvals/T1/checks/photos_match',
      { passed: true },
    );

    await saveVehicleApprovalNote('T1', 'Đã gọi chủ xe', '2026-06-08T02:00:00.000Z');
    expect(client.apiPut).toHaveBeenCalledWith('/platform/vehicle-approvals/T1/internal-note', {
      note: 'Đã gọi chủ xe',
      expectedUpdatedAt: '2026-06-08T02:00:00.000Z',
    });

    await decideVehicleApproval('T1', 'approve');
    expect(client.apiPost).toHaveBeenLastCalledWith(
      '/platform/vehicle-approvals/T1/approve',
      undefined,
    );

    await decideVehicleApproval('T1', 'request_revision', 'Bổ sung ảnh nội thất');
    expect(client.apiPost).toHaveBeenLastCalledWith(
      '/platform/vehicle-approvals/T1/request-revision',
      { reason: 'Bổ sung ảnh nội thất' },
    );
  });
});
