'use client';

import { EnvironmentOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useController, type Control, type Path, type PathValue } from 'react-hook-form';
import { provinceCenter, type GeoPoint } from '@xeprime/domain';
import {
  ConfirmedPlaceField,
  type AddressPinNames,
} from '@/components/form/ConfirmedPlaceField';
import type { RequestFormValues } from '../schema';
import styles from './RenterAddressBlock.module.css';

interface RenterAddressBlockProps {
  control: Control<RequestFormValues>;
  /** Trường giữ mã tỉnh — KHÔNG có ô nhập, giá trị do địa điểm khách chọn quyết định. */
  provinceCodeName: Path<RequestFormValues>;
  addressLineName: Path<RequestFormValues>;
  pin: AddressPinNames<RequestFormValues>;
  label: string;
  placeholder: string;
  /** Tỉnh nơi xe đang đỗ — ngữ cảnh hiển thị, điểm neo gợi ý, và giá trị dự phòng. */
  vehicleProvinceCode: string | null;
  vehicleProvinceName: string | null;
  /** Toạ độ điểm nhận xe, nếu chi nhánh đã ghim. Neo tốt hơn hẳn tâm tỉnh. */
  vehiclePoint: GeoPoint | null;
  disabled?: boolean;
}

/**
 * Địa chỉ giao/đón xe **do KHÁCH khai** — một ô nhập, không có bộ chọn hành chính nào.
 *
 * ## Vì sao khác hẳn `AddressField`
 *
 * `AddressField` hỏi đủ tỉnh → xã → số nhà vì người điền nó là CHỦ XE khai địa chỉ vận hành của
 * chính mình: họ biết chi nhánh của họ nằm ở phường nào, và mã hành chính ở đó đi vào thống kê,
 * bộ lọc, giấy tờ.
 *
 * Người điền ô này là KHÁCH THUÊ, và câu hỏi "xã/phường nào?" là câu họ không trả lời được —
 * nhất là khi thuê xe ở tỉnh khác. Danh mục cấp xã có 3.321 đơn vị và vừa đổi tên hàng loạt từ
 * 01/07/2025; bắt một người đang đặt xe tra cứu trong đó là dựng một bức tường ngay giữa luồng
 * thanh toán, để đổi lấy một mã mà hệ thống KHÔNG dùng tới ở đây: quãng đường giao xe tính từ
 * TOẠ ĐỘ (ADR 0018), không phải từ mã xã.
 *
 * Nên ở đây chỉ còn đúng thứ có hệ quả: một địa chỉ đã xác nhận, kèm toạ độ khi khách chọn gợi ý.
 * Backend đã nhận địa chỉ giao xe thiếu mã xã từ đầu (`resolveOptional(..., requireSelectable:
 * false)`), nên đây không phải một ngoại lệ mới mở ra cho luồng này.
 *
 * ## Tỉnh là NGỮ CẢNH, không phải một ô để điền
 *
 * Tỉnh nơi xe đang đỗ hiện thành một dòng chữ: nó cho khách biết vì sao gợi ý lại ra khu vực đó. Giá trị THẬT gửi lên lấy từ chính địa điểm khách chọn
 * (`suggestedProvinceCode`, quy qua bảng bí danh tỉnh ở server nên tên trước sáp nhập vẫn ra mã
 * đúng — ADR 0035 điều 4), và chỉ rơi về tỉnh của xe khi bản đồ không nói được.
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
  disabled,
}: RenterAddressBlockProps) {
  const t = useTranslations('BookingRequests.flow.address');
  const province = useController({ control, name: provinceCodeName });

  /*
   * Neo ưu tiên ĐIỂM NHẬN XE thật, rồi mới tới tâm tỉnh: gợi ý bám vào khu vực khách sẽ nhận
   * xe. Chi nhánh chưa có toạ độ thì tâm tỉnh vẫn hơn hẳn không neo gì.
   */
  const anchor = vehiclePoint ?? provinceCenter(vehicleProvinceCode);

  return (
    <div className={styles.block}>
      {vehicleProvinceName ? (
        <p className={styles.context}>
          <EnvironmentOutlined aria-hidden="true" className={styles.contextIcon} />
          {t('vehicleAt', { province: vehicleProvinceName })}
        </p>
      ) : null}

      <ConfirmedPlaceField
        control={control}
        addressLineName={addressLineName}
        pin={pin}
        label={label}
        placeholder={placeholder}
        anchor={anchor}
        searchEnabled={!disabled}
        required
        disabled={disabled}
        onPlaceResolved={(place) => {
          /*
           * Chỉ ghi khi bản đồ quy được một mã tỉnh. Quy không ra thì GIỮ NGUYÊN giá trị đang có
           * (tỉnh của xe) thay vì xoá trắng: một địa chỉ không mã tỉnh vẫn lưu được, nhưng nó
           * rơi khỏi mọi thống kê theo khu vực mà lẽ ra nó thuộc về.
           */
          if (place.suggestedProvinceCode) {
            province.field.onChange(
              place.suggestedProvinceCode as PathValue<
                RequestFormValues,
                Path<RequestFormValues>
              >,
            );
          }
        }}
        onConfirmedManually={() => {
          /*
           * Địa chỉ gõ tay không mang tỉnh nào: tỉnh của địa điểm chọn TRƯỚC đó (nếu có) nói về một
           * chỗ khách vừa bỏ. Về lại tỉnh của xe — đúng tỉnh server dùng để tra địa chỉ chữ khi báo
           * giá, nên lúc gửi yêu cầu dùng lại đúng kết quả đã tra.
           */
          if (vehicleProvinceCode) {
            province.field.onChange(
              vehicleProvinceCode as PathValue<RequestFormValues, Path<RequestFormValues>>,
            );
          }
        }}
      />
    </div>
  );
}
