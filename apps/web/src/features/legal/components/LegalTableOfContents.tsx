'use client';

import { useEffect, useState } from 'react';
import styles from './LegalTableOfContents.module.css';

export interface LegalTocItem {
  readonly id: string;
  readonly label: string;
}

export interface LegalTableOfContentsProps {
  readonly title: string;
  readonly items: readonly LegalTocItem[];
}

/**
 * Mục lục của một văn bản pháp lý, có theo dõi mục ĐANG ĐỌC.
 *
 * **Vì sao đây là client island nhỏ chứ không phải cả trang.** `LegalDocumentView` cố ý ở lại
 * phía server (văn bản pháp lý cần index được, và nó không có state nào). Chỉ riêng việc biết
 * "người đọc đang ở mục nào" là cần JavaScript, nên đúng phần đó — và chỉ phần đó — chạy ở
 * client. Thân văn bản vẫn nằm nguyên trong HTML tĩnh.
 *
 * **Vì sao `IntersectionObserver` chứ không phải nghe sự kiện `scroll`.** Một handler `scroll`
 * chạy vài chục lần mỗi giây và phải tự đo vị trí từng mục bằng `getBoundingClientRect` — trên
 * bản điều khoản 14 mục đó là 14 lần đo mỗi lần cuộn, đủ để giật trên máy yếu. Observer để
 * trình duyệt làm việc đó ngoài luồng chính và chỉ gọi lại khi một mục thật sự vào/ra khung
 * nhìn.
 *
 * `rootMargin` cắt phần trên bằng chiều cao header dính và giữ lại một dải hẹp gần đỉnh khung
 * nhìn: mục được tô sáng là mục đang ở ĐẦU màn hình, không phải mục chiếm nhiều diện tích nhất.
 *
 * Trước khi JS chạy (và ở những nơi không có JS), mục lục vẫn là một danh sách liên kết neo
 * hoạt động đầy đủ — chỉ không có phần tô sáng.
 */
export function LegalTableOfContents({ title, items }: LegalTableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el != null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        /*
         * Nhiều mục có thể cùng cắt dải quan sát. Lấy mục NẰM TRÊN CÙNG trong số đang giao
         * nhau — đó là mục người đọc vừa cuộn tới. Không có mục nào giao nhau (đang ở khoảng
         * trống giữa hai lần chạy) thì giữ nguyên giá trị cũ thay vì nhấp nháy về `null`.
         */
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) setActiveId(first.target.id);
      },
      {
        // Dải quan sát: từ ngay dưới header dính xuống 60% chiều cao khung nhìn.
        rootMargin: '-72px 0px -40% 0px',
        threshold: 0,
      },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [items]);

  return (
    <details className={styles.toc}>
      <summary className={styles.title}>
        {title}
        <span className={styles.caret} aria-hidden="true" />
      </summary>
      <nav aria-label={title}>
        <ol className={styles.list}>
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={active ? `${styles.link} ${styles.linkActive}` : styles.link}
                  /* `aria-current` để trình đọc màn hình biết mục nào đang đọc, không chỉ mắt. */
                  aria-current={active ? 'location' : undefined}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </details>
  );
}
