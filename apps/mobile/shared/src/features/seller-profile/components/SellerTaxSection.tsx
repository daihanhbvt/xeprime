import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SELLER_PROFILE_STATUS_META } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import { metaColor } from '@/lib/status-meta';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { useSellerProfile } from '../hooks/use-seller-profile';
import { SellerTaxForm } from './SellerTaxForm';

/**
 * Khối "Thông tin khai thuế" của trang Cửa hàng — bản native của web `SellerTaxSection` (PR #159).
 *
 * Mã số thuế của gian hàng tuyến gói sống ở hồ sơ người bán (`seller_profiles.tax_id`), không còn
 * ở form hồ sơ gian hàng. Thiếu khối này thì gian hàng tuyến gói không có chỗ nào trên app để khai
 * hay sửa MST. Người gọi gác `seller_profile.view`; tự khối gác `manage` (chỉ-xem khi thiếu).
 *
 * Khối có nút Lưu RIÊNG, đứng ngoài biểu mẫu hồ sơ gian hàng — hai bản ghi, hai endpoint.
 */
export function SellerTaxSection() {
  const t = useTranslations('Account.tax');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const profileQuery = useSellerProfile();
  const profile = profileQuery.data;

  let body;
  if (profileQuery.isLoading) {
    body = <MiniRowsSkeleton rows={4} />;
  } else if (profileQuery.isError || !profile) {
    body = (
      <YStack gap={space.sm}>
        <Callout tone="danger" title={t('loadError')} />
        <XStack>
          <Button
            label={tCommon('actions.retry')}
            variant="secondary"
            size="sm"
            block={false}
            icon="refresh-outline"
            onPress={() => void profileQuery.refetch()}
          />
        </XStack>
      </YStack>
    );
  } else {
    body = <SellerTaxForm profile={profile} />;
  }

  return (
    <YStack gap={space.md}>
      <XStack ai="center" gap={space.sm}>
        <YStack f={1} minWidth={0}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
            {t('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('subtitle')}
          </Text>
        </YStack>
        {profile ? (
          <StatusBadge
            label={domainLabel('sellerProfileStatus', profile.status)}
            color={metaColor(SELLER_PROFILE_STATUS_META, profile.status)}
            size="sm"
          />
        ) : null}
      </XStack>
      {body}
    </YStack>
  );
}
