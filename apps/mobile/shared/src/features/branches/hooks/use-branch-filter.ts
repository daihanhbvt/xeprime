import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { branchLabel } from '../api';
import { rememberBranch } from '../branch-memory';
import { useActiveBranches } from './use-branches';

/**
 * Ô "Chi nhánh" của một màn lọc được — bản native của `useBranchFilter` bên web (ADR 0052).
 *
 * Không còn bộ chọn chung ở thanh trên: mỗi màn tự giữ chi nhánh của nó trong THAM SỐ ROUTE
 * (`?branchId=`), đúng vai trò URL ở web. Hook này chỉ dựng lựa chọn và luật hiện/khoá/nhả.
 *
 *  - Lựa chọn: chi nhánh ĐANG HOẠT ĐỘNG (`/branches?status=active`).
 *  - Chỉ hỏi server khi có `branches.view` VÀ người dùng đứng trong một gian hàng.
 *  - `visible` khi ≥ 2 lựa chọn — hoặc `locked`: người này bị giới hạn còn MỘT chi nhánh trong
 *    gian hàng nhiều chi nhánh (`activeCount > 1`) ⇒ ô hiện, khoá, mang tên chi nhánh, KHÔNG có
 *    mục "Tất cả".
 *  - Nhả `branchId` không dùng được về "Tất cả" CHỈ khi câu trả lời đã chốt (đọc thành công,
 *    hoặc query bị tắt) — không bao giờ lúc đang tải hay khi lỗi mạng.
 */
export interface BranchFilterOption {
  readonly value: string;
  readonly label: string;
}

export interface BranchFilterOptions {
  /** Chi nhánh đang lọc. `undefined` = tất cả chi nhánh. */
  value?: string;
  onChange?: (branchId: string | undefined) => void;
  /** Giá trị sống ở state CỤC BỘ (hộp chọn xe) — không ghi bộ nhớ menu. */
  local?: boolean;
}

export interface BranchFilterState {
  /** Chi nhánh chọn được, KHÔNG gồm mục "Tất cả". */
  options: readonly BranchFilterOption[];
  visible: boolean;
  locked: boolean;
  isLoading: boolean;
  /** Nhãn đang hiện trên ô — tên chi nhánh, hoặc "Tất cả chi nhánh". */
  currentLabel: string;
  /** Nhãn của chi nhánh đang lọc; `null` khi đang xem tất cả. */
  selectedLabel: string | null;
  select: (value: string | undefined) => void;
}

export function useBranchFilter(options: BranchFilterOptions = {}): BranchFilterState {
  const { value, onChange, local } = options;
  const t = useTranslations('Branches');
  const permissions = usePermissions();
  const { tenant, isLoading: sessionLoading } = useTenantScope();
  const tenantId = tenant?.id ?? null;

  const canView = permissions.has(PERMISSION.BRANCH_VIEW) && Boolean(tenantId);
  const query = useActiveBranches(canView);
  const noProvince = t('labels.noProvince');

  const branches = useMemo(
    () => (canView && !query.isError ? (query.data?.items ?? []) : []),
    [canView, query.isError, query.data],
  );

  const branchOptions = useMemo<BranchFilterOption[]>(
    () =>
      branches.map((branch) => {
        const label = branchLabel(branch, noProvince);
        return {
          value: branch.id,
          label: branch.isDefault ? t('scope.defaultOption', { label }) : label,
        };
      }),
    [branches, noProvince, t],
  );

  const tenantActiveCount = query.data?.activeCount ?? 0;
  const locked = branchOptions.length === 1 && tenantActiveCount > 1;
  const visible = branchOptions.length > 1 || locked;

  const selectedLabel = branchOptions.find((o) => o.value === value)?.label ?? null;
  const currentLabel = locked
    ? (branchOptions[0]?.label ?? t('scope.all'))
    : (selectedLabel ?? t('scope.all'));

  const select = useCallback(
    (next: string | undefined) => {
      onChange?.(next || undefined);
    },
    [onChange],
  );

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const standing = Boolean(onChange) && !local;
  useEffect(() => {
    if (standing) rememberBranch(tenantId, value ?? null);
  }, [standing, tenantId, value]);

  /*
   * Phiên chưa tải xong thì quyền còn rỗng và query trông như "bị tắt" — chưa phải câu trả lời
   * đã chốt, nhả ở đó là xoá đúng chi nhánh trong link người dùng vừa mở.
   */
  const sessionSettled = !sessionLoading && !permissions.isLoading;
  const settled = sessionSettled && (!canView || (!query.isLoading && !query.isError));
  useEffect(() => {
    if (!onChangeRef.current || !value || !settled) return;
    if (visible && branchOptions.some((option) => option.value === value)) return;
    onChangeRef.current(undefined);
  }, [value, visible, branchOptions, settled]);

  return {
    options: branchOptions,
    visible,
    locked,
    isLoading: query.isLoading,
    currentLabel,
    selectedLabel,
    select,
  };
}

/**
 * Chi nhánh của MÀN đang đứng, đọc/ghi từ tham số route `branchId` — vai trò của URL bên web.
 * `setParams` thay tham số tại chỗ (không đẩy thêm màn), giống `router.replace` của web.
 */
export function useBranchRouteParam(): [string | undefined, (next: string | undefined) => void] {
  const params = useLocalSearchParams<{ branchId?: string | string[] }>();
  const router = useRouter();
  const raw = params.branchId;
  const branchId = (Array.isArray(raw) ? raw[0] : raw) || undefined;
  const setBranchId = useCallback(
    (next: string | undefined) => {
      router.setParams({ branchId: next ?? undefined } as Record<string, string | undefined>);
    },
    [router],
  );
  return [branchId, setBranchId];
}

/**
 * Ghép hai hook trên cho màn lọc được: `{ branchId, filter }`.
 *
 * `onChanged` chạy mỗi lần chi nhánh đổi (kể cả lúc tự nhả) — màn dùng để về trang đầu.
 */
export function useScreenBranchFilter(onChanged?: () => void): {
  branchId: string | undefined;
  filter: BranchFilterState;
} {
  const [branchId, setBranchId] = useBranchRouteParam();
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });
  const change = useCallback(
    (next: string | undefined) => {
      setBranchId(next);
      onChangedRef.current?.();
    },
    [setBranchId],
  );
  const filter = useBranchFilter({ value: branchId, onChange: change });
  return { branchId, filter };
}

/** Href "Quay lại danh sách" của màn chi tiết — mang lại `branchId` nó nhận từ danh sách. */
export function useBranchReturnParam(): string | undefined {
  return useBranchRouteParam()[0];
}
