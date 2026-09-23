import { getTranslations } from 'next-intl/server';
import { LEGAL_EFFECTIVE_FROM, LEGAL_SECTIONS, legalPath, type LegalDoc } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { InfoNote } from '@/features/content-page/components/InfoNote';
import { PageHero } from '@/features/content-page/components/PageHero';
import { getAppFormat } from '@/i18n/server-format';
import { LegalDocPager } from './LegalDocPager';
import { LegalDocSwitcher } from './LegalDocSwitcher';
import { LegalTableOfContents } from './LegalTableOfContents';
import styles from './LegalDocumentView.module.css';

/**
 * Một văn bản pháp lý công khai.
 *
 * ── Bố cục ──────────────────────────────────────────────────────────────────
 *
 *     ┌──────────── PageHero: breadcrumb · tên văn bản · tóm tắt · ngày ─────┐
 *     ├──────────────────────────────┬───────────────────────────────────────┤
 *     │  VĂN BẢN (cột 68 ký tự)      │  CỘT BÊN (dính)                       │
 *     │  băng bản thảo               │  · bộ chuyển 4 văn bản                │
 *     │  từng mục, có neo chia sẻ    │  · mục lục theo dõi mục đang đọc      │
 *     └──────────────────────────────┴───────────────────────────────────────┘
 *
 * **Server Component có chủ đích.** Văn bản pháp lý rồi sẽ phải index được (người dùng và cơ
 * quan quản lý đều tìm tới nó qua tìm kiếm), và thân văn bản không có state nào — đẩy sang
 * client chỉ tốn JS mà không đổi được gì. Đúng MỘT thứ cần JavaScript là việc biết người đọc
 * đang ở mục nào, và đó là client island riêng (`LegalTableOfContents`). Chừng nào còn là bản
 * thảo thì route vẫn đặt `robots: noindex`; bỏ cờ đó cùng lúc với băng "bản thảo".
 *
 * **Cột bên đứng SAU văn bản trong DOM.** Người dùng bàn phím và trình đọc màn hình gặp nội
 * dung trước, công cụ điều hướng sau — trên desktop CSS `order` đẩy nó sang cột phải. Dưới
 * 1024px, bộ chuyển văn bản nổi lên trên (một dải tab ngang) còn mục lục thu thành khối gập/mở.
 *
 * Nội dung sống ở bó message (`Legal.docs.<doc>`), thứ tự mục sống ở `LEGAL_SECTIONS`. Xem
 * docblock của `constants/legal.ts` về vì sao tách làm hai.
 */
