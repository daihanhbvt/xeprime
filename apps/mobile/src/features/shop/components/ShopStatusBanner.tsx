import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TENANT_STATUS, TENANT_STATUS_SUBMITTABLE, type TenantStatus } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { space } from '@/theme/tokens';
import { shopStatusNotice } from '../status-notice';
import type { MyShop } from '../api';

/**
 * MỘT dải trạng thái cho màn hồ sơ gian hàng — bản native của `ShopStatusBanner` bên web.
 *
 * Nhãn trạng thái đã nằm cạnh tên gian hàng ở tiêu đề trang, nên lặp lại nó ở đây chỉ tốn chỗ.
 * Thứ dải này phải nói là điều người dùng CHƯA biết: hồ sơ đang ở đâu trong quy trình duyệt, lý
 * do bị trả về, và bước tiếp theo bấm vào đâu.
 *
 * Nội dung lấy từ `shopStatusNotice` — cùng bảng mà dải ở màn Tổng quan dùng. Hai chỗ tự dựng
 * câu chữ riêng là hai câu mâu thuẫn xếp chồng nhau trên cùng một màn (bug đã có ở web).
 */
export function ShopStatusBanner({
  shop,
  canSubmit,
  submitting,
  onSubmit,
}: {
  shop: MyShop;
  /** Quyền `tenant.submit_review` — hành động ĐỔI TRẠNG THÁI, không phải "lưu". */
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations('Shop');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const status = shop.status as TenantStatus;
  const notice = shopStatusNotice(shop.status);
  const approval = shop.latestApproval;
  const submittable = TENANT_STATUS_SUBMITTABLE.includes(status);

  /*
   * Mô tả ghép từ hai nguồn: câu hướng dẫn cố định của trạng thái, cộng thông tin CHỈ lần gửi
   * này mới có — thời điểm đã gửi, hoặc nguyên văn lý do đội duyệt viết. Lý do là thứ quan trọng
   * nhất trên màn hình khi hồ sơ bị trả về, nên nó không bao giờ bị nuốt mất.
   */
  const extra =
    status === TENANT_STATUS.PENDING_REVIEW && approval
      ? t('status.pending.submittedAt', { at: fmt.dateTime(approval.submittedAt) })
      : (status === TENANT_STATUS.NEEDS_REVISION || status === TENANT_STATUS.REJECTED) &&
          approval?.reason
        ? t('status.reason', { reason: approval.reason })
        : null;

  const body = t(`status.${notice.key}.body` as 'status.draft.body');

  return (
    <YStack gap={space.sm}>
      <Callout tone={notice.tone} title={t(`status.${notice.key}.title` as 'status.draft.title')}>
        {extra ? `${body}\n${extra}` : body}
      </Callout>

      {submittable && canSubmit ? (
        <Button
          label={status === TENANT_STATUS.DRAFT ? t('status.submit') : t('status.resubmit')}
          loading={submitting}
          onPress={onSubmit}
        />
      ) : status === TENANT_STATUS.PENDING_REVIEW ? (
        /*
         * Chờ duyệt là lúc DUY NHẤT dải này có việc hữu ích để đề nghị: xe khai báo được ngay từ
         * bây giờ (chỉ không lên marketplace), nên hồ sơ duyệt xong là bán được luôn thay vì mới
         * bắt đầu nhập xe.
         */
        <Button
          label={t('status.action.addVehicle')}
          variant="secondary"
          icon="add"
          onPress={() => navigateOnce(ROUTES.manage.vehicleNew())}
        />
      ) : null}
    </YStack>
  );
}
