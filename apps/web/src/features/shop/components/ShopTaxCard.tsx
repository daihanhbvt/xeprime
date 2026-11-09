'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  SELLER_ENTITY_TYPE,
  SELLER_PROFILE_STATUS,
  SELLER_PROFILE_STATUS_META,
  type SellerProfileStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { DialogForm } from '@/components/form/DialogForm';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { DialogHeading } from '@/components/overlay/DialogHeading';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { SHOP_SECTION, shopSectionDomId } from '@/constants/routes';
import { SellerTaxFields } from '@/features/seller-profile/components/SellerTaxFields';
import { useSellerProfile } from '@/features/seller-profile/hooks/use-seller-profile';
import { useSellerTaxForm } from '@/features/seller-profile/hooks/use-seller-tax-form';
import type { SellerProfile } from '@/features/seller-profile/types';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { InfoCard, InfoRow, InfoRows } from '@/components/layout/InfoCard';
import cardStyles from '@/components/layout/InfoCard.module.css';

/**
 * Thẻ "Thông tin khai thuế" — design `23999:111336`: loại hình · tên hộ KD/DN · MST (CCCD với cá nhân)
 * + ghi chú về cách khấu trừ. Sửa trong hộp thoại `23999:112100`, lưu vào hồ sơ NGƯỜI BÁN — nguồn
 * duy nhất của mã số thuế (cùng form với "Hồ sơ chủ xe": `useSellerTaxForm`).
 *
 * Bút chì chỉ có khi sửa được (`seller_profile.manage` + hồ sơ không bị khoá duyệt). Trạng thái
 * duyệt khác "nháp" hiện thành nhãn ở đầu thẻ; yêu cầu sửa / từ chối kèm ghi chú của nền tảng.
 */
export function ShopTaxCard() {
  const t = useTranslations('Shop.info.tax');
  const tAccount = useTranslations('Account.tax');
  const tCommon = useTranslations('Common');
  const query = useSellerProfile();
  const [open, setOpen] = useState(false);

  const id = shopSectionDomId(SHOP_SECTION.TAX);

  if (query.isLoading) {
    return (
      <InfoCard id={id} title={tAccount('title')} hint={t('hint')}>
        <Skeleton active paragraph={{ rows: 3 }} />
      </InfoCard>
    );
  }
  if (query.isError || !query.data) {
    return (
      <InfoCard id={id} title={tAccount('title')} hint={t('hint')}>
        <Alert
          type="error"
          showIcon
          title={tAccount('loadError')}
          action={
            <Button size="small" onClick={() => void query.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      </InfoCard>
    );
  }

  return (
    <TaxCardBody
      profile={query.data}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    />
  );
}

function TaxCardBody({
  profile,
  open,
  onOpen,
  onClose,
}: {
  profile: SellerProfile;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('Shop.info.tax');
  const tAccount = useTranslations('Account.tax');
  const tSeller = useTranslations('SellerProfile');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const { form, isIndividual, readOnly, saving, submit } = useSellerTaxForm(profile);

  const individual = profile.entityType === SELLER_ENTITY_TYPE.INDIVIDUAL;
  const status = profile.status as SellerProfileStatus;
  const empty = tCommon('labels.notAvailable');
  const close = () => {
    form.reset();
    onClose();
  };
  const save = submit(onClose);

  return (
    <InfoCard
      id={shopSectionDomId(SHOP_SECTION.TAX)}
      title={tAccount('title')}
      hint={t('hint')}
      editLabel={t('edit')}
      onEdit={readOnly ? undefined : onOpen}
      extra={
        status === SELLER_PROFILE_STATUS.DRAFT ? null : (
          <StatusTag
            value={status}
            meta={SELLER_PROFILE_STATUS_META}
            group="sellerProfileStatus"
            appearance="pill"
          />
        )
      }
      footer={t('note')}
    >
      {status === SELLER_PROFILE_STATUS.CHANGES_REQUESTED && profile.reviewNote ? (
        <Alert
          type="warning"
          showIcon
          title={tSeller('page.changesRequested')}
          description={profile.reviewNote}
        />
      ) : null}
      {status === SELLER_PROFILE_STATUS.REJECTED && profile.reviewNote ? (
        <Alert
          type="error"
          showIcon
          title={tSeller('page.rejected')}
          description={profile.reviewNote}
        />
      ) : null}

      <InfoRows>
        <InfoRow
          label={t('entityType')}
          value={domainLabel('sellerEntityType', profile.entityType)}
          emptyLabel={empty}
        />
        <InfoRow
          label={individual ? tAccount('legalName') : t('legalNameBusiness')}
          value={profile.legalName}
          emptyLabel={empty}
        />
        <InfoRow
          label={individual ? tAccount('idNumber') : tAccount('taxId')}
          value={individual ? profile.idNumber : profile.taxId}
          emptyLabel={empty}
        />
      </InfoRows>

      {readOnly ? null : (
        <ResponsiveDialog
          open={open}
          size="sm"
          title={<DialogHeading title={tAccount('title')} hint={t('hint')} />}
          ariaLabel={tAccount('title')}
          okText={tCommon('actions.update')}
          cancelText={tCommon('actions.cancel')}
          confirmLoading={saving}
          onOk={() => void save()}
          onClose={close}
        >
          <DialogForm labelPosition="top" requiredMark={trailingRequiredMark} onSubmit={save}>
            <fieldset disabled={saving} className={cardStyles.fieldset}>
              <SellerTaxFields
                control={form.control}
                isIndividual={isIndividual}
                disabled={saving}
              />
            </fieldset>
          </DialogForm>
        </ResponsiveDialog>
      )}
    </InfoCard>
  );
}
