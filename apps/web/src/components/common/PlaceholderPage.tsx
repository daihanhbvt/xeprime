'use client';

import { Empty } from 'antd';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import styles from './PlaceholderPage.module.css';
import { useTranslations } from 'next-intl';

/**
 * Trang tối giản cho các mục menu đã có nhưng chức năng chưa dựng (theo lộ trình 9 phase).
 * Giữ menu "đầy đủ như bản cũ": vẫn có tiêu đề trang như các trang thật, phần thân để rỗng —
 * người dùng thấy trang mở ra nhưng chưa có nội dung, không giả vờ đã chạy.
 */
export function PlaceholderPage({ title }: { title: string }) {
  const tCommon = useTranslations('Common');
  return (
    <div>
      <ManagePageHeader title={title} />
      <div className={styles.body}>
        <Empty description={tCommon('states.empty')} />
      </div>
    </div>
  );
}
