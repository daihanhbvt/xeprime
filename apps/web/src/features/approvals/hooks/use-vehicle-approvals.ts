'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { API_ERROR_CODE, type ApprovalDecision } from '@xeprime/types';
import { getErrorCode, getErrorDetails } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import {
  decideVehicleApproval,
  fetchVehicleApproval,
  fetchVehicleApprovals,
  filtersToParams,
  saveVehicleApprovalNote,
  setVehicleApprovalCheck,
} from '../api';
import type {
  VehicleApprovalCheck,
  VehicleApprovalDetail,
  VehicleApprovalFilters,
  VehicleApprovalInternalNote,
} from '../types';

export function useVehicleApprovals(filters: VehicleApprovalFilters) {
  return useQuery({
    queryKey: queryKeys.vehicleApprovals.list(filtersToParams(filters)),
    queryFn: () => fetchVehicleApprovals(filters),
    placeholderData: keepPreviousData,
  });
}

export function useVehicleApproval(id: string | null) {
  return useQuery({
    queryKey: queryKeys.vehicleApprovals.detail(id ?? ''),
    queryFn: () => fetchVehicleApproval(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Mã lỗi nói "thứ đang hiện đã cũ" — phiếu vừa bị người khác xử lý / biến mất, danh mục vừa bị
 * người khác bỏ đánh dấu, hoặc xe SỐNG vừa lệch khỏi ảnh chụp. Gặp chúng thì nạp lại cả chi tiết
 * lẫn hàng đợi, để người duyệt thấy NGAY trạng thái thật thay vì bấm lại một nút đã vô nghĩa.
 */
const STALE_CODES: ReadonlySet<string> = new Set([
  API_ERROR_CODE.APPROVAL_ALREADY_DECIDED,
  API_ERROR_CODE.APPROVAL_CHECKLIST_INCOMPLETE,
  API_ERROR_CODE.APPROVAL_SUBJECT_CHANGED,
  API_ERROR_CODE.APPROVAL_SNAPSHOT_STALE,
  API_ERROR_CODE.NOT_FOUND,
]);

export function isStaleApprovalError(error: unknown): boolean {
  const code = getErrorCode(error);
  return typeof code === 'string' && STALE_CODES.has(code);
}

function refreshIfStale(queryClient: QueryClient, id: string, error: unknown): void {
  if (!isStaleApprovalError(error)) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.vehicleApprovals.detail(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.vehicleApprovals.all });
}

function patchChecks(
  detail: VehicleApprovalDetail | undefined,
  update: (checks: VehicleApprovalCheck[]) => VehicleApprovalCheck[],
): VehicleApprovalDetail | undefined {
  return detail ? { ...detail, manualChecks: update(detail.manualChecks) } : detail;
}

/** Ghi đè MỘT mục trong cache chi tiết — các mục khác (có thể đang lưu song song) giữ nguyên. */
function patchCheck(
  queryClient: QueryClient,
  id: string,
  key: string,
  update: (check: VehicleApprovalCheck) => VehicleApprovalCheck,
): void {
  queryClient.setQueryData<VehicleApprovalDetail>(
    queryKeys.vehicleApprovals.detail(id),
    (current) =>
      patchChecks(current, (checks) =>
        checks.map((check) => (check.key === key ? update(check) : check)),
      ),
  );
}

const SET_CHECK_MUTATION_KEY = [...queryKeys.vehicleApprovals.all, 'set-check'] as const;

function isForTask(variables: unknown, id: string): boolean {
  return (
    typeof variables === 'object' && variables !== null && 'id' in variables && variables.id === id
  );
}

/*
 * ⚠️ Ba mutation dưới nhận ID PHIẾU TRONG BIẾN (`variables`), không qua tham số của hook.
 *
 * Người duyệt bấm "Xe sau" khi một lượt lưu của xe trước còn đang bay: TanStack đẩy options MỚI
 * vào mutation đang chạy, nên một callback đọc id từ lần render gần nhất sẽ ghi danh mục của xe A
 * vào cache của xe B — và nút Phê duyệt của B sáng lên vì những dấu tick không thuộc về nó. Id đi
 * theo biến thì mỗi lượt gọi mang đúng phiếu của nó tới lúc kết thúc.
 */

/**
 * Đánh dấu một mục kiểm tra thủ công — LẠC QUAN: ô tick đổi ngay, server xác nhận sau.
 *
 * Lạc quan là an toàn ở đây vì nguồn sự thật vẫn là server ở cả hai đầu. Và nút Phê duyệt KHÔNG
 * tin cache — backend tự kiểm danh mục dưới khoá dòng lúc chốt.
 *
 * Đánh năm ô liền tay là cách làm BÌNH THƯỜNG, nên mỗi lượt chỉ động tới ĐÚNG ô của nó: lỗi thì
 * trả riêng ô đó về, thành công thì lấy riêng ô đó từ server (kèm người sửa + thời điểm). Trả cả
 * danh sách về bản chụp lúc bắt đầu sẽ xoá dấu tick của các ô khác còn đang lưu, và một phản hồi
 * về muộn sẽ đè phản hồi mới hơn. Lượt CUỐI của phiếu xong thì đối chiếu cả danh mục với server.
 */
export function useSetVehicleApprovalCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: SET_CHECK_MUTATION_KEY,
    mutationFn: ({ id, key, passed }: { id: string; key: string; passed: boolean }) =>
      setVehicleApprovalCheck(id, key, passed),
    onMutate: async ({ id, key, passed }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.vehicleApprovals.detail(id) });
      const before = queryClient
        .getQueryData<VehicleApprovalDetail>(queryKeys.vehicleApprovals.detail(id))
        ?.manualChecks.find((check) => check.key === key);
      patchCheck(queryClient, id, key, (check) => ({ ...check, passed }));
      return { before };
    },
    onError: (error, { id, key }, context) => {
      const before = context?.before;
      if (before) patchCheck(queryClient, id, key, () => before);
      refreshIfStale(queryClient, id, error);
    },
    onSuccess: (result, { id, key }) => {
      const saved = result.items.find((check) => check.key === key);
      if (saved) patchCheck(queryClient, id, key, () => saved);
    },
    onSettled: (_result, _error, { id }) => {
      // Lượt đang kết thúc vẫn được đếm — `<= 1` nghĩa là không còn lượt nào khác của phiếu này.
      const inFlight = queryClient.isMutating({
        mutationKey: SET_CHECK_MUTATION_KEY,
        predicate: (mutation) => isForTask(mutation.state.variables, id),
      });
      if (inFlight <= 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.vehicleApprovals.detail(id) });
      }
    },
  });
}

