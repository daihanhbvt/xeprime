import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

/**
 * Mỗi dịch vụ một TÔNG riêng, đúng như `ListingServiceSelector.module.css` của web:
 * tự lái xanh dương (info), có tài xế gold (primary), dài hạn xanh lá (success).
 *
 * Màu ở đây là NHẬN DIỆN loại dịch vụ, không phải trạng thái chọn — nhờ vậy khách quen mặt màu
 * và nhận ra loại dịch vụ ở mọi màn mà không cần đọc chữ.
 */
const SERVICE_TONE: Record<ServiceType, { fg: string; bg: string; icon: IconName }> = {
  [SERVICE_TYPE.SELF_DRIVE]: { fg: colors.info, bg: colors.infoSurface, icon: 'car-outline' },
  [SERVICE_TYPE.WITH_DRIVER]: {
    fg: colors.primaryActive,
    bg: colors.primaryLight,
    icon: 'person-outline',
  },
  [SERVICE_TYPE.LONG_TERM]: {
    fg: colors.success,
    bg: colors.successSurface,
    icon: 'calendar-outline',
  },
};

/**
 * Số dịch vụ tối đa còn xếp vừa MỘT hàng trên máy hẹp nhất.
 *
 * `SERVICE_TYPE` hiện có đúng ba giá trị, và `vehicleServiceTypesFor` còn cắt xuống hai với xe
 * máy — nên nhánh "nhiều hơn ba" hôm nay không chạy. Nó tồn tại để ngày backend thêm dịch vụ
 * thứ tư, hàng chip tự cuốn dòng thay vì bóp bốn nhãn thành bốn dấu ba chấm.
 */
const SINGLE_ROW_MAX = 3;

/**
 * Chọn dịch vụ thuê ở trang chi tiết xe — bản native của `ListingServiceSelector.tsx`.
 *
 * Viên bo tròn nằm ngang, biểu tượng trước nhãn. Ô đang chọn dày viền hơn và đậm chữ hơn —
 * KHÔNG đổi màu nền sang gold: nền đã mang màu nhận diện của chính dịch vụ đó, đổi nó đi là mất
 * luôn thứ giúp phân biệt ba loại.
 *
 * Từ ba dịch vụ trở xuống thì cả hàng nằm TRÊN MỘT DÒNG, nhãn dài tự cắt bằng dấu ba chấm: ba
 * viên chia đều đọc ra ngay là "chọn một trong ba", còn một viên rơi xuống dòng dưới trông như
 * nó thuộc về khối khác. Nhiều hơn thế thì cuốn dòng — bóp bốn nhãn vào một hàng là bốn dấu ba
 * chấm, không còn đọc được gì.
 *
 * Xe chỉ có MỘT dịch vụ thì viên là nhãn thuần, không bấm được — giống web: không có gì để chọn
 * thì đừng giả vờ có.
 */
export function ServiceSelector({
  services,
  active,
  onChange,
}: {
  services: readonly string[];
  active: string;
  onChange: (next: string) => void;
}) {
  const domainLabel = useDomainLabel();
  const only = services.length === 1;
  const singleRow = services.length <= SINGLE_ROW_MAX;

  return (
    // `rowGap` riêng: `gap` của flex-wrap trên RN chỉ áp cho khoảng NGANG ở một số bản, nên
    // viên rơi xuống dòng dưới sẽ dính sát viên phía trên nếu không khai tường minh.
    <XStack gap={space.xs} rowGap={space.xs} flexWrap={singleRow ? 'nowrap' : 'wrap'}>
      {services.map((value) => {
        const tone = SERVICE_TONE[value as ServiceType];
        const selected = value === active;

        const body = (
          <XStack
            ai="center"
            jc="center"
            gap={space.xs}
            {...(singleRow && !only ? { f: 1, minWidth: 0 } : {})}
            bg={tone?.bg ?? colors.surfaceMuted}
            // LUÔN có viền — viên không chọn mà viền trong suốt thì nó trôi vào nền thẻ, và cả
            // hàng đọc như một mảng màu loang chứ không phải mấy lựa chọn tách bạch.
            bc={selected ? (tone?.fg ?? colors.border) : colors.border}
            bw={selected ? 2 : 1}
            br={radius.pill}
            px={space.sm}
            minHeight={sizing.touchTarget - 8}
          >
            <Ionicons
              name={tone?.icon ?? 'car-outline'}
              size={15}
              color={tone?.fg ?? colors.textMuted}
            />
            <Text
              col={tone?.fg ?? colors.text}
              fos={fontSize.bodySm}
              fow={selected ? fontWeight.semibold : fontWeight.medium}
              numberOfLines={1}
              flexShrink={1}
            >
              {domainLabel('serviceType', value)}
            </Text>
          </XStack>
        );

        if (only) return <XStack key={value}>{body}</XStack>;

        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            // `minWidth: 0` bắt buộc đi kèm `flex: 1`: thiếu nó thì con chữ ép ô rộng ra và
            // ba viên tràn khỏi màn hình thay vì cắt bớt.
            {...(singleRow ? { style: { flex: 1, minWidth: 0 } } : {})}
          >
            {body}
          </Pressable>
        );
      })}
    </XStack>
  );
}
