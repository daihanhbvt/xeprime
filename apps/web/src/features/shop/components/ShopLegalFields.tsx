'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Control } from 'react-hook-form';
import { STOREFRONT_KIND, type StorefrontKind } from '@xeprime/types';
import type { ShopProfileWithContactValues } from '@xeprime/validators';

import { AddressField } from '@/components/form/AddressField';
import { TextField } from '@/components/form/TextField';
import { useWorkspace } from '@/hooks/use-workspace';

import { SHOP_ADDRESS_FIELD_NAMES, SHOP_ADDRESS_PIN_NAMES } from '../shop-profile-form';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import styles from './ShopFields.module.css';

/**
 * ĐỊA CHỈ & PHÁP LÝ — nơi xe nằm, cộng số giấy phép kinh doanh (tuỳ chọn).
 *
 * Địa chỉ ở đây là địa chỉ của CHI NHÁNH MẶC ĐỊNH: đổi nó là dời vị trí công khai của mọi xe
 * thuộc chi nhánh đó trên marketplace. Backend chuyển tiếp cho `BranchesService` (writer duy
 * nhất); hai cột tỉnh trên `tenant_profiles` chỉ là bản sao để hiển thị.
 *
 * Giấy phép kinh doanh KHÔNG bắt buộc và cố ý đứng cuối: màn này là hồ sơ gian hàng, không phải
 * form KYC. MÃ SỐ THUẾ không ở đây (07/10/2026): nó là hồ sơ người bán — section "Thông tin khai
 * thuế" ngay bên dưới, nguồn duy nhất mà hợp đồng và báo cáo thuế đọc.
 */
export function ShopLegalFields({
  control,
  readOnly,
  kind = STOREFRONT_KIND.SHOP,
}: {
  control: Control<ShopProfileWithContactValues>;
  /** Truyền xuống các ô CHỌN — `fieldset[disabled]` không với tới combobox dựng bằng div. */
  readOnly: boolean;
  /**
   * Chủ xe cá nhân không có "chi nhánh" nào để nói tới — chi nhánh mặc định của họ CHÍNH LÀ địa
   * chỉ nhận xe đang sửa ở đây, nên câu gợi ý nói đúng điều đó.
   */
  kind?: StorefrontKind;
}) {
  const t = useTranslations('Shop');
  const { paths, isManage } = useWorkspace();
  // Phiên hỗ trợ (ADR 0050 §10): địa chỉ gian hàng — thứ khách cũng thấy — vẫn hiện; số giấy phép
  // kinh doanh (dù đã che ở server) thì không.
  const supportHidesLegal = useSupportHides(SUPPORT_HIDDEN_AREA.SHOP_LEGAL);
  // Chủ xe cá nhân cho thuê xe của chính mình — GPKD là giấy tờ của người bán có pháp nhân, không
  // có chỗ trên hồ sơ của họ (07/10/2026). Giá trị cũ (nếu có) vẫn nằm trong form và gửi lại
  // nguyên trạng, nên ẩn ô không xoá dữ liệu.
  const legalHidden = supportHidesLegal || kind === STOREFRONT_KIND.PERSONAL;

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
            {kind === STOREFRONT_KIND.PERSONAL
              ? t('personal.provinceHelp')
              : t('form.address.province.help')}
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
      {legalHidden ? null : (
        <div className={styles.pairRow}>
          <TextField
            control={control}
            name="businessLicenseNo"
            label={t('form.address.businessLicenseNo.label')}
            placeholder={t('form.address.businessLicenseNo.placeholder')}
          />
        </div>
      )}
    </>
  );
}
