import { useForm, type UseFormReturn } from 'react-hook-form';
import {
  missingPackageShopRegistrationFields,
  type PackageShopListingRequirement,
} from '@xeprime/types';
import { shopUpgradeSchema, type ShopUpgradeValues } from '@xeprime/validators';

import type { Branch, UpdateBranchInput } from '@/features/branches/api';
import type { MyShop, UpdateShopProfileInput } from '@/features/shop/api';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

/**
 * Bước "thông tin gian hàng" của luồng NÂNG CẤP — giá trị khởi tạo, hai thân request, và bộ
 * trường bắt buộc. Bản native của `apps/web/src/features/subscription/shop-upgrade-form.ts`.
 *
 * ## Vì sao hai thân request chứ không một
 *
 * Hai giá trị nằm ở hai bảng khác nhau và mỗi bảng có đúng một writer:
 *
 *   tên · địa chỉ · logo  → `PATCH /shop/profile` (backend chuyển tiếp địa chỉ cho chi nhánh mặc định)
 *   SĐT liên hệ           → `PATCH /branches/:id` (SĐT KHÔNG có trên `UpdateTenantProfileDto`)
 *
 * Gộp chúng ở client là bịa ra một endpoint không tồn tại; tách ở đây giữ cho nơi gọi chỉ còn
 * phải quyết định THỨ TỰ và xử lý lỗi.
 *
 * ## Vì sao dựng thân request từ HỒ SƠ HIỆN TẠI
 *
 * Form này chỉ hỏi một TẬP CON của hồ sơ, nhưng `PATCH /shop/profile` nhận cả cụm — gửi thẳng
 * mấy ô đang hiển thị sẽ xoá trắng giới thiệu, ảnh bìa, mã số thuế và giấy phép mà chủ xe đã
 * khai ở màn khác. Nên thân request dựng từ GIÁ TRỊ HIỆN TẠI TRÊN SERVER rồi mới ghi đè đúng
 * những ô người dùng vừa sửa.
 */

/** Giá trị mở form: hồ sơ + CHI NHÁNH MẶC ĐỊNH (nguồn sự thật của địa chỉ vận hành và SĐT). */
export function toShopUpgradeValues(shop: MyShop, branch: Branch | null): ShopUpgradeValues {
  const profile = shop.profile;
  return {
    displayName: profile.displayName ?? '',
    /*
     * Chi nhánh đọc TRƯỚC hồ sơ ở cả ba ô địa chỉ: hai cột tỉnh trên `tenant_profiles` chỉ là bản
     * sao (`syncProfileFromDefaultBranch`), và `addressLine` của chi nhánh là giá trị THẬT.
     */
    provinceCode: branch?.provinceCode ?? profile.provinceCode ?? '',
    wardCode: branch?.wardCode ?? profile.wardCode ?? '',
    addressLine: branch?.addressLine ?? '',
    contactPhone: branch?.phone ?? '',
    logoUrl: profile.logoUrl ?? null,
    /*
     * Ghim để NGƯỜI DÙNG xác nhận địa chỉ trên bản đồ, không phải để lưu: `UpdateTenantProfileDto`
     * không có bốn cột này và backend tự tra lại toạ độ từ địa chỉ đã lưu — y hệt màn hồ sơ gian
     * hàng. Mở form ở trạng thái "chưa xác nhận" cũng đúng hơn: địa chỉ cũ của một chủ xe cá nhân
     * thường chưa bao giờ đi qua bản đồ.
     */
    placeId: null,
    latitude: null,
    longitude: null,
    locationSource: null,
  };
}

/**
 * Thân `PATCH /shop/profile` — giữ nguyên những ô form này không hỏi.
 *
 * `wardCode` rỗng KHÔNG được gửi: DTO khai `@IsOptional()` kèm `@Length(5, 5)`, mà `@IsOptional`
 * chỉ bỏ qua `null`/`undefined`. Từ ADR 0042 form không còn ô Xã/phường, nên hồ sơ chưa từng khai
 * mã xã sẽ luôn rơi vào nhánh này — thiếu dòng này thì lượt lưu chết với một lỗi độ dài trỏ vào
 * một ô không tồn tại trên màn.
 */
