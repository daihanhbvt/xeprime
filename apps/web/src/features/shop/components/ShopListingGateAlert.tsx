'use client';

import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { PackageShopListingRequirement } from '@xeprime/types';

import { SHOP_SECTION, shopSectionPath } from '@/constants/routes';

import { isLogoOnlyGate } from '../listing-gate';
import styles from './ShopListingGateAlert.module.css';

/**
 * "Hồ sơ gian hàng chưa đủ để gửi xe duyệt" — dải lỗi có LỐI ĐI TIẾP (ADR 0040).
 *
 * ## Vì sao là một dải, không phải một toast
 *
 * Câu trả lời cần một cái LINK, và một `message.error` thì không chứa được link — nó biến mất
 * sau vài giây, để lại người dùng với một câu nói về logo và không có đường nào tới ô logo. Dải
 * này đứng ngay trên nút "Gửi duyệt" cho tới khi vấn đề được sửa.
 *
 * ## Hai câu chữ, và ca một-mục là ca thường gặp
 *
 * Bước 1 của onboarding đã đòi đủ tên · SĐT · tỉnh · xã · địa chỉ, nên sau khi thanh toán mục
 * duy nhất còn thiếu gần như luôn là LOGO. Nó được một câu riêng, nói thẳng, thay vì một danh
 * sách gạch đầu dòng có một dòng.
 *
 * Danh sách dựng từ MÃ qua `t()` (ADR 0012) — không bao giờ in `details.missing` thô. Mã lạ đã
 * bị `packageShopListingGateFrom` lọc ở biên, nên mọi khoá tới đây đều có nhãn.
 */
export function ShopListingGateAlert({
  missing,
}: {
  missing: readonly PackageShopListingRequirement[];
}) {
  const t = useTranslations('Shop.listingGate');

  const logoOnly = isLogoOnlyGate(missing);

  return (
    <Alert
      type="warning"
      showIcon
      className={styles.alert}
      title={logoOnly ? t('logoOnly') : t('title')}
      description={
        logoOnly ? null : (
          <ul className={styles.list}>
            {missing.map((key) => (
              <li key={key}>{t(`items.${key}`)}</li>
            ))}
          </ul>
        )
      }
      action={
        /*
         * `?section=profile` đưa trang Cửa hàng cuộn thẳng tới khối "Thông tin hiển thị" — nơi ô
         * logo sống (`ShopWorkspace` đọc `sectionInUrl` để biết có cuộn hay không). Trỏ vào
         * `/manage/shop` trần là thả người dùng ở đầu một trang năm section và để họ tự tìm.
         */
        <Link href={shopSectionPath(SHOP_SECTION.PROFILE)}>
          <Button type="primary" size="small">
            {logoOnly ? t('ctaLogo') : t('cta')}
          </Button>
        </Link>
      }
    />
  );
}
