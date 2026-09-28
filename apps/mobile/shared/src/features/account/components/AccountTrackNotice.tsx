import { useTranslations } from 'use-intl';
import { ACCOUNT_TRACK, resolveAccountTrack } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';

/**
 * HAI dải, một chỗ: "đang chờ thanh toán gói" và "lỗi cấu hình gói".
 *
 * Chúng phải tách nhau (ADR 0040 điều 2), và lý do là thứ dễ làm sai nhất ở đây: cả hai có
 * `billingMode` rỗng y như nhau. Một là bước còn nợ của CHÍNH người dùng — chuyển khoản là xong.
 * Cái kia là lỗi vận hành của nền tảng mà họ không tự sửa được. Gộp chúng nghĩa là mọi người vừa
 * bấm "Đăng ký gian hàng" đều nhận một dải ĐỎ "liên hệ hỗ trợ" ngay sau bước 1, cho một hệ thống
 * đang chạy đúng — và đúng lúc lẽ ra phải mời họ trả tiền.
 *
 * ## LỖI CẤU HÌNH GÓI — nói ra, thay vì âm thầm coi là tuyến hoa hồng
 *
 * `unconfigured` nghĩa là tenant không có dòng thuê bao nào đã bắt đầu. Giao diện vẫn cho họ làm
 * việc (họ SỞ HỮU một gian hàng và không có khu quản lý, nên khoá luôn là để họ không còn chỗ nào
 * cả), nhưng backend ĐANG TỪ CHỐI mọi đường ghi tiền của họ (`TENANT_BILLING_NOT_CONFIGURED`,
 * ADR 0038 điều 1) — và một người không được báo điều đó sẽ tưởng chuyến của mình đang chạy bình
 * thường cho tới lúc đối soát. Nên: không gọi họ là "hoa hồng", không in một % nào.
 *
 * KHÔNG chặn màn hình ở cả hai ca: xem xe, chuyến cũ và sổ tiền đều không đụng tới cấu hình gói.
 */
export function AccountTrackNotice() {
  const t = useTranslations('Account.trackNotice');
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();

  const { track } = resolveAccountTrack(user?.tenant ?? null);

  /*
   * ĐANG CHỜ THANH TOÁN: dải thông tin, không phải dải lỗi — và nút dẫn về đúng bước còn nợ, chứ
   * không dẫn tới hỗ trợ. Họ không có gì phải hỏi ai; họ chỉ chưa chuyển khoản.
   */
  if (track === ACCOUNT_TRACK.PACKAGE_PENDING) {
    return (
      <Callout tone="info" title={t('packagePendingTitle')}>
        <CalloutBody>{t('packagePendingBody')}</CalloutBody>
        <Button
          label={t('packagePendingCta')}
          size="sm"
          block={false}
          onPress={() => navigateOnce(ROUTES.manage.onboarding())}
        />
      </Callout>
    );
  }

  if (track !== ACCOUNT_TRACK.UNCONFIGURED) return null;

  return (
    <Callout tone="danger" title={t('unconfiguredTitle')}>
      <CalloutBody>{t('unconfiguredBody')}</CalloutBody>
      <Button
        label={t('contactSupport')}
        variant="secondary"
        size="sm"
        block={false}
        onPress={() => navigateOnce(ROUTES.account.support())}
      />
    </Callout>
  );
}
