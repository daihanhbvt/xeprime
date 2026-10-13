'use client';

import { ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import { useUnpaidHolds } from '../hooks';
import { UnpaidHoldList } from './UnpaidHoldList';
import styles from './UnpaidHoldsReminder.module.css';

/**
 * THẺ NHẮC THANH TOÁN ở đầu "Chuyến của tôi" — chỉ hiện khi khách đang giữ chuyến chưa trả.
 *
 * Hai giọng, cùng một thẻ:
 *  - còn dưới trần: nhắc nhẹ (viền màu thương hiệu) — trả trước khi hết giờ để giữ xe;
 *  - đã chạm trần (\`HOLD_MAX_OPEN_PER_CUSTOMER\`): cảnh báo — không đặt thêm xe được tới khi trả hoặc
 *    huỷ bớt. Câu này phải nằm ở đây, không chỉ ở hộp thoại đặt xe: khách bị chặn sẽ tìm tới "Chuyến
 *    của tôi" để hiểu vì sao.
 *
 * Đứng TRÊN tab, không phải một tab: chuyến chưa trả là việc phải làm NGAY, với một đồng hồ đang
 * chạy, chứ không phải một nhóm để duyệt khi rảnh. Tải hỏng hoặc đang tải thì im lặng — danh sách
 * chuyến ngay dưới vẫn có đủ từng chuyến, thẻ này chỉ là lối tắt.
 */
export function UnpaidHoldsReminder() {
  const t = useTranslations('Trips.unpaid');
  const unpaid = useUnpaidHolds();
  const data = unpaid.data;
  if (!data || data.items.length === 0) return null;

  const atLimit = data.limitReached;

  return (
    <section
      className={cx(styles.card, atLimit && styles.cardLimit)}
      aria-labelledby="xp-unpaid-holds-title"
    >
      <header className={styles.head}>
        <span className={cx(styles.icon, atLimit && styles.iconLimit)} aria-hidden>
          {atLimit ? <ExclamationCircleOutlined /> : <ClockCircleOutlined />}
        </span>
        <div className={styles.headText}>
          <h2 id="xp-unpaid-holds-title" className={styles.title}>
            {atLimit
              ? t('limitTitle', { limit: data.limit })
              : t('reminderTitle', { count: data.items.length })}
          </h2>
          <p className={styles.body}>
            {atLimit ? t('limitBody', { limit: data.limit }) : t('reminderBody')}
          </p>
        </div>
      </header>
      <UnpaidHoldList items={data.items} />
    </section>
  );
}
