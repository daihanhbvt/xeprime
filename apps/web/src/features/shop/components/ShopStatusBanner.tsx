'use client';

import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { TENANT_STATUS, type TenantStatus } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { shopStatusNotice, shopVerificationNotice } from '../status-notice';
import type { MyShop } from '../types';
import styles from './ShopStatusBanner.module.css';

interface ShopStatusBannerProps {
  shop: MyShop;
  /** Quyền `tenant.submit_review`. Nút gửi xác minh là hành động ĐỔI TRẠNG THÁI, không phải "lưu". */
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}

/**
 * Một dải trạng thái duy nhất thay cho thẻ "trạng thái + nhãn + alert" cũ.
 *
 * Nhãn trạng thái đã nằm cạnh tên gian hàng ở tiêu đề trang, nên lặp lại nó ở đây chỉ tốn chỗ.
 * Thứ dải này phải nói là điều người dùng chưa biết: hồ sơ đang ở đâu, lý do bị trả về, và bước
 * tiếp theo bấm vào đâu.
 *
 * ## Hai trục, và trục nào thắng (ADR 0036)
 *
 * Gian hàng bị KHOÁ hoặc hết hạn là tin quan trọng hơn mọi thứ khác — xe đang biến mất khỏi chợ
 * ngay lúc này — nên `tenants.status` được nói trước. Khi gian hàng đang hoạt động bình thường
 * (trường hợp của gần như tất cả mọi người), dải chuyển sang trục XÁC MINH.
 *
 * Điều dải này tuyệt đối KHÔNG được nói nữa, và đã bỏ cả hai câu:
 *
 *  - *"xe chỉ lên chợ sau khi hồ sơ được duyệt"* — đúng trước ADR 0036, sai sau nó: tuyến hoa
 *    hồng đăng xe thẳng qua cổng duyệt XE.
 *  - *"xác minh để mua được gói"* — đúng trước ADR 0040, sai sau nó: thanh toán mở tuyến gói và
 *    không chờ ai gật đầu.
 *
 * ## Không có việc gì để làm ⇒ KHÔNG dựng gì
 *
 * Ba trạng thái im lặng, cùng một lý do — dải này chỉ nói khi có BLOCKER hoặc có HÀNH ĐỘNG:
 *
 *  - `active` + `verified`: nhãn trạng thái cạnh tên gian hàng đã mang thông tin đó, và một dải
 *    xanh "mọi thứ đều ổn" đứng thường trực chỉ dạy người dùng bỏ qua vùng ấy.
 *  - `unverified` (16/09/2026 — ADR 0040): không còn gì để mời họ làm. Bản trước dựng một dải
 *    kèm nút "Gửi xác minh" đổi lấy quyền mua gói; quyền đó nay có sẵn, còn cái nút thì vẫn khoá
 *    hồ sơ khỏi việc sửa suốt thời gian chờ. Xem `VERIFICATION_NOTICE` ở `status-notice.ts`.
 *
 * Trước đó, khi không có gì để gửi, dải cũ còn rơi về nút "Thêm xe" — một hành động chẳng liên
 * quan gì tới chủ đề của nó, đặt đúng chỗ mà người dùng vừa học được là "nút ở đây giải quyết
 * tình trạng ở đây".
 */
export function ShopStatusBanner({ shop, canSubmit, submitting, onSubmit }: ShopStatusBannerProps) {
  const t = useTranslations('Shop');
  const fmt = useAppFormat();

  const status = shop.status as TenantStatus;
  const approval = shop.latestApproval;

  /*
   * Gian hàng không ở trạng thái vận hành bình thường: nói CHUYỆN ĐÓ. Nhánh này còn bắt cả dữ
   * liệu cũ (`draft`/`pending_review` chưa qua backfill) — với chúng, câu chữ theo trạng thái vẫn
   * là câu đúng.
   */
  if (status !== TENANT_STATUS.ACTIVE) {
    const notice = shopStatusNotice(shop.status);
    return (
      <Alert
        className={styles.banner}
        type={notice.tone}
        showIcon
        title={t(`status.${notice.key}.title`)}
        description={t(`status.${notice.key}.body`)}
      />
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

  /**
   * Phần mô tả ghép từ hai nguồn: câu hướng dẫn cố định của trạng thái, cộng thêm thông tin CHỈ
   * lần gửi này mới có — thời điểm đã gửi, hoặc nguyên văn lý do đội duyệt viết. Lý do là thứ
   * quan trọng nhất trên màn hình khi hồ sơ bị trả về, nên nó không bao giờ bị nuốt mất.
   */
  const extra =
    notice.key === 'pending' && approval
      ? t('verification.pending.submittedAt', { at: fmt.dateTime(approval.submittedAt) })
      : notice.useReason && approval?.reason
        ? t('status.reason', { reason: approval.reason })
        : null;

  return (
    <Alert
      className={styles.banner}
      type={notice.tone}
      showIcon
      title={t(`verification.${notice.key}.title`)}
      description={
        <>
          <span>{t(`verification.${notice.key}.body`)}</span>
          {extra ? <span className={styles.extra}>{extra}</span> : null}
        </>
      }
      /*
       * Nút CHỈ khi có thứ để gửi và người xem được gửi. Không có thì dải chỉ còn là thông tin —
       * và một nút thay thế dẫn đi nơi khác ("Thêm xe") là nút nói dối về việc nó giải quyết
       * tình trạng đang được nói tới.
       */
      action={
        /*
         * Luôn là "gửi LẠI": nhánh `unverified` đã trả `null` ở trên, nên ba trạng thái tới được
         * đây đều đã có một phiếu trước đó. Một nhánh chữ "Gửi xác minh" ở đây là nhánh chết.
         */
        notice.canSubmit && canSubmit ? (
          <Button type="primary" loading={submitting} onClick={onSubmit}>
            {t('verification.resubmit')}
          </Button>
        ) : undefined
      }
    />
  );
}
