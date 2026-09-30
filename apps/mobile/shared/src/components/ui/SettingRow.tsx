import type { Href } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { DetailChevron } from './DetailArrow';
import { IconDisc } from './IconDisc';
import type { IconName } from './Chip';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

/**
 * Một dòng CÀI ĐẶT dẫn sang màn khác: đĩa hình, tên việc, câu nói việc đó làm gì, mũi tên.
 *
 * Khác `AccountNavRow` của menu tài khoản — dòng menu chỉ có một nhãn và phải xếp được mười mục
 * liền nhau, còn dòng này đứng một mình (hoặc đôi) trong một thẻ và mang theo một câu mô tả. Đổi
 * mật khẩu và yêu cầu xoá tài khoản dùng đúng hình này ở hai màn khác nhau, nên nó ở
 * `components/ui/` chứ không nằm trong một màn: hai bản chép tay sẽ lệch nhau ở lần đổi đầu tiên,
 * mà một trong hai dòng đó là thao tác không rút lại được.
 *
 * `danger` đổi CẢ đĩa lẫn tên sang đỏ. Nó không chỉ là trang trí: một dòng xoá tài khoản in cùng
 * cỡ chữ cùng màu với dòng đổi mật khẩu là mời người dùng chạm nhầm.
 */
export function SettingRow({
  icon,
  label,
  description,
  href,
  danger = false,
}: {
  icon: IconName;
  label: string;
  description: string;
  href: Href;
  danger?: boolean;
}) {
  const navigateOnce = useNavigateOnce();
  const tone = danger ? colors.danger : colors.primary;
  const surface = danger ? colors.dangerSurface : colors.primaryLight;

  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={() => navigateOnce(href)}
      style={({ pressed }) =>
        pressed ? { backgroundColor: surface, borderRadius: radius.md } : null
      }
    >
      <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} py={space.sm}>
        {/*
          Đĩa biểu tượng thay cho hình trần: nó phân loại dòng trước khi mắt kịp đọc chữ, và ở
          dòng xoá tài khoản thì chính cái đĩa đỏ là thứ chặn ngón tay lại.
        */}
        <IconDisc icon={icon} tone={tone} surface={surface} />
        <YStack f={1} minWidth={0} gap={2}>
          <Text
            col={danger ? colors.danger : colors.text}
            fos={fontSize.body}
            fow={fontWeight.semibold}
          >
            {label}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {description}
          </Text>
        </YStack>
        <DetailChevron />
      </XStack>
    </Pressable>
  );
}
