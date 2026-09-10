import { memo } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Ionicons } from '@expo/vector-icons';
import { BOOKING_STATUS_META, OCCUPANCY_SOURCE_TYPE_META } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, radius, space } from '@/theme/tokens';
import {
  isDashedEvent,
  LEGEND_BOOKING_STATUSES,
  LEGEND_EXTRA_TONE,
  LEGEND_SOURCE_TYPES,
  sourceTone,
  statusColorTone,
  type CalendarTone,
} from '../calendar-tone';
import { EVENT_ICON } from '../event-tone';

interface LegendItem {
  key: string;
  label: string;
  tone: CalendarTone;
  icon?: IconName;
  dashed?: boolean;
  round?: boolean;
}

/** Ô mẫu 14dp: web dùng 12px, cộng 2dp vì vài ô ở đây còn phải chở một biểu tượng bên trong. */
const SWATCH = 14;
const SWATCH_ICON = 9;

/**
 * Chú giải — SINH RA TỪ chính dữ liệu mà lưới vẽ, không phải một danh sách chép tay.
 *
 * Trạng thái đơn lấy từ `LEGEND_BOOKING_STATUSES`, nhãn lấy từ `Domain.bookingStatus` — cùng
 * nguồn với viên trạng thái ở màn chi tiết, nên chú giải và nhãn không thể gọi tên khác nhau.
 * Màu thì đi qua `statusColorTone`/`sourceTone`, đúng hai hàm mà thanh event dùng, nên chú giải
 * không thể nói một màu khác với lưới.
 *
 * Bản trước chép tay theo web CŨ: liệt kê "Đơn thuê" (không phải trạng thái nào), tô "Đang thuê"
 * xanh lá trong khi lưới vẽ `active` xanh dương, và không hề có ô nào cho `reserved`. Web đã sửa
 * ở `fix(web): sync calendar status colors and legend`; đây là bản dịch của mô hình mới.
 *
 * Ô mẫu là ô VUÔNG CÓ VIỀN vì đó là hình của thanh event trên lưới; `booking_request` và
 * `blocked_range` mang thêm nét ĐỨT — tín hiệu không dựa vào màu, dùng lại đúng `isDashedEvent`
 * mà thanh event dùng. Riêng "Giá riêng" là hình TRÒN tô đặc, đúng hình chấm giá trên ô ngày.
 *
 * Cuộn ngang vì bảy mục không xếp vừa một hàng ở 320dp, và xuống dòng thì dải này cao gấp đôi
 * trên mọi máy — nó là chú thích, không phải nội dung.
 */
export const CalendarLegend = memo(function CalendarLegend() {
  const t = useTranslations('Calendar');
  const domainLabel = useDomainLabel();

  const items: LegendItem[] = [
    ...LEGEND_BOOKING_STATUSES.map((status) => ({
      key: `status-${status}`,
      label: domainLabel('bookingStatus', status, BOOKING_STATUS_META[status].label),
      tone: statusColorTone(BOOKING_STATUS_META[status].color),
    })),
    ...LEGEND_SOURCE_TYPES.map((type) => {
      const icon = EVENT_ICON[type];
      return {
        key: `source-${type}`,
        label: domainLabel('occupancySourceType', type, OCCUPANCY_SOURCE_TYPE_META[type]?.label),
        tone: sourceTone(type),
        dashed: isDashedEvent(type),
        ...(icon ? { icon } : {}),
      };
    }),
    {
      key: 'customPrice',
      label: t('legend.customPrice'),
      tone: LEGEND_EXTRA_TONE.customPrice,
      round: true,
    },
    {
      key: 'holiday',
      label: t('legend.holiday'),
      tone: LEGEND_EXTRA_TONE.holiday,
      icon: 'flag',
    },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      /*
       * `flexGrow: 0` KHÔNG phải tinh chỉnh — thiếu nó là màn hình vỡ.
       *
       * `Screen` dựng nội dung thành một cột flex (`flexGrow: 1`), và một `ScrollView` không bị
       * chặn sẽ TRANH chỗ với vùng lưới `flex: 1` ngay dưới: hai bên chia đôi khoảng trống, chú
       * giải phình ra vài trăm dp, các mục bên trong bị kéo giãn rồi căn giữa theo chiều dọc — ra
       * đúng hai mảng trắng lớn kẹp lấy một dòng chú giải lơ lửng, còn lưới thì bị dồn xuống đáy
       * và chỉ còn ba hàng xe.
       *
       * `flexShrink: 0` đi kèm để chiều cao chú giải không bị bóp ngược lại khi lưới đòi chỗ.
       */
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        paddingHorizontal: layout.screenX,
        paddingVertical: space.xs,
        gap: space.sm,
        // Mục căn giữa theo CHIỀU DỌC của chính nó, không kéo giãn theo chiều cao dải.
        alignItems: 'center',
      }}
      accessibilityLabel={t('legend.ariaLabel')}
    >
      {items.map((item) => (
        <XStack key={item.key} ai="center" gap={4}>
          <YStack
            w={SWATCH}
            h={SWATCH}
            ai="center"
            jc="center"
            br={item.round ? radius.pill : radius.sm}
            bg={item.tone.bg}
            bw={1}
            bc={item.tone.border}
            /*
             * `borderStyle` chỉ đặt khi CẦN nét đứt: trên Android, đổi kiểu viền của một view có
             * bo góc là chỗ hay vẽ hỏng, nên các ô còn lại không đi qua nhánh đó.
             */
            {...(item.dashed ? { borderStyle: 'dashed' as const } : {})}
          >
            {item.icon ? (
              <Ionicons name={item.icon} size={SWATCH_ICON} color={item.tone.fg} />
            ) : null}
          </YStack>
          <Text col={colors.textMuted} fos={fontSize.meta}>
            {item.label}
          </Text>
        </XStack>
      ))}
    </ScrollView>
  );
});