/**
 * Lưu ghi chú nội bộ.
 *
 * 409 `APPROVAL_NOTE_CONFLICT`: cache nhận NGAY bản đang lưu mà server gửi kèm, để lần lưu kế
 * tiếp so với đúng mốc mới — nếu không, "ghi đè bằng bản của tôi" sẽ lại xung đột với chính mốc
 * cũ. Việc chọn giữ bản nào là của component (nó giữ chữ người dùng đang gõ).
 */
export function useSaveVehicleApprovalNote() {
  const queryClient = useQueryClient();
  const setNote = (id: string, internalNote: VehicleApprovalInternalNote) =>
    queryClient.setQueryData<VehicleApprovalDetail>(
      queryKeys.vehicleApprovals.detail(id),
      (current) => (current ? { ...current, internalNote } : current),
    );

  return useMutation({
    mutationFn: ({
      id,
      note,
      expectedUpdatedAt,
    }: {
      id: string;
      note: string;
      expectedUpdatedAt: string | null;
    }) => saveVehicleApprovalNote(id, note, expectedUpdatedAt),
    onSuccess: (internalNote, { id }) => setNote(id, internalNote),
    onError: (error, { id }) => {
      if (getErrorCode(error) === API_ERROR_CODE.APPROVAL_NOTE_CONFLICT) {
        const details = getErrorDetails(error) as
          { current?: VehicleApprovalInternalNote } | undefined;
        if (details?.current) setNote(id, details.current);
      }
      refreshIfStale(queryClient, id, error);
    },
  });
}

/**
 * Phê duyệt / từ chối / yêu cầu bổ sung. Thành công: chi tiết lấy đúng bản server trả, hàng đợi
 * (và số trên tab) nạp lại. Thứ đang hiện đã cũ (409 các loại): nạp lại cả hai.
 */
export function useVehicleApprovalDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      kind,
      reason,
      expectedCapturedAt,
    }: {
      id: string;
      kind: ApprovalDecision;
      reason?: string;
      /** Mốc snapshot đang hiện trên màn — chỉ Phê duyệt dùng tới. */
      expectedCapturedAt?: string;
    }) => decideVehicleApproval(id, kind, reason, expectedCapturedAt),
    onSuccess: (detail, { id }) => {
      queryClient.setQueryData(queryKeys.vehicleApprovals.detail(id), detail);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.vehicleApprovals.all,
        // Chi tiết vừa được ghi bằng bản mới nhất — không cần nạp lại chính nó.
        predicate: (query) => query.queryKey[1] !== 'detail' || query.queryKey[2] !== id,
      });
    },
    onError: (error, { id }) => refreshIfStale(queryClient, id, error),
  });
}
