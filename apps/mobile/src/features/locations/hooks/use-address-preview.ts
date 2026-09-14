import { useMemo } from 'react';
import { formatAddress } from '@xeprime/domain';
import { useProvinces } from './use-provinces';
import { useWards } from './use-wards';

/**
 * Chuỗi địa chỉ để XEM TRƯỚC, dựng từ mã tỉnh + mã xã + phần chi tiết đang chọn trong form.
 *
 * **Không phải một bản ghép thứ hai.** Nó gọi đúng `formatAddress` của `@xeprime/domain` — cùng
 * hàm backend dùng để dựng chuỗi lưu xuống DB — nên thứ khách đọc ở bước Xác nhận là đúng thứ sẽ
 * được lưu. Viết một phép nối chuỗi riêng ở màn xác nhận là cách để hai bên lệch nhau đúng vào
 * lúc khách đang soát lại lần cuối.
 *
 * Tên tỉnh/xã lấy từ hai query danh mục ĐÃ CÓ SẴN trong cache (ô nhập địa chỉ vừa tải xong), nên
 * hook này không sinh thêm request nào.
 */
export function useAddressPreview(
  provinceCode: string | null | undefined,
  wardCode: string | null | undefined,
  addressLine: string | null | undefined,
): string | null {
  const provinces = useProvinces();
  const wards = useWards(provinceCode);

  return useMemo(() => {
    const provinceName = provinces.data?.find((p) => p.code === provinceCode)?.name ?? null;
    const wardName = wards.data?.items.find((w) => w.code === wardCode)?.name ?? null;
    return formatAddress({ addressLine, wardName, provinceName });
  }, [provinces.data, provinceCode, wards.data, wardCode, addressLine]);
}
