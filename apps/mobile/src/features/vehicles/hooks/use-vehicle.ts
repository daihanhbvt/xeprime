import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  vehiclesApi,
  type CreateVehicleInput,
  type SaveVehicleSourceInput,
  type UpdateVehicleInput,
} from '../api';

/** Chi tiết một xe. `enabled` để không gọi khi chưa có id hoặc khi thiếu quyền xem. */
export function useVehicle(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.detail(id ?? ''),
    queryFn: () => vehiclesApi.detail(id as string),
    enabled: Boolean(id) && enabled,
  });
}

/**
 * Tổng hợp Hồ sơ 360 (chỉ số + đơn thuê + cảnh báo + KM).
 *
 * Tách khỏi `useVehicle` có chủ đích: phần tổng hợp chậm hơn bản ghi xe, và hỏng cũng không được
 * kéo sập cả màn — màn vẫn hiển thị hồ sơ, chỉ từng khối báo lỗi riêng.
 */
export function useVehicleSummary(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.summary(id ?? ''),
    queryFn: () => vehiclesApi.summary(id as string),
    enabled: Boolean(id) && enabled,
  });
}

/**
 * Hồ sơ nguồn xe. `enabled` cho phép nơi gọi TẮT query khi thiếu `finance.view` — gọi để nhận
 * 403 rồi hiện lỗi là trải nghiệm tệ hơn một khối "không có quyền" chủ động.
 */
export function useVehicleSource(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.source(id ?? ''),
    queryFn: () => vehiclesApi.source(id as string),
    enabled: Boolean(id) && enabled,
  });
}

/**
 * Làm mới MỌI bề mặt của xe sau một thay đổi.
 *
 * Cảnh báo và KM hiện lên ở bốn chỗ cùng lúc — thẻ xe, hồ sơ 360, tab bảo dưỡng, trung tâm bảo
 * dưỡng. Mỗi feature tự nhớ invalidate cái gì là sửa xong một chỗ, ba chỗ còn lại kể chuyện cũ.
 */
export function useInvalidateVehicleSurfaces() {
  const queryClient = useQueryClient();
  return (vehicleId?: string) => {
    // Nhánh `vehicles` gồm list + stats + alerts + summary + maintenance của từng xe.
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance.all });
    if (vehicleId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.summary(vehicleId) });
    }
  };
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVehicleInput) => vehiclesApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}

export function useUpdateVehicle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateVehicleInput) => vehiclesApi.update(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.vehicles.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => vehiclesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}

/** Gửi xe đi duyệt công khai; cập nhật chi tiết + làm mới danh sách (badge trạng thái đổi). */
export function useSubmitVehiclePublic(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => vehiclesApi.submitPublic(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.vehicles.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

/**
 * Lưu hồ sơ nguồn xe.
 *
 * Invalidate cả nhánh `vehicles`: đổi hình thức nguồn làm lệch chip nguồn ở thẻ danh sách và
 * khối tóm tắt ở Hồ sơ 360.
 */
export function useSaveVehicleSource(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveVehicleSourceInput) => vehiclesApi.saveSource(vehicleId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.vehicles.source(vehicleId), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

/**
 * Chính sách thuê MẶC ĐỊNH của gian hàng, theo LOẠI XE.
 *
 * Xe mới kế thừa nguyên bộ này (cọc, giao nhận, phí quá giờ, ưu đãi dài hạn) nên bước Giá của
 * luồng tạo phải cho xem trước — người dùng cần biết mình đang nhận cái gì trước khi bấm tạo.
 * Ô tô và xe máy là hai bộ riêng, nên `vehicleType` nằm trong query key.
 */
export function useShopPolicy(vehicleType: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rentalPolicies.shop(vehicleType),
    queryFn: () => vehiclesApi.shopPolicy(vehicleType),
    enabled,
  });
}
