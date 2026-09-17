import { useTranslations } from 'use-intl';
import { ACCOUNT_TRACK, resolveAccountTrack } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';

/**
 * Cảnh báo "gian hàng chưa có gói dịch vụ hiệu lực" (ADR 0038 điều 11).
 *
 * `unconfigured` là LỖI CẤU HÌNH, không phải một tuyến: backend từ chối mọi đường ghi tiền của
 * tenant này (`TENANT_BILLING_NOT_CONFIGURED`) — duyệt tay bị chặn, tự nhận đơn bị chặn. Không
 * gọi họ là "hoa hồng" và không in một % nào, vì cả hai đều là lời khẳng định sai về tiền.
 *
 * KHÔNG chặn màn hình: đây là lỗi vận hành của nền tảng, người dùng không tự sửa được, và xem xe /
 * chuyến cũ / sổ tiền đều không đụng tới cấu hình gói.
 */
export function AccountTrackNotice() {
  const t = useTranslations('Account.trackNotice');
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();

  const { track } = resolveAccountTrack(user?.tenant ?? null);
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
