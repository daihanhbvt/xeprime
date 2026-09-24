import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, APPROVAL_DECISION, APPROVAL_STATUS } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { carReview } from '../test-utils';
import type { VehicleApprovalDetail } from '../types';

const api = vi.hoisted(() => ({
  decideVehicleApproval: vi.fn(),
  setVehicleApprovalCheck: vi.fn(),
  saveVehicleApprovalNote: vi.fn(),
  fetchVehicleApproval: vi.fn(),
  fetchVehicleApprovals: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  ...api,
}));

import {
  useSaveVehicleApprovalNote,
  useSetVehicleApprovalCheck,
  useVehicleApprovalDecision,
} from './use-vehicle-approvals';

const ID = '01TASKCAR0000000000000000';
const detailKey = queryKeys.vehicleApprovals.detail(ID);
const listKey = queryKeys.vehicleApprovals.list({ status: 'pending' });

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const conflict = (code: string, details?: unknown) =>
  new ApiClientError({ code, message: code, status: 409, details });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(detailKey, carReview());
  client.setQueryData(listKey, { items: [], meta: {}, counts: { all: 1, car: 1, motorbike: 0 } });
});

describe('Quyết định', () => {
  it('thành công: chi tiết lấy bản server trả, hàng đợi bị đánh dấu cũ', async () => {
    const decided: VehicleApprovalDetail = {
      ...carReview(),
      approvalStatus: APPROVAL_STATUS.APPROVED,
    };
    api.decideVehicleApproval.mockResolvedValue(decided);
    const { result } = renderHook(() => useVehicleApprovalDecision(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: ID, kind: APPROVAL_DECISION.APPROVE });
    });

    expect(client.getQueryData<VehicleApprovalDetail>(detailKey)?.approvalStatus).toBe(
      APPROVAL_STATUS.APPROVED,
    );
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    // Chi tiết vừa ghi bản mới nhất — không bị đánh dấu cũ để nạp lại vô ích.
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(false);
  });

  it('phiếu đã bị người khác xử lý: nạp lại CẢ chi tiết lẫn hàng đợi', async () => {
    api.decideVehicleApproval.mockRejectedValue(conflict(API_ERROR_CODE.APPROVAL_ALREADY_DECIDED));
    api.fetchVehicleApproval.mockResolvedValue(carReview());
    const { result } = renderHook(() => useVehicleApprovalDecision(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ id: ID, kind: APPROVAL_DECISION.REJECT, reason: 'x' })
        .catch(() => undefined);
    });

    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });
});

describe('Đánh dấu kiểm tra thủ công', () => {
  it('lạc quan: ô đổi ngay, thành công thì lấy mục đó từ server (kèm người sửa)', async () => {
    let resolve!: (value: unknown) => void;
    api.setVehicleApprovalCheck.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useSetVehicleApprovalCheck(), { wrapper });

    act(() => result.current.mutate({ id: ID, key: 'photos_match', passed: true }));
    await waitFor(() =>
      expect(
        client
          .getQueryData<VehicleApprovalDetail>(detailKey)
          ?.manualChecks.find((c) => c.key === 'photos_match')?.passed,
      ).toBe(true),
    );

    const items = carReview().manualChecks.map((c) =>
      c.key === 'photos_match'
        ? { ...c, passed: true, updatedAt: '2026-06-08T03:00:00.000Z', updatedByName: 'Reviewer A' }
        : c,
    );
    await act(async () => resolve({ items }));
    await waitFor(() =>
      expect(
        client
          .getQueryData<VehicleApprovalDetail>(detailKey)
          ?.manualChecks.find((c) => c.key === 'photos_match')?.updatedByName,
      ).toBe('Reviewer A'),
    );
  });

  it('id đi theo BIẾN: lượt lưu của xe A kết thúc sau khi đã sang xe B không ghi vào cache của B', async () => {
    const otherId = '01TASKOTHER00000000000000';
    const otherKey = queryKeys.vehicleApprovals.detail(otherId);
    client.setQueryData(otherKey, carReview({ approvalTaskId: otherId }));
    let resolve!: (value: unknown) => void;
    api.setVehicleApprovalCheck.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useSetVehicleApprovalCheck(), { wrapper });

    act(() => result.current.mutate({ id: ID, key: 'photos_match', passed: true }));
    await waitFor(() =>
      expect(api.setVehicleApprovalCheck).toHaveBeenCalledWith(ID, 'photos_match', true),
    );

    const items = carReview().manualChecks.map((c) =>
      c.key === 'photos_match' ? { ...c, passed: true, updatedByName: 'Reviewer A' } : c,
    );
    await act(async () => resolve({ items }));

    await waitFor(() =>
      expect(
        client
          .getQueryData<VehicleApprovalDetail>(detailKey)
          ?.manualChecks.find((c) => c.key === 'photos_match')?.updatedByName,
      ).toBe('Reviewer A'),
    );
    expect(
      client.getQueryData<VehicleApprovalDetail>(otherKey)?.manualChecks.some((c) => c.passed),
    ).toBe(false);
  });

  it('hai ô lưu song song, ô ĐẦU lỗi: chỉ ô đó trả về — dấu tick của ô sau còn nguyên', async () => {
    let rejectFirst!: (reason: unknown) => void;
    api.setVehicleApprovalCheck
      .mockReturnValueOnce(new Promise((_, reject) => (rejectFirst = reject)))
      .mockReturnValueOnce(new Promise(() => undefined));
    const { result } = renderHook(() => useSetVehicleApprovalCheck(), { wrapper });
    const passedOf = (key: string) =>
      client.getQueryData<VehicleApprovalDetail>(detailKey)?.manualChecks.find((c) => c.key === key)
        ?.passed;

    act(() => result.current.mutate({ id: ID, key: 'photos_match', passed: true }));
    act(() => result.current.mutate({ id: ID, key: 'plate_visible', passed: true }));
    await waitFor(() => expect(passedOf('plate_visible')).toBe(true));

    await act(async () => rejectFirst(new Error('network')));

    await waitFor(() => expect(passedOf('photos_match')).toBe(false));
    expect(passedOf('plate_visible')).toBe(true);
  });

  it('lỗi: ô trở về trạng thái cũ — không để một dấu tick mà server không có', async () => {
    api.setVehicleApprovalCheck.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useSetVehicleApprovalCheck(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ id: ID, key: 'photos_match', passed: true })
        .catch(() => undefined);
    });

    expect(
      client
        .getQueryData<VehicleApprovalDetail>(detailKey)
        ?.manualChecks.find((c) => c.key === 'photos_match')?.passed,
    ).toBe(false);
  });
});

describe('Ghi chú nội bộ', () => {
  it('xung đột: cache nhận ngay bản đang lưu để lần lưu kế tiếp so đúng mốc mới', async () => {
    const current = {
      note: 'Bản của Reviewer B',
      updatedAt: '2026-06-08T02:20:00.000Z',
      updatedByName: 'Reviewer B',
    };
    api.saveVehicleApprovalNote.mockRejectedValue(
      conflict(API_ERROR_CODE.APPROVAL_NOTE_CONFLICT, { current }),
    );
    const { result } = renderHook(() => useSaveVehicleApprovalNote(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ id: ID, note: 'Bản của tôi', expectedUpdatedAt: null })
        .catch(() => undefined);
    });

    expect(client.getQueryData<VehicleApprovalDetail>(detailKey)?.internalNote).toEqual(current);
  });
});
