'use client';

import { ExclamationCircleOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ACCOUNT_TRACK, resolveAccountTrack } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';

/**
 * LỖI CẤU HÌNH GÓI của gian hàng — nói ra, thay vì âm thầm coi là tuyến hoa hồng.
 *
 * ## Ca thật mà nó bắt
 *
 * `billingMode` rỗng nghĩa là tenant không có dòng thuê bao nào đã bắt đầu, hoặc dòng gần nhất
 * thiếu `billing_mode` (`BILLING_PHASE.UNCONFIGURED`). Trên máy dev hôm nay có năm tenant như vậy.
 *
 * Giao diện vẫn cho họ làm việc — `isCommissionTrack` xếp họ vào Owner Lite, và đó là lựa chọn
 * đúng: họ SỞ HỮU một gian hàng và không có `/manage`, nên khoá luôn khu này sẽ để họ không còn
 * chỗ nào cả. Nhưng backend ĐANG TỪ CHỐI mọi đường ghi tiền của họ
 * (`TENANT_BILLING_NOT_CONFIGURED`, ADR 0038 điều 1), và một người không được báo điều đó sẽ
 * tưởng chuyến của mình đang chạy bình thường cho tới lúc đối soát.
 *
 * Nên: không gọi họ là "hoa hồng", không đoán một % nào, và nói thẳng việc cần làm.
 *
 * ## Vì sao KHÔNG chặn
 *
 * Đây là lỗi VẬN HÀNH của nền tảng, không phải lỗi của người dùng — họ không tự sửa được. Chặn
 * màn hình chỉ thêm một bức tường vào một ngày vốn đã hỏng; xem xe, xem chuyến cũ và xem sổ tiền
 * đều không đụng tới cấu hình gói.
 */
export function AccountTrackNotice() {
  const t = useTranslations('Account.trackNotice');
  const { data: user } = useCurrentUser();

  const { track } = resolveAccountTrack(user?.tenant ?? null);
  if (track !== ACCOUNT_TRACK.UNCONFIGURED) return null;

  return (
    <Alert
      type="error"
      showIcon
      icon={<ExclamationCircleOutlined />}
      title={t('unconfiguredTitle')}
      description={t('unconfiguredBody')}
      action={
        <Button size="small">
          <Link href={ROUTES.ACCOUNT.SUPPORT}>{t('contactSupport')}</Link>
        </Button>
      }
    />
  );
}
