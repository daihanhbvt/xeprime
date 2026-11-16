import { vi } from 'vitest';

/**
 * Bản giả của `@/features/vehicle-data/hooks` cho test component form xe — form không cần
 * QueryClient chỉ để hỏi gợi ý. Dùng:
 *
 *   vi.mock('@/features/vehicle-data/hooks', async () =>
 *     (await import('@/features/vehicle-data/test-vehicle-data')).vehicleDataHooksMock(),
 *   );
 */
export function vehicleDataHooksMock() {
  const idle = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    VEHICLE_DATA_SORT_VALUES: ['updated_desc', 'name_asc', 'usage_desc'],
    useVehicleDataOptions: () => ({ options: [], isLoading: false }),
    useVehicleDataSuggestion: () => null,
    useCreateOwnerModel: idle,
    useVehicleDataFilters: () => ({ filters: {}, setFilters: vi.fn() }),
    useVehicleDataList: () => ({
      data: undefined,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useVehicleDataDetail: () => ({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useCreateVehicleData: idle,
    useUpdateVehicleData: idle,
    useDeleteVehicleData: idle,
    useApproveVehicleData: idle,
    useMergeVehicleData: idle,
    useRejectVehicleData: idle,
    useVehicleDataImports: () => ({
      data: undefined,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useVehicleDataImport: () => ({ data: undefined, isLoading: false }),
    useVehicleDataImportRows: () => ({
      data: undefined,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useUploadVehicleDataImport: idle,
    useApplyVehicleDataImport: idle,
    useDiscardVehicleDataImport: idle,
  };
}
