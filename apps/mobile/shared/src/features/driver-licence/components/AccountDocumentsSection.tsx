import type { LayoutChangeEvent } from 'react-native';
import { useTranslations } from 'use-intl';
import { AccountPanel } from '@/features/account/components/AccountPanel';
import { DriverLicenceVerifier } from './DriverLicenceVerifier';

/**
 * Khối "Giấy tờ & Xác minh" ngay trong tab Tài khoản, dưới thẻ hồ sơ (design Account / Profile) —
 * bản native của `AccountDocumentsCard` web: CÙNG khung `AccountPanel` với thẻ hồ sơ phía trên
 * (bo 16, viền `color-border`, tiêu đề h3 semibold + mô tả 14 `text-tertiary`, gạch dưới đầu thẻ),
 * bản `spacious` (khe giữa các khối 24). Bộ xác thực bên trong là `embedded` nên vẽ PHẲNG — khung
 * đã có, không lồng thêm một thẻ thứ hai.
 *
 * Thay cho màn riêng `/account/documents` trước đây; `onLayout` cho màn cha cuộn thẳng tới khối
 * này khi mở bằng link cũ (`#documents` của web). Bước bằng lái khi đặt xe dùng cùng bộ xác thực,
 * nên nộp ở đâu thì chỗ kia cũng thấy (ADR 0057).
 */
export function AccountDocumentsSection({
  onLayout,
}: {
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const t = useTranslations('DriverLicence.page');
  const tn = useTranslations('Navigation.account');
  return (
    <AccountPanel title={tn('documents')} subtitle={t('subtitle')} spacious onLayout={onLayout}>
      <DriverLicenceVerifier embedded />
    </AccountPanel>
  );
}
