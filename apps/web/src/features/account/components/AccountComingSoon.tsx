'use client';

import { Card, Tag } from 'antd';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useTranslations } from 'next-intl';

import type { AccountNavLabelKey } from '@/constants/account-nav';

import styles from './AccountComingSoon.module.css';

/**
 * Thân trang cho mục ĐÃ có chỗ trong menu nhưng chưa dựng (A1 — khung đi trước nội dung).
 *
 * Chủ dự án chốt "chưa làm thì để sẵn menu": người dùng nhìn thấy trước bản đồ đầy đủ thay vì
 * một menu mọc dần. Nhưng trang phải nói thật là chưa có gì — không dựng dữ liệu giả, không
 * hiện bảng rỗng trông như "bạn chưa có bản ghi nào".
 *
 * Menu không tạo link tới đây (`comingSoon` render thành `<span>`), nên trang này chỉ gặp khi
 * gõ thẳng URL — vẫn phải tử tế.
 */
export function AccountComingSoon({ labelKey }: { labelKey: AccountNavLabelKey }) {
  const t = useTranslations('Account.comingSoon');
  const tNav = useTranslations('Navigation.account');

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>{tNav(labelKey)}</h2>
        <Tag variant="filled">{t('badge')}</Tag>
      </div>
      <EmptyState variant="coming-soon" title={t('title')} description={t('body')} />
    </Card>
  );
}
