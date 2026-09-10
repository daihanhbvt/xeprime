'use client';

import { FilePdfOutlined, RightOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';

import { ownerResourceHref, type OwnerResource } from '@/constants/owner-resources';

import styles from './ResourceList.module.css';

interface ResourceListProps {
  resources: readonly OwnerResource[];
  /** `card` = hàng có mô tả (cẩm nang); `compact` = một dòng tên + mũi tên (chứng từ). */
  variant?: 'card' | 'compact';
}

/**
 * Danh sách tài liệu PDF từ manifest `OWNER_RESOURCES` — dùng chung cho Cẩm nang và Hợp đồng &
 * Chứng từ. Link mở tab mới với `rel="noopener noreferrer"`; tên file và nhãn đều đến từ manifest
 * + bó message, không màn nào ghép đường dẫn tay.
 *
 * Không `'use client'`: chỉ có link, dùng được từ Server Component.
 */
export function ResourceList({ resources, variant = 'card' }: ResourceListProps) {
  const t = useTranslations('Account.resources');

  return (
    <ul className={variant === 'card' ? styles.cards : styles.compact}>
      {resources.map((resource) => {
        const title = t(`items.${resource.key}.title`);
        return (
          <li key={resource.key}>
            <a
              href={ownerResourceHref(resource)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
              aria-label={t('open', { title })}
            >
              <span className={styles.icon} aria-hidden="true">
                <FilePdfOutlined />
              </span>
              <span className={styles.text}>
                <span className={styles.title}>{title}</span>
                {variant === 'card' ? (
                  <span className={styles.description}>
                    {t(`items.${resource.key}.description`)}
                  </span>
                ) : null}
              </span>
              <RightOutlined className={styles.chevron} aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
