import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TENANT_STATUS, type TenantStatus } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useAppFormat } from '@/i18n/use-app-format';
import { space } from '@/theme/tokens';
import { shopStatusNotice, shopVerificationNotice } from '../status-notice';
import type { MyShop } from '../api';

/**
 * MỘT dải trạng thái cho màn hồ sơ gian hàng — bản native của `ShopStatusBanner` bên web.
 *
 * Nhãn trạng thái đã nằm cạnh tên gian hàng ở tiêu đề trang, nên lặp lại nó ở đây chỉ tốn chỗ.
 * Thứ dải này phải nói là điều người dùng CHƯA biết: hồ sơ đang ở đâu trong quy trình xác minh, lý
 * do bị trả về, và bước tiếp theo bấm vào đâu.
 *
 * ## HAI TRỤC, đọc theo thứ tự (ADR 0036)
 *
 * `tenants.status` trả lời "gian hàng còn được hoạt động không"; `verification` trả lời "nền tảng
 * đã xem xét pháp nhân chưa". Gộp chúng là quay về đúng chỗ cũ: một quyết định "cần bổ sung hồ sơ
 * pháp nhân" lại hiện ra như "gian hàng của bạn chưa hoạt động", và chủ xe đi tìm xem xe mình biến
 * đi đâu.
 *
 * Trạng thái vận hành đọc TRƯỚC: gian hàng đang bị khoá thì tin đó quan trọng hơn hẳn một dòng về
 * hồ sơ pháp nhân. Nhánh này cũng bắt dữ liệu cũ (`draft`/`pending_review` chưa backfill) — với
 * chúng, câu chữ theo trạng thái vẫn là câu đúng.
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

  const status = shop.status as TenantStatus;
  const approval = shop.latestApproval;

  if (status !== TENANT_STATUS.ACTIVE) {
    const notice = shopStatusNotice(shop.status);
    return (
      <Callout tone={notice.tone} title={t(`status.${notice.key}.title` as 'status.draft.title')}>
        {t(`status.${notice.key}.body` as 'status.draft.body')}
      </Callout>
    );
  }

  const notice = shopVerificationNotice(shop.verification);

  /*
   * Hai trạng thái IM LẶNG, vì cả hai đều "không có tin gì, không có việc gì":
   *
   *  - `verified` — nhãn trạng thái cạnh tên gian hàng đã mang thông tin đó, nên một dải xanh
   *    "mọi thứ đều ổn" chiếm trọn bề ngang chỉ dạy người dùng bỏ qua vùng ấy.
   *  - `unverified` — từ ADR 0040 xác minh KHÔNG còn là cổng mua gói, nên không còn gì để mời
   *    người dùng làm ở đây; xem docblock của `VERIFICATION_NOTICE` trong `status-notice.ts`.
   *    Giá trị lạ cũng rơi về nhánh này, và im lặng là câu trả lời an toàn cho một mã không hiểu.
   */
  if (notice.key === 'verified' || notice.key === 'unverified') return null;

  /*
   * Mô tả ghép từ hai nguồn: câu hướng dẫn cố định của trạng thái, cộng thông tin CHỈ lần gửi này
   * mới có — thời điểm đã gửi, hoặc nguyên văn lý do đội duyệt viết. Lý do là thứ quan trọng nhất
   * trên màn hình khi hồ sơ bị trả về, nên nó không bao giờ bị nuốt mất.
   */
  const extra =
    notice.key === 'pending' && approval
      ? t('verification.pending.submittedAt', { at: fmt.dateTime(approval.submittedAt) })
      : notice.useReason && approval?.reason
        ? t('status.reason', { reason: approval.reason })
        : null;

  const body = t(`verification.${notice.key}.body` as 'verification.pending.body');

  return (
    <YStack gap={space.sm}>
      <Callout
        tone={notice.tone}
        title={t(`verification.${notice.key}.title` as 'verification.pending.title')}
      >
        {extra ? `${body}\n${extra}` : body}
      </Callout>

      {/*
        Nút CHỈ khi có thứ để gửi và người xem được gửi. Luôn là "gửi LẠI": nhánh `unverified` đã
        trả `null` ở trên, nên ba trạng thái tới được đây đều đã có một phiếu trước đó — một nhánh
        chữ "Gửi xác minh" ở đây là nhánh chết.
      */}
      {notice.canSubmit && canSubmit ? (
        <Button
          label={t('verification.resubmit')}
          icon="send-outline"
          loading={submitting}
          onPress={onSubmit}
        />
      ) : null}
    </YStack>
  );
}
