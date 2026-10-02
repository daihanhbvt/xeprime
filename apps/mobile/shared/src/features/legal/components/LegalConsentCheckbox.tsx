import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CheckMark } from '@/components/ui/CheckMark';
import { colors, fontSize, sizing, space } from '@/theme/tokens';
import { useLegalLinkChunks } from '../use-legal-link-chunks';

/**
 * Ô tick "Tôi đã đọc và đồng ý…" — cửa chặn của nút TẠO TÀI KHOẢN.
 *
 * **Cố ý KHÁC web, và chỉ ở đúng chỗ này.** Web dùng một CÂU luôn hiện, không ô tick — quyết
 * định 20/08 khi bỏ ô tick khỏi luồng đặt xe, vì ở đó nó chặn nút gửi bằng một thao tác không ai
 * đọc (xem `LegalConsentNote`). Tạo TÀI KHOẢN thì khác: đó là lúc người dùng giao kết lần đầu và
 * cả hai chợ ứng dụng đều đòi một hành vi đồng ý tường minh, ghi lại được — App Store review
 * guideline 5.1.1(i) và Play Data safety. Ba chỗ cam kết còn lại (đăng nhập, đặt xe, mở gian
 * hàng) vẫn dùng câu của `LegalConsentNote`.
 *
 * Đích chạm là CẢ HÀNG, không riêng ô vuông 20px — trừ hai liên kết, thứ mở màn văn bản thay vì
 * lật ô tick. Chạm nhầm vào chữ mà ra một màn khác là cách nhanh nhất để người dùng nghĩ ô tick
 * hỏng, nên hai liên kết phải là hai từ được gạch riêng chứ không phải cả câu.
 */
export function LegalConsentCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('Legal');
  const chunks = useLegalLinkChunks();

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={t('consent.authCheckPlain')}
    >
      <XStack ai="flex-start" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
        {/* `pt` nhỏ để ô thẳng hàng với DÒNG ĐẦU của câu, không phải với giữa cả khối. */}
        <YStack pt={2}>
          <CheckMark checked={checked} />
        </YStack>
        <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
          {t.rich('consent.authCheck', chunks)}
        </Text>
      </XStack>
    </Pressable>
  );
}
