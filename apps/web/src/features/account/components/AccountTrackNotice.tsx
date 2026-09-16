'use client';

import { ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ACCOUNT_TRACK, resolveAccountTrack } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';

/**
 * HAI dải, một chỗ: "đang chờ thanh toán gói" và "lỗi cấu hình gói".
 *
 * Chúng phải tách nhau (ADR 0040 điều 2), và lý do là thứ dễ làm sai nhất ở đây: cả hai có
 * `billingMode` rỗng y như nhau. Một là bước còn nợ của CHÍNH người dùng — chuyển khoản là xong.
 * Cái kia là lỗi vận hành của nền tảng mà họ không tự sửa được. Gộp chúng nghĩa là mọi người vừa
 * bấm "Đăng ký gian hàng" đều nhận một dải ĐỎ "liên hệ hỗ trợ" ngay sau bước 1, cho một hệ thống
 * đang chạy đúng — và đúng lúc lẽ ra phải mời họ trả tiền.
 *
 * ## LỖI CẤU HÌNH GÓI của gian hàng — nói ra, thay vì âm thầm coi là tuyến hoa hồng
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

  /*
   * ĐANG CHỜ THANH TOÁN: dải thông tin, không phải dải lỗi — và nút dẫn về đúng bước còn nợ, chứ
   * không dẫn tới hỗ trợ. Họ không có gì phải hỏi ai; họ chỉ chưa chuyển khoản.
   */
  if (track === ACCOUNT_TRACK.PACKAGE_PENDING) {
    return (
      <Alert
        type="info"
        showIcon
        icon={<ClockCircleOutlined />}
        title={t('packagePendingTitle')}
        description={t('packagePendingBody')}
        action={
          <Button size="small" type="primary">
            <Link href={ROUTES.MANAGE.ONBOARDING}>{t('packagePendingCta')}</Link>
          </Button>
        }
      />
    );
  }

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