export function toShopUpgradeProfileBody(
  shop: MyShop,
  values: ShopUpgradeValues,
): UpdateShopProfileInput {
  const p = shop.profile;
  return {
    displayName: values.displayName,
    bio: p.bio ?? '',
    provinceCode: values.provinceCode,
    wardCode: values.wardCode || undefined,
    addressLine: values.addressLine,
    taxCode: p.taxCode ?? '',
    businessLicenseNo: p.businessLicenseNo ?? '',
    logoUrl: values.logoUrl ?? '',
    coverUrl: p.coverUrl ?? '',
  };
}

/**
 * Thân `PATCH /branches/:id` — ĐÚNG một trường.
 *
 * Không gửi kèm địa chỉ: `PATCH /shop/profile` đã chuyển tiếp cả cụm cho chính chi nhánh này, và
 * gửi lần thứ hai là bắt `AddressService` tra lại bản đồ thêm một lượt cho cùng một giá trị.
 */
export function toShopUpgradeBranchBody(values: ShopUpgradeValues): UpdateBranchInput {
  return { phone: values.contactPhone };
}

/**
 * Bộ trường bắt buộc CÒN THIẾU — đọc từ luật dùng chung, không phải một danh sách chép tay.
 *
 * `shopUpgradeSchema` đã chặn cả bốn ô này khi người dùng bấm lưu, nên trong luồng bình thường
 * hàm trả mảng rỗng. Nó vẫn được gọi vì đây mới là quy tắc mà BACKEND thi hành ở cổng đăng xe
 * (`missingPackageShopListingRequirements` trừ logo): nếu một ngày schema nới ra, người dùng phải
 * biết ngay tại đây thay vì sau khi đã trả tiền gói.
 */
export function missingShopUpgradeFields(
  values: ShopUpgradeValues,
): PackageShopListingRequirement[] {
  return missingPackageShopRegistrationFields({
    displayName: values.displayName,
    contactPhone: values.contactPhone,
    provinceCode: values.provinceCode,
    addressLine: values.addressLine,
  });
}

/**
 * React Hook Form đã nối sẵn schema và dữ liệu hiện có.
 *
 * `values` (không phải `defaultValues`): hồ sơ và chi nhánh đến từ hai query, nên chúng có thể về
 * SAU lần render đầu — form phải nhận chúng khi đó thay vì đứng trống và bắt người dùng gõ lại
 * đúng thứ hệ thống đã biết.
 *
 * `keepDirtyValues` là vế còn lại của cùng câu chuyện, và thiếu nó là một lỗi THẬT trong luồng
 * này: lượt lưu hồ sơ nạp lại cache `shop.current` và làm mới `branches`, nên `values` đổi NGAY
 * GIỮA lượt submit. Không giữ phần đang sửa, React Hook Form reset cả form — và nếu lượt ghi chi
 * nhánh ngay sau đó hỏng, người dùng nhìn xuống thấy ô số điện thoại vừa gõ đã trống trở lại.
 */
export function useShopUpgradeForm(
  shop: MyShop,
  branch: Branch | null,
): UseFormReturn<ShopUpgradeValues> {
  const resolver = useValidationResolver<ShopUpgradeValues>(
    shopUpgradeSchema,
    'Subscription.upgrade.validation',
    // Mã lỗi của những ô `pick` từ `shopProfileSchema` sống ở namespace của chính hồ sơ gian hàng.
    'Shop.validation',
  );
  return useForm<ShopUpgradeValues>({
    resolver,
    values: toShopUpgradeValues(shop, branch),
    resetOptions: { keepDirtyValues: true },
  });
}
