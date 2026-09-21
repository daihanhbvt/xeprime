import { Ionicons } from '@expo/vector-icons';
import { useController, type Control, type Path, type PathValue } from 'react-hook-form';
import { provinceCenter, type GeoPoint } from '@xeprime/domain';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  ConfirmedPlaceField,
  type AddressPinNames,
} from '@/components/form/AddressFields';
import { colors, fontSize, iconSize, space } from '@/theme/tokens';
import type { BookingRequestFormValues } from '../booking-schema';

/**
 * Địa chỉ giao/đón xe **do KHÁCH khai** — một ô nhập, không có bộ chọn hành chính nào.
 * Bản native của `RenterAddressBlock` (ADR 0042).
 *
 * ## Vì sao khác hẳn `AddressFields`
 *
 * `AddressFields` hỏi tỉnh → (xã) → địa chỉ vì người điền nó là CHỦ XE khai địa chỉ vận hành của
 * chính mình: họ biết chi nhánh của họ nằm ở đâu, và mã hành chính ở đó đi vào thống kê, bộ lọc,
 * giấy tờ.
 *
 * Người điền ô này là KHÁCH THUÊ, và "xã/phường nào?" là câu họ không trả lời được — nhất là khi
 * thuê xe ở tỉnh khác. Bắt một người đang đặt xe tra cứu trong 3.321 đơn vị vừa đổi tên hàng loạt
 * là dựng một bức tường ngay giữa luồng thanh toán, để đổi lấy một mã mà hệ thống KHÔNG dùng tới ở
 * đây: quãng đường giao xe tính từ TOẠ ĐỘ (ADR 0018), không phải từ mã xã.
 *
 * Nên ở đây chỉ còn đúng thứ có hệ quả: một địa chỉ mà bản đồ xác nhận được, kèm cái ghim.
 *
 * ## Tỉnh là NGỮ CẢNH, không phải một ô để điền
 *
 * Tỉnh nơi xe đang đỗ hiện thành một dòng chữ: nó cho khách biết gợi ý đang ra ở khu vực nào và
 * vì sao. Giá trị THẬT gửi lên lấy từ chính địa điểm khách chọn (`suggestedProvinceCode`, quy qua
 * bảng bí danh tỉnh ở server nên tên trước sáp nhập vẫn ra mã đúng — ADR 0035 điều 4), và chỉ rơi
 * về tỉnh của xe khi bản đồ không nói được.
 *
 * Cố ý KHÔNG khoá cứng địa chỉ trong tỉnh của xe: giao tận nơi tính theo BÁN KÍNH km
 * (`delivery_max_radius_km`), và Hà Nội ↔ Bắc Ninh cách nhau ~30km. Khoá theo ranh giới tỉnh sẽ
 * chặn những chuyến hoàn toàn hợp lệ, trong khi bán kính đã là cái chặn đúng.
 */
export function RenterAddressBlock({
  control,
  provinceCodeName,
  addressLineName,
  pin,
  label,
  placeholder,
  vehicleProvinceCode,
  vehicleProvinceName,
  vehiclePoint,
  onServiceAvailabilityChange,
  disabled = false,
}: {
  control: Control<BookingRequestFormValues>;
  /** Trường giữ mã tỉnh — KHÔNG có ô nhập, giá trị do địa điểm khách chọn quyết định. */
  provinceCodeName: Path<BookingRequestFormValues>;
  addressLineName: Path<BookingRequestFormValues>;
  pin: AddressPinNames<BookingRequestFormValues>;
  label: string;
  placeholder?: string;
  /** Tỉnh nơi xe đang đỗ — ngữ cảnh hiển thị, khoá bật gợi ý, và giá trị dự phòng. */
  vehicleProvinceCode: string | null;
  vehicleProvinceName: string | null;
  /** Toạ độ điểm nhận xe, nếu chi nhánh đã ghim. Neo tốt hơn hẳn tâm tỉnh. */
  vehiclePoint: GeoPoint | null;
  /**
   * Dịch vụ địa điểm sống hay chết — chuyển thẳng lên form.
   *
   * Ở luồng khách, cái ghim CHỈ sinh ra từ một dòng gợi ý, nên `/places/search` chết nghĩa là
   * không còn đường nào tạo ra toạ độ — và schema phải thôi bắt buộc nó (ADR 0035 điều 6).
   */
  onServiceAvailabilityChange?: (available: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('BookingRequests.flow.address');
  const province = useController({ control, name: provinceCodeName });

  /*
   * Neo ưu tiên ĐIỂM NHẬN XE thật, rồi mới tới tâm tỉnh. Chi nhánh đã ghim thì gợi ý bám vào
   * đúng khu vực khách sẽ nhận xe; chưa ghim thì tâm tỉnh vẫn hơn hẳn không neo gì — thứ khiến
   * "Nguyễn Huệ" ra TP.HCM bất kể chiếc xe đang đỗ ở đâu.
   */
  const anchor = vehiclePoint ?? provinceCenter(vehicleProvinceCode);

  return (
    <YStack gap={space.sm}>
      {vehicleProvinceName ? (
        <XStack ai="flex-start" gap={space.xs}>
          <Ionicons name="location-outline" size={iconSize.sm} color={colors.textMuted} />
          <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
            {t('vehicleAt', { province: vehicleProvinceName })}
          </Text>
        </XStack>
      ) : null}

      <ConfirmedPlaceField
        control={control}
        addressLineName={addressLineName}
        pin={pin}
        anchor={anchor}
        /*
         * Luôn BẬT — khác `AddressFields` (chủ xe), khách không có ô tỉnh nào để so "đã chọn
         * chưa", nên gác gợi ý theo tỉnh của XE sẽ khoá luôn autocomplete ở những xe cũ chưa có
         * mã tỉnh (dữ liệu trước ADR 0035) dù chi nhánh đã có ghim thật để neo vào.
         */
        searchEnabled={!disabled}
        label={label}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(onServiceAvailabilityChange ? { onServiceAvailabilityChange } : {})}
        required
        disabled={disabled}
        onPlaceResolved={(place) => {
          /*
           * Chỉ ghi khi bản đồ quy được một mã tỉnh. Quy không ra thì GIỮ NGUYÊN giá trị đang có
           * (tỉnh của xe) thay vì xoá trắng: một địa chỉ không mã tỉnh vẫn lưu được, nhưng nó rơi
           * khỏi mọi thống kê theo khu vực mà lẽ ra nó thuộc về.
           */
          if (place.suggestedProvinceCode) {
            province.field.onChange(
              place.suggestedProvinceCode as PathValue<
                BookingRequestFormValues,
                Path<BookingRequestFormValues>
              >,
            );
          }
        }}
      />
    </YStack>
  );
}
