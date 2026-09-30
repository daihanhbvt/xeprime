import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { shopPoliciesApi, type SaveRentalPolicyInput } from '../api';

/**
 * Chính sách thuê MẶC ĐỊNH của gian hàng, theo LOẠI XE (SHP-04).
 *
 * Ô tô và xe máy là hai bộ riêng, nên `vehicleType` nằm trong query key — đọc bộ này rồi lưu đè
 * bằng bộ kia là ghi vào một hàng khác hẳn hàng vừa đọc.
 *
 * Cùng hook cho hai bề mặt: màn cấu hình chính sách, và bước Giá của luồng thêm xe (xe mới kế
 * thừa nguyên bộ này nên phải cho xem trước). Hai bản `useQuery` riêng là hai key có thể lệch.
 */
export function useShopPolicy(vehicleType: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rentalPolicies.shop(vehicleType),
    queryFn: () => shopPoliciesApi.get(vehicleType),
    enabled,
  });
}

/**
 * Lưu chính sách mặc định.
 *
 * Đây là thay đổi NHẠY CẢM: giá trị mới áp cho mọi lượt đặt mới của các xe đang kế thừa. Nên
 * ngoài `rentalPolicies`, phải làm mới cả nhánh `vehicles`: màn Giá & chính sách của từng xe
 * hiển thị bản gian hàng để đối chiếu và để "đặt lại theo chính sách gian hàng" — bỏ sót nó thì
 * nút đó đặt lại theo một bộ chính sách đã cũ.
 *
 * KHÔNG đụng tới chính sách RIÊNG của xe: xe đã ghi đè thì giữ nguyên bản của nó (backend không
 * có nghiệp vụ ghi đè ngược), và số đếm kế thừa/ghi đè đến từ server chứ không tính ở client.
 */
export function useSaveShopPolicy(vehicleType: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveRentalPolicyInput) => shopPoliciesApi.save(vehicleType, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.rentalPolicies.shop(vehicleType), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}
