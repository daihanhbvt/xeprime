import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isLogoOnlyGate } from '@xeprime/domain';
import type { PackageShopListingRequirement } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, space } from '@/theme/tokens';

/**
 * "Hồ sơ gian hàng chưa đủ để gửi xe duyệt" — dải lỗi có LỐI ĐI TIẾP (ADR 0040).
 *
 * ## Vì sao là một dải, không phải một toast
 *
 * Câu trả lời cần một ĐƯỜNG ĐI, và một toast thì không chứa được nút — nó biến mất sau vài giây,
 * để lại người dùng với một câu nói về logo và không có đường nào tới ô logo. Dải này đứng ngay
 * trên nút "Gửi duyệt" cho tới khi vấn đề được sửa.
 *
 * ## Hai câu chữ, và ca một-mục là ca thường gặp
 *
 * Bước 1 của onboarding đã đòi đủ tên · SĐT · tỉnh · xã · địa chỉ, nên sau khi thanh toán mục duy
 * nhất còn thiếu gần như luôn là LOGO. Nó được một câu riêng, nói thẳng, thay vì một danh sách
 * gạch đầu dòng có một dòng.
 *
 * Danh sách dựng từ MÃ qua `t()` (ADR 0012) — không bao giờ in `details.missing` thô. Mã lạ đã bị
 * `packageShopListingGateFrom` lọc ở biên, nên mọi khoá tới đây đều có nhãn.
 */
export function ShopListingGateAlert({
  missing,
}: {
  missing: readonly PackageShopListingRequirement[];
}) {
  const t = useTranslations('Shop.listingGate');
  const navigateOnce = useNavigateOnce();

  const logoOnly = isLogoOnlyGate(missing);

  return (
    <Callout tone="warning" title={logoOnly ? t('logoOnly') : t('title')}>
      {logoOnly ? null : (
        <YStack gap={2}>
          {missing.map((key) => (
            <XStack key={key} ai="flex-start" gap={space.xs}>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {'•'}
              </Text>
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                {t(`items.${key}`)}
              </Text>
            </XStack>
          ))}
        </YStack>
      )}
      {/*
        Dẫn tới HỒ SƠ gian hàng — nơi ô logo và các trường còn thiếu sống. Trỏ vào tổng quan quản
        lý là thả người dùng ở một màn không sửa được thứ vừa bị từ chối.
      */}
      <Button
        label={logoOnly ? t('ctaLogo') : t('cta')}
        size="sm"
        block={false}
        onPress={() => navigateOnce(ROUTES.manage.shop())}
      />
    </Callout>
  );
}
