'use client';

import { CheckCircleFilled, CloseCircleOutlined } from '@ant-design/icons';
import { Alert, Card, Collapse } from 'antd';
import { useTranslations } from 'next-intl';
import { VEHICLE_PUBLIC_STATUS, type VehiclePublicStatus } from '@xeprime/types';
import { decorativeIcon } from '@/lib/decorative-icon';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePublicationLabels } from '../hooks/use-publication-labels';
import { publishChecklist } from '../publication';
import type { VehicleDetail } from '../types';
import styles from './VehiclePublicReviewPanel.module.css';

/** Neo để CTA "Xem trạng thái" ở thẻ Việc cần làm cuộn xuống đúng thẻ này. */
export const REVIEW_PANEL_ANCHOR = 'vehicle-review-panel';

/**
 * HỒ SƠ XÉT DUYỆT của một chiếc xe — thẻ tham chiếu, không phải nơi hành động (23/09/2026).
 *
 * ## Nó vừa mất hai thứ, và đó là điểm chính
 *
 * Trước đây thẻ này giữ cả nút "Gửi duyệt công khai" lẫn công tắc hiển thị, ở gần cuối một
 * trang dài. Hai hành động quan trọng nhất của một chiếc xe nằm ở chỗ phải cuộn mới thấy, trong
 * khi thẻ "Việc cần làm" ngay đầu trang có thể đang nói "Không có việc cần làm".
 *
 * Giờ: công tắc lên cột thao tác đầu trang (`MarketplaceVisibilitySwitch`), nút gửi duyệt vào
 * thẻ Việc cần làm (`VehiclePublicationTaskItem`). Thẻ này còn lại phần **tra cứu**: tình trạng
 * hồ sơ, checklist đánh dấu từng mục, mốc gửi và mốc duyệt. Không lặp lại CTA nào ở trên —
 * hai nút cho cùng một việc là hai chỗ để lệch nhau.
 *
 * ## Vì sao vẫn giữ checklist
 *
 * Thẻ Việc cần làm chỉ nêu vài mục còn thiếu rồi đẩy phần còn lại vào dấu "i" — nó phải ngắn vì
 * đứng cạnh việc bảo dưỡng và giấy tờ. Chủ xe muốn xem mình còn cách bao xa thì cần bản đầy đủ
 * có đánh dấu đạt/chưa đạt, và đây là chỗ của nó.
 *
 * Xe ĐÃ DUYỆT thì thẻ tự thu gọn: hồ sơ xét duyệt lúc đó là lịch sử, không phải việc đang làm.
 */
export function VehiclePublicReviewPanel({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.publish.panel');
  const fmt = useAppFormat();
  const { requirement, statusCopy } = usePublicationLabels();

  const status = vehicle.publicStatus as VehiclePublicStatus;
  const approved = status === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  const presentation = statusCopy(status, vehicle.latestPublicReview?.reason);
  // Checklist chỉ gồm điều kiện ÁP DỤNG với xe này — giá kiểm theo dịch vụ xe đăng (17/08).
  const checklist = publishChecklist(vehicle).map((item) => ({
    ...item,
    label: requirement(item.key),
  }));
  const review = vehicle.latestPublicReview;

  const body = (
    <>
      <Alert
        type={presentation.type}
        showIcon
        title={presentation.message}
        description={presentation.description}
      />

      <ul className={styles.checklist}>
        {checklist.map((item) => (
          <li key={item.key} className={item.met ? styles.met : styles.unmet}>
            {item.met ? decorativeIcon(<CheckCircleFilled />) : decorativeIcon(<CloseCircleOutlined />)}
            <span>{item.label}</span>
            {/* Chữ mang nghĩa, không phải icon — icon là trang trí nên trình đọc bỏ qua. */}
            <span className={styles.state}>{item.met ? t('met') : t('unmet')}</span>
          </li>
        ))}
      </ul>

      {/* Mốc gửi/duyệt — xe chưa từng gửi thì không có gì để kể, và một dòng "—" không nói gì. */}
      {review ? (
        <dl className={styles.timeline}>
          <dt>{t('submittedAt')}</dt>
          <dd>{fmt.dateTime(review.submittedAt)}</dd>
          {review.reviewedAt ? (
            <>
              <dt>{t('reviewedAt')}</dt>
              <dd>{fmt.dateTime(review.reviewedAt)}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </>
  );

  /*
   * Xe đã duyệt: thu gọn mặc định. `Collapse` chứ không một nút tự dựng — nó đã lo `aria-expanded`,
   * `aria-controls` và điều hướng bàn phím, ba thứ mà một `<div onClick>` không bao giờ có.
   */
  if (approved) {
    return (
      <Card id={REVIEW_PANEL_ANCHOR} className={styles.panel} styles={{ body: { padding: 0 } }}>
        <Collapse
          ghost
          items={[{ key: 'review', label: t('titleApproved'), children: body }]}
        />
      </Card>
    );
  }

  return (
    <Card id={REVIEW_PANEL_ANCHOR} title={t('title')} className={styles.panel}>
      {body}
    </Card>
  );
}
