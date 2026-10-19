'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './ListingDescription.module.css';

interface ListingDescriptionProps {
  title: string;
  description: string | null;
  emptyText: string;
}

/**
 * Khối Mô tả xe theo chuẩn Figma v2:
 * - Nội dung ngắn (<= 3 dòng): hiển thị đầy đủ, KHÔNG hiện nút "Xem tiếp".
 * - Nội dung dài (> 3 dòng): cắt dòng bằng line-clamp 3 (...) và hiển thị nút "Xem tiếp ∨".
 * - Bấm "Xem tiếp": mở sổ xuống toàn bộ nội dung và đổi nút thành "Thu gọn ∧".
 */
export function ListingDescription({ title, description, emptyText }: ListingDescriptionProps) {
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
    <section id="description" className={styles.sectionCard} aria-labelledby="desc-heading">
      <h2 id="desc-heading" className={styles.sectionTitle}>
        {title}
      </h2>
      <p
        ref={textRef}
        className={`${styles.descBody} ${!isExpanded ? styles.descClamped : ''}`}
      >
        {content}
      </p>

      {canExpand && (
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
        >
          <span>{isExpanded ? 'Thu gọn' : 'Xem tiếp'}</span>
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

