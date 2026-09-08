import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import type { IconName } from '@/components/ui/Chip';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Huy hiệu tròn quanh biểu tượng — vừa đủ ôm một icon 13pt, không lấn chỗ con số. */
const BADGE_SIZE = 22;

/** Cỡ icon trong huy hiệu — nhỏ hơn `iconSize.xs` một bậc vì nó nằm trong vòng tròn 22pt. */
const BADGE_ICON = 12;

export interface Metric {
  /** Khoá React — dùng khoá message của nhãn, đừng lấy chỉ số mảng. */
  key: string;
  label: string;
  value: string;
  icon: IconName;
  /**
   * Màu VAI TRÒ của chỉ số — ăn vào biểu tượng và nền huy hiệu, KHÔNG ăn vào con số.
   *
   * Đây là chỗ duy nhất của thẻ có màu phân loại: tiền vào xanh, tiền ra đỏ, số lượt xanh dương,
   * tỷ trọng vàng thương hiệu. Bốn ô cùng một sắc xám thì mắt phải đọc nhãn mới biết ô nào là ô
   * nào; một chấm màu ở đầu ô thì nhận ra trước khi kịp đọc.
   *
   * Con số vẫn để đen: tô cả huy hiệu lẫn chữ số là cùng một thông tin nói hai lần, và khi mọi
   * con số đều có màu thì không con số nào còn nổi lên.
   */
  tone: { fg: string; bg: string };
}

/** Bốn vai đang dùng ở hai dải xếp hạng — nơi gọi chọn vai, không tự bốc màu. */
export const METRIC_TONE = {
  revenue: { fg: colors.success, bg: colors.successSurface },
  cost: { fg: colors.danger, bg: colors.dangerSurface },
  count: { fg: colors.info, bg: colors.infoSurface },
  share: { fg: colors.primaryActive, bg: colors.primaryLight },
} as const;

/**
 * Dải số phụ trong một thẻ danh sách — mỗi chỉ số MỘT HÀNG: huy hiệu + nhãn bên trái, giá trị
 * căn phải.
 *
 * Bản đầu chia đều thành cột dọc. Ý tưởng đúng — quét dọc so sánh giữa các dòng — nhưng ba cột
 * trên màn 390dp thì mỗi cột còn ~72dp cho con số, tức là **không đủ chỗ cho một số tiền viết
 * đủ**: `82.500.000 ₫` cần ~85dp. Nó ép nơi gọi phải ghi tắt (`12,5tr`), mà một dải xếp hạng
 * TIỀN thì con số chính là toàn bộ nội dung — làm tròn nó đi để lấy chỗ cho cái khung là đánh đổi
 * ngược. Web bày cả bảng với số đầy đủ, app cũng phải đọc ra đúng từng đồng.
 *
 * Xếp hàng thì con số có gần trọn bề ngang thẻ, và vì tất cả căn phải nên **cột số vẫn thẳng một
 * mép** — vẫn quét dọc so sánh được, chỉ khác là so giữa các chỉ số trong cùng một thẻ thay vì
 * phải căng mắt vào ba ô hẹp.
 *
 * KHÔNG có nền khối: một mảng xám đặc dưới mỗi thẻ, nhân với hai chục thẻ, làm cả trang nặng và
 * tối đi trong khi nó chẳng nói thêm điều gì. Một vạch kẻ trên đầu dải đủ để tách khối SỐ khỏi
 * khối DANH TÍNH.
 */
export function MetricStrip({ items }: { items: readonly Metric[] }) {
  return (
    <YStack borderTopWidth={1} borderTopColor={colors.borderSubtle} pt={space.xs} gap={space.xs}>
      {items.map((item) => (
        <XStack key={item.key} ai="center" gap={space.xs}>
          <YStack
            w={BADGE_SIZE}
            h={BADGE_SIZE}
            br={radius.pill}
            ai="center"
            jc="center"
            bg={item.tone.bg}
          >
            <Ionicons name={item.icon} size={BADGE_ICON} color={item.tone.fg} />
          </YStack>

          <Text f={1} minWidth={0} col={colors.placeholder} fos={fontSize.label} numberOfLines={1}>
            {item.label}
          </Text>

          {/*
            `flexShrink={0}` và KHÔNG `adjustsFontSizeToFit`: hết chỗ thì NHÃN co lại, con số
            không bao giờ bị bóp nhỏ hay cắt cụt. Một số tiền cụt là con số sai.
          */}
          <Text
            flexShrink={0}
            col={colors.text}
            fos={fontSize.bodySm}
            fow={fontWeight.semibold}
            ta="right"
            numberOfLines={1}
          >
            {item.value}
          </Text>
        </XStack>
      ))}
    </YStack>
  );
}
