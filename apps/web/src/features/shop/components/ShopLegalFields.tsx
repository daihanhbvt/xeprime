'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Control } from 'react-hook-form';
import type { ShopProfileValues } from '@xeprime/validators';

import { AddressField } from '@/components/form/AddressField';
import { TextField } from '@/components/form/TextField';
import { useWorkspace } from '@/hooks/use-workspace';

import { SHOP_ADDRESS_FIELD_NAMES, SHOP_ADDRESS_PIN_NAMES } from '../shop-profile-form';
import styles from './ShopFields.module.css';

/**
 * ĐỊA CHỈ & PHÁP LÝ — nơi xe nằm, cộng hai ô giấy tờ tuỳ chọn.
 *
 * Địa chỉ ở đây là địa chỉ của CHI NHÁNH MẶC ĐỊNH: đổi nó là dời vị trí công khai của mọi xe
 * thuộc chi nhánh đó trên marketplace. Backend chuyển tiếp cho `BranchesService` (writer duy
 * nhất); hai cột tỉnh trên `tenant_profiles` chỉ là bản sao để hiển thị.
 *
 * Mã số thuế và giấy phép kinh doanh KHÔNG bắt buộc và cố ý đứng cuối: màn này là hồ sơ gian
 * hàng, không phải form KYC. Chặn ở đây nghĩa là một chủ xe cá nhân chưa có MST không sửa nổi
 * địa chỉ giao xe của mình.
 */
export function ShopLegalFields({
  control,
  readOnly,
}: {
  control: Control<ShopProfileValues>;
  /** Truyền xuống các ô CHỌN — `fieldset[disabled]` không với tới combobox dựng bằng div. */
  readOnly: boolean;
}) {
  const t = useTranslations('Shop');
  const { paths, isManage } = useWorkspace();

  return (
    <>
      <AddressField
        control={control}
        names={SHOP_ADDRESS_FIELD_NAMES}
        pin={SHOP_ADDRESS_PIN_NAMES}
        required
        wardRequired={false}
        disabled={readOnly}
        notice={
          <p className={styles.addressNotice}>
            {t('form.address.province.help')}
            {/*
              Link "quản lý chi nhánh" chỉ có nghĩa ở cổng gian hàng. Chủ xe tuyến hoa hồng chỉ
              có chi nhánh mặc định — chính cái đang sửa ngay tại ô này — và nhiều chi nhánh là
              tính năng của gói (ADR 0027 điều 1), nên đưa họ tới một màn họ không vào được là
              hứa suông.
            */}
            {isManage ? (
              <>
                {' '}
                <Link href={paths.branches} className={styles.helpLink}>
                  {t('form.address.province.branchLink')}
                </Link>
              </>
            ) : null}
          </p>
        }
      />
      <div className={styles.pairRow}>
        <TextField
          control={control}
          name="taxCode"
          label={t('form.address.taxCode.label')}
          placeholder={t('form.address.taxCode.placeholder')}
        />
        <TextField
          control={control}
          name="businessLicenseNo"
          label={t('form.address.businessLicenseNo.label')}
          placeholder={t('form.address.businessLicenseNo.placeholder')}
        />
      </div>
    </>
  );
}
