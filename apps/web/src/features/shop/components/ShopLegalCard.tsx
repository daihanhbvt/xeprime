'use client';

import { guessAddressLine } from '@xeprime/domain';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Control } from 'react-hook-form';
import type { ShopProfileWithContactValues } from '@xeprime/validators';

import { DialogForm } from '@/components/form/DialogForm';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { DialogHeading } from '@/components/overlay/DialogHeading';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { SHOP_SECTION, shopSectionDomId, shopSectionPath } from '@/constants/routes';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';

import type { MyShop } from '../types';
import { InfoCard, InfoRow, InfoRows } from '@/components/layout/InfoCard';
import { ShopLegalFields } from './ShopLegalFields';
import cardStyles from '@/components/layout/InfoCard.module.css';

/**
 * Thẻ "Địa chỉ & pháp lý" - design `23999:111319`: bốn dòng đọc từ bản ĐÃ LƯU (tỉnh · xã · địa chỉ ·
 * số giấy phép KD) + ghi chú "Theo thông tin chi nhánh mặc định · Quản lý" dẫn tới section Chi nhánh.
 *
 * Địa chỉ ở đây LÀ địa chỉ của chi nhánh mặc định (backend chuyển tiếp cho `BranchesService`), nên
 * các dòng đọc từ `defaultBranch` trước, hồ sơ sau - cùng thứ tự với `toShopProfileValues`.
 *
 * Số giấy phép KD vắng trong phiên hỗ trợ (ADR 0050 §10 - giấy tờ pháp lý không mở cho phiên).
 */
export function ShopLegalCard({ shop, onEdit }: { shop: MyShop; onEdit?: () => void }) {
  const t = useTranslations('Shop.info.legal');
  const tCommon = useTranslations('Common');
  const supportHidesLegal = useSupportHides(SUPPORT_HIDDEN_AREA.SHOP_LEGAL);
  const branch = shop.defaultBranch;
  const profile = shop.profile;
  const empty = tCommon('labels.notAvailable');

  return (
    <InfoCard
      id={shopSectionDomId(SHOP_SECTION.LEGAL)}
      title={t('title')}
      hint={t('hint')}
      editLabel={t('edit')}
      onEdit={onEdit}
      footer={
        <>
          {t('defaultBranchNote')}{' '}
          <Link href={shopSectionPath(SHOP_SECTION.BRANCHES)} className={cardStyles.footerLink}>
            {t('manageBranches')}
          </Link>
        </>
      }
    >
      <InfoRows>
        <InfoRow
          label={t('province')}
          value={branch?.provinceName ?? profile.provinceName}
          emptyLabel={empty}
        />
        <InfoRow
          label={t('ward')}
          value={branch?.wardName ?? profile.wardName}
          emptyLabel={empty}
        />
        <InfoRow
          label={t('address')}
          value={guessAddressLine(branch?.address ?? profile.address)}
          emptyLabel={empty}
        />
        {supportHidesLegal ? null : (
          <InfoRow
            label={t('businessLicenseNo')}
            value={profile.businessLicenseNo}
            emptyLabel={empty}
          />
        )}
      </InfoRows>
    </InfoCard>
  );
}

/** Hộp thoại sửa - design `23999:111878`; ô nằm trên cùng form của trang (xem `ShopWorkspace`). */
export function ShopLegalDialog({
  open,
  control,
  saving,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  control: Control<ShopProfileWithContactValues>;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('Shop.info.legal');
  const tCommon = useTranslations('Common');

  return (
    <ResponsiveDialog
      open={open}
      size="sm"
      title={<DialogHeading title={t('title')} hint={t('dialogHint')} />}
      ariaLabel={t('title')}
      okText={tCommon('actions.update')}
      cancelText={tCommon('actions.cancel')}
      confirmLoading={saving}
      onOk={onSubmit}
      onClose={onCancel}
    >
      <DialogForm
        labelPosition="top"
        requiredMark={trailingRequiredMark}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <fieldset disabled={saving} className={cardStyles.fieldset}>
          <ShopLegalFields control={control} readOnly={saving} stacked />
        </fieldset>
      </DialogForm>
    </ResponsiveDialog>
  );
}
