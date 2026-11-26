import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  SELLER_ENTITY_TYPE,
  SELLER_PROFILE_STATUS,
  SELLER_PROFILE_STATUS_META,
} from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InfoCard, InfoRow, InfoRows, type InfoCardLook } from '@/components/ui/InfoCard';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { SellerTaxForm } from '@/features/seller-profile/components/SellerTaxForm';
import { useSellerProfile } from '@/features/seller-profile/hooks/use-seller-profile';
import type { SellerProfile } from '@/features/seller-profile/api';
import { useDomainLabel } from '@/i18n/domain';
import { metaColor } from '@/lib/status-meta';
import { space } from '@/theme/tokens';

/**
 * Thẻ "Thông tin khai thuế" của trang Thông tin cửa hàng - bản native của `ShopTaxCard` web (design
 * `23999:111336`): loại hình · tên hộ KD/DN · MST (CCCD với cá nhân) + ghi chú về cách khấu trừ.
 *
 * Thẻ chỉ ĐỌC; bút chì mở tấm sửa (hộp `23999:112100`) - cùng `SellerTaxForm` với màn "Thông tin
 * khai thuế" của chủ xe, nên luật ghi toàn phần và cách khoá ô chỉ có một bản. Bút chì chỉ có khi
 * sửa được (`seller_profile.manage` + hồ sơ chưa khoá duyệt). Trạng thái khác "nháp" là viên ở góc
 * thẻ; yêu cầu sửa / từ chối kèm ghi chú của nền tảng.
 */
export function ShopTaxCard({
  onLayout,
  look = 'default',
}: {
  onLayout?: (event: LayoutChangeEvent) => void;
  /** `figma` = thẻ của Quản lý gian hàng (Figma Partner `24231:112112`). */
  look?: InfoCardLook;
}) {
  const t = useTranslations('Shop.info.tax');
  const tAccount = useTranslations('Account.tax');
  const tCommon = useTranslations('Common');
  const query = useSellerProfile();

  if (query.isLoading) {
    return (
      <InfoCard look={look} title={tAccount('title')} hint={t('hint')} {...(onLayout ? { onLayout } : {})}>
        <MiniRowsSkeleton rows={3} />
      </InfoCard>
    );
  }
  if (query.isError || !query.data) {
    return (
      <InfoCard look={look} title={tAccount('title')} hint={t('hint')} {...(onLayout ? { onLayout } : {})}>
        <YStack gap={space.sm}>
          <Callout tone="danger" title={tAccount('loadError')} />
          <XStack>
            <Button
              label={tCommon('actions.retry')}
              variant="secondary"
              size="sm"
              block={false}
              icon="refresh-outline"
              onPress={() => void query.refetch()}
            />
          </XStack>
        </YStack>
      </InfoCard>
    );
  }
  return <TaxCardBody profile={query.data} look={look} {...(onLayout ? { onLayout } : {})} />;
}

function TaxCardBody({
  profile,
  look,
  onLayout,
}: {
  profile: SellerProfile;
  look: InfoCardLook;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const t = useTranslations('Shop.info.tax');
  const tAccount = useTranslations('Account.tax');
  const tSeller = useTranslations('SellerProfile');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const [open, setOpen] = useState(false);

  const readOnly = !profile.editable || !has(PERMISSION.SELLER_PROFILE_MANAGE);
  const individual = profile.entityType === SELLER_ENTITY_TYPE.INDIVIDUAL;
  const empty = tCommon('labels.notAvailable');

  return (
    <>
      <InfoCard
        look={look}
        title={tAccount('title')}
        hint={t('hint')}
        editLabel={t('edit')}
        {...(readOnly ? {} : { onEdit: () => setOpen(true) })}
        {...(onLayout ? { onLayout } : {})}
        extra={
          profile.status === SELLER_PROFILE_STATUS.DRAFT ? undefined : (
            <StatusBadge
              label={domainLabel('sellerProfileStatus', profile.status)}
              color={metaColor(SELLER_PROFILE_STATUS_META, profile.status)}
            />
          )
        }
        footer={t('note')}
      >
        {profile.status === SELLER_PROFILE_STATUS.CHANGES_REQUESTED && profile.reviewNote ? (
          <Callout tone="warning" title={tSeller('page.changesRequested')}>
            {profile.reviewNote}
          </Callout>
        ) : null}
        {profile.status === SELLER_PROFILE_STATUS.REJECTED && profile.reviewNote ? (
          <Callout tone="danger" title={tSeller('page.rejected')}>
            {profile.reviewNote}
          </Callout>
        ) : null}

        <InfoRows {...(look === 'figma' ? { gap: 8 } : {})}>
          <InfoRow
            label={t('entityType')}
            value={domainLabel('sellerEntityType', profile.entityType)}
            emptyLabel={empty}
          />
          <InfoRow
            label={individual ? tAccount('legalName') : t('legalNameBusiness')}
            value={profile.legalName ?? null}
            emptyLabel={empty}
          />
          <InfoRow
            label={individual ? tAccount('idNumber') : tAccount('taxId')}
            value={(individual ? profile.idNumber : profile.taxId) ?? null}
            emptyLabel={empty}
          />
        </InfoRows>
      </InfoCard>

      {readOnly ? null : (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title={tAccount('title')}
          subtitle={t('hint')}
        >
          <SellerTaxForm
            profile={profile}
            variant="sheet"
            onCancel={() => setOpen(false)}
            onSaved={() => setOpen(false)}
          />
        </BottomSheet>
      )}
    </>
  );
}