export async function LegalDocumentView({ doc }: { doc: LegalDoc }) {
  const t = await getTranslations('Legal');
  const tNav = await getTranslations('Navigation.public');
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

  const sections = LEGAL_SECTIONS[doc]
    .filter((s) => has(`docs.${doc}.sections.${s.key}.heading`))
    .map((s) => ({
      key: s.key,
      id: sectionId(doc, s.key),
      heading: text(`docs.${doc}.sections.${s.key}.heading`),
      body: text(`docs.${doc}.sections.${s.key}.body`),
      /*
       * Gạch đầu dòng của một điều. Thứ tự khai ở `LEGAL_SECTIONS` (code), nội dung ở bundle —
       * lý do tách làm hai nằm ở docblock `LegalSection`.
       *
       * `has()` lọc như với `heading`: một khoản có tên trong code mà thiếu bản dịch thì BỎ QUA
       * chứ không làm trắng cả trang điều khoản.
       */
      items: (s.items ?? [])
        .filter((item) => has(`docs.${doc}.sections.${s.key}.items.${item}`))
        .map((item) => ({
          key: item,
          text: text(`docs.${doc}.sections.${s.key}.items.${item}`),
        })),
    }));

  /* Đơn vị vận hành là một mục như mọi mục khác — nó cũng phải có trong mục lục và neo được. */
  const entityId = `${doc}-entity`;
  const tocItems = [
    ...sections.map(({ id, heading }) => ({ id, label: heading })),
    { id: entityId, label: t('entity.heading') },
  ];

  const anchorLabel = t('meta.anchorLabel');

  /*
   * `data-print-root` bật quy tắc in dùng chung ở `styles/globals.css`: header, chân trang và
   * thanh tab bị ẩn, chỉ còn văn bản. `meta.printHint` đang mời người đọc in trang này, nên
   * việc đó phải ra được một tờ giấy đọc được chứ không phải ảnh chụp giao diện.
   */
  return (
    <div data-print-root>
      <PageHero
        breadcrumb={[
          { label: tNav('home'), href: ROUTES.HOME },
          { label: t('index.title'), href: legalPath.index },
          { label: text(`docs.${doc}.title`) },
        ]}
        eyebrow={t('meta.eyebrow')}
        title={text(`docs.${doc}.title`)}
        lead={text(`docs.${doc}.summary`)}
        meta={t('meta.effectiveFrom', { date: fmt.dateKey(LEGAL_EFFECTIVE_FROM) })}
      />

      <div className={styles.layout}>
        <article className={styles.doc}>
          {/*
            Băng "bản thảo" là cửa chặn cuối cùng trước khi một văn bản chưa qua luật sư lọt ra
            ngoài. Gỡ nó là một hành động có chủ đích, không phải thứ quên mất. Nó CÓ mặt trong
            bản in: một tờ giấy không mang cảnh báo đó là một tờ giấy trông như đã có hiệu lực.
          */}
          <InfoNote tone="warning" title={t('draftBanner.title')} className={styles.draft}>
            <p>{t('draftBanner.body')}</p>
          </InfoNote>

          <div className={styles.body}>
            {sections.map((section) => (
              <section key={section.key} id={section.id} className={styles.section}>
                <h2 className={styles.heading}>
                  {section.heading}
                  {/*
                    Neo chia sẻ: hiện khi rê chuột hoặc khi tới bằng bàn phím. Người ta trích
                    dẫn một ĐIỀU cụ thể của điều khoản, không trích cả văn bản — không có nó
                    thì cách duy nhất là bảo nhau "kéo xuống mục 7".
                  */}
                  <a href={`#${section.id}`} className={styles.anchor} aria-label={anchorLabel}>
                    #
                  </a>
                </h2>
                <p className={styles.paragraph}>{section.body}</p>
                {section.items.length > 0 && (
                  <ul className={styles.itemList}>
                    {section.items.map((item) => (
                      <li key={item.key} className={styles.item}>
                        {item.text}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <section id={entityId} className={styles.section}>
              <h2 className={styles.heading}>
                {t('entity.heading')}
                <a href={`#${entityId}`} className={styles.anchor} aria-label={anchorLabel}>
                  #
                </a>
              </h2>
              <p className={styles.paragraph}>{t('entity.body')}</p>
            </section>
          </div>

          {/*
            Cặp trước/sau THAY cho dải bốn liên kết bằng nhau: bốn văn bản là một bộ đọc theo
            thứ tự, và người vừa đọc xong một bản thường muốn đọc bản kế. Lý do đầy đủ ở
            docblock `LegalDocPager`.
          */}
          <LegalDocPager current={doc} />

          <footer className={styles.footer}>
            <p className={styles.printHint}>{t('meta.printHint')}</p>
          </footer>
        </article>

        <aside className={styles.side}>
          <LegalDocSwitcher current={doc} label={t('meta.docNav')} />
          <LegalTableOfContents title={t('meta.toc')} items={tocItems} />
        </aside>
      </div>
    </div>
  );
}

/** Neo của một mục — mang cả tên văn bản để link dán ra ngoài không mơ hồ giữa hai văn bản. */
function sectionId(doc: LegalDoc, section: string): string {
  return `${doc}-${section}`;
}
