'use client';

import { BgColorsOutlined, TagOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './ListingDescription.module.css';

interface ListingDescriptionProps {
  title: string;
  description: string | null;
  emptyText: string;
  /**
   * Hãng · màu ngay dưới tiêu đề — chỉ bản mobile vẽ hàng này (Figma `19771:72580`); PC đã có
   * thông số ở hàng icon phía trên. Thuộc tính chưa khai thì nơi gọi bỏ khỏi danh sách.
   */
  attributes?: readonly ListingAttribute[];
  className?: string;
}

export interface ListingAttribute {
  key: 'brand' | 'color';
  value: string;
}

const ATTRIBUTE_ICON: Record<ListingAttribute['key'], ReactNode> = {
  brand: <TagOutlined aria-hidden="true" />,
  color: <BgColorsOutlined aria-hidden="true" />,
};

/**
 * Khối Mô tả xe theo chuẩn Figma v2:
 * - Nội dung ngắn (<= 3 dòng): hiển thị đầy đủ, KHÔNG hiện nút "Xem tiếp".
 * - Nội dung dài (> 3 dòng): cắt dòng bằng line-clamp 3 (...) và hiển thị nút "Xem tiếp ∨".
 * - Bấm "Xem tiếp": mở sổ xuống toàn bộ nội dung và đổi nút thành "Thu gọn ∧".
 */
export function ListingDescription({
  title,
  description,
  emptyText,
  attributes,
  className,
}: ListingDescriptionProps) {
  const t = useTranslations('Listings.detail');
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const content = description || emptyText;

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    // Kiểm tra xem nội dung có bị tràn quá 3 dòng không
    const checkOverflow = () => {
      // scrollHeight lớn hơn clientHeight chứng tỏ bị clamp quá 3 dòng
      if (el.scrollHeight > el.clientHeight + 2) {
        setCanExpand(true);
      } else {
        setCanExpand(false);
      }
    };

    checkOverflow();

    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [content]);

  return (
    <section
      id="description"
      className={cx(styles.sectionCard, className)}
      aria-labelledby="desc-heading"
    >
      <h2 id="desc-heading" className={styles.sectionTitle}>
        {title}
      </h2>
      {attributes && attributes.length > 0 ? (
        <ul className={styles.attributes}>
          {attributes.map((attr) => (
            <li key={attr.key} className={styles.attribute}>
              <span className={styles.attributeIcon}>{ATTRIBUTE_ICON[attr.key]}</span>
              <span>
                {t.rich(`attributes.${attr.key}`, {
                  value: attr.value,
                  strong: (chunks) => <strong className={styles.attributeValue}>{chunks}</strong>,
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p ref={textRef} className={`${styles.descBody} ${!isExpanded ? styles.descClamped : ''}`}>
        {content}
      </p>

      {canExpand && (
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
        >
          <span>{isExpanded ? t('descriptionToggle.less') : t('descriptionToggle.more')}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${styles.icon} ${isExpanded ? styles.iconRotate : ''}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </section>
  );
}
