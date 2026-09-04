import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  LEGAL_EFFECTIVE_FROM,
  LEGAL_SECTIONS,
  legalPath,
  type LegalDoc,
} from '@/constants/legal';
import { getAppFormat } from '@/i18n/server-format';
import { LegalDocLinks } from './LegalDocLinks';
import styles from './LegalDocumentView.module.css';

/**
 * Một văn bản pháp lý công khai.
 *
 * **Server Component có chủ đích.** Văn bản pháp lý rồi sẽ phải index được (người dùng và cơ
 * quan quản lý đều tìm tới nó qua tìm kiếm), và nó không có state nào — đẩy sang client chỉ tốn
 * JS mà không đổi được gì. Chừng nào còn là bản thảo thì route vẫn đặt `robots: noindex`; bỏ
 * cờ đó cùng lúc với băng "bản thảo" bên dưới.
 *
 * Nội dung sống ở bó message (`Legal.docs.<doc>`), thứ tự mục sống ở `LEGAL_SECTIONS`. Xem
 * docblock của `constants/legal.ts` về vì sao tách làm hai.
 */
export async function LegalDocumentView({ doc }: { doc: LegalDoc }) {
  const t = await getTranslations('Legal');
  const fmt = await getAppFormat();

  /*
   * Khoá được ghép lúc chạy từ `doc` + tên mục, nên TypeScript không tra được nó trong bó
   * message — cùng tình huống và cùng cách xử lý với `createDomainLabel` (`i18n/domain.ts`):
   * ép kiểu MỘT chỗ, và `t.has()` gánh phần an toàn thật.
   *
   * `t.has()` không phải để phòng thủ suông: một mục có tên trong `LEGAL_SECTIONS` mà thiếu
   * bản dịch sẽ bị BỎ QUA thay vì ném lỗi làm trắng cả trang điều khoản.
   */
  const has = (key: string) => t.has(key as never);
  const text = (key: string) => t(key as never) as string;

  const sections = LEGAL_SECTIONS[doc].filter((s) => has(`docs.${doc}.sections.${s}.heading`));

  return (
    <article className={styles.page}>
      {/*
        Băng "bản thảo" là cửa chặn cuối cùng trước khi một văn bản chưa qua luật sư lọt ra
        ngoài. Gỡ nó là một hành động có chủ đích, không phải thứ quên mất.
      */}
      <aside className={styles.draft} role="note">
        <strong className={styles.draftTitle}>{t('draftBanner.title')}</strong>
        <p className={styles.draftBody}>{t('draftBanner.body')}</p>
      </aside>

      {/* Đường lên trên: một văn bản không bao giờ là ngõ cụt — từ đây luôn thấy được cả bộ. */}
      <Link href={legalPath.index} className={styles.upLink}>
        ← {t('meta.allDocs')}
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>{text(`docs.${doc}.title`)}</h1>
        <p className={styles.summary}>{text(`docs.${doc}.summary`)}</p>
        <p className={styles.effective}>
          {t('meta.effectiveFrom', { date: fmt.dateKey(LEGAL_EFFECTIVE_FROM) })}
        </p>
      </header>

      <nav className={styles.toc} aria-label={t('meta.toc')}>
        <h2 className={styles.tocTitle}>{t('meta.toc')}</h2>
        <ol className={styles.tocList}>
          {sections.map((s) => (
            <li key={s}>
              <a href={`#${sectionId(doc, s)}`} className={styles.tocLink}>
                {text(`docs.${doc}.sections.${s}.heading`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className={styles.body}>
        {sections.map((s) => (
          <section key={s} id={sectionId(doc, s)} className={styles.section}>
            <h2 className={styles.heading}>{text(`docs.${doc}.sections.${s}.heading`)}</h2>
            <p className={styles.paragraph}>{text(`docs.${doc}.sections.${s}.body`)}</p>
          </section>
        ))}

        <section className={styles.section}>
          <h2 className={styles.heading}>{t('entity.heading')}</h2>
          <p className={styles.paragraph}>{t('entity.body')}</p>
        </section>
      </div>

      <footer className={styles.footer}>
        <p className={styles.printHint}>{t('meta.printHint')}</p>
        <h2 className={styles.relatedTitle}>{t('meta.related')}</h2>
        <LegalDocLinks exclude={doc} />
      </footer>
    </article>
  );
}

/** Neo của một mục — mang cả tên văn bản để link dán ra ngoài không mơ hồ giữa hai văn bản. */
function sectionId(doc: LegalDoc, section: string): string {
  return `${doc}-${section}`;
}
