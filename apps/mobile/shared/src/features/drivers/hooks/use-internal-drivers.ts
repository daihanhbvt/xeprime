import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  internalDriversApi,
  tripFiltersToParams,
  type AssignableWindow,
  type CreateInternalDriverInput,
  type DriverTripFilters,
  type UpdateInternalDriverInput,
} from '../api';

/**
 * Danh bạ tài xế NỘI BỘ (ADR 0108) — native port of web `features/drivers/hooks/use-internal-drivers.ts`.
 * Mọi khoá nằm dưới `drivers` để mutation tài xế/đơn tự làm mới cả bộ chọn gán đơn.
 */
export function useAssignableInternalDrivers(window: AssignableWindow, enabled = true) {
  return useQuery({
    queryKey: queryKeys.drivers.internalAssignable(window),
    queryFn: () => internalDriversApi.assignable(window),
    enabled,
    staleTime: 30_000,
  });
}

export function useInternalDriverDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.drivers.internalDetail(id ?? ''),
    queryFn: () => internalDriversApi.detail(id as string),
    enabled: Boolean(id),
  });
}

export function useInternalDriverTrips(id: string | null, filters: DriverTripFilters) {
  const params = { ...tripFiltersToParams(filters), status: filters.status ?? null };
  return useQuery({
    queryKey: queryKeys.drivers.internalTrips(id ?? '', params),
    queryFn: () => internalDriversApi.trips(id as string, filters),
    enabled: Boolean(id),
    placeholderData: (prev) => prev,
  });
}

function useInternalDriverMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all }),
  });
}

export const useCreateInternalDriver = () =>
  useInternalDriverMutation((body: CreateInternalDriverInput) => internalDriversApi.create(body));

export const useUpdateInternalDriver = () =>
  useInternalDriverMutation(({ id, body }: { id: string; body: UpdateInternalDriverInput }) =>
    internalDriversApi.update(id, body),
  );

export const useArchiveInternalDriver = () =>
  useInternalDriverMutation((id: string) => internalDriversApi.archive(id));

export const useRestoreInternalDriver = () =>
  useInternalDriverMutation((id: string) => internalDriversApi.restore(id));
