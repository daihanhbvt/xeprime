import { getTranslations } from 'next-intl/server';
import { isCustomerAppWebView } from '@/lib/in-app-webview';
import { LEGAL_EFFECTIVE_FROM, legalDocsFor, legalPath, type LegalDoc } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { PageHero } from '@/features/content-page/components/PageHero';
import { getAppFormat } from '@/i18n/server-format';
import { buildLegalDocView, legalSectionId } from '../legal-doc-model';
import { LegalDocBody } from './LegalDocBody';
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
 *     │  từng mục, có neo chia sẻ    │  · bộ chuyển văn bản                  │
 *     │  bảng (ma trận huỷ…)         │  · mục lục theo dõi mục đang đọc      │
 *     └──────────────────────────────┴───────────────────────────────────────┘
 *
 * **Server Component có chủ đích.** Văn bản pháp lý rồi sẽ phải index được (người dùng và cơ
 * quan quản lý đều tìm tới nó qua tìm kiếm), và thân văn bản không có state nào. Đúng MỘT thứ
 * cần JavaScript là việc biết người đọc đang ở mục nào — client island `LegalTableOfContents`.
 * Chừng nào luật sư chưa duyệt thì route vẫn đặt `robots: noindex`.
 *
 * Thân văn bản (`LegalDocBody`) và phép ghép khoá (`buildLegalDocView`) dùng chung với hộp xem
 * nhanh trong luồng đặt xe (`LegalDocDialog`).
 *
 * **Cột bên đứng SAU văn bản trong DOM.** Người dùng bàn phím và trình đọc màn hình gặp nội
 * dung trước, công cụ điều hướng sau. Dưới 1024px bộ chuyển văn bản nổi lên trên.
 */
export async function LegalDocumentView({ doc }: { doc: LegalDoc }) {
  const t = await getTranslations('Legal');
  const tNav = await getTranslations('Navigation.public');
  const fmt = await getAppFormat();
  const inApp = await isCustomerAppWebView();

  /*
   * Khoá được ghép lúc chạy từ `doc` + tên mục, nên TypeScript không tra được nó trong bó
   * message — ép kiểu MỘT chỗ, và `t.has()` gánh phần an toàn thật.
   */
  const view = buildLegalDocView(
    { text: (key) => t(key as never) as string, has: (key) => t.has(key as never) },
    doc,
    { inApp },
  );
  const docs = legalDocsFor({ inCustomerApp: inApp });

  const entity = {
    id: legalSectionId(doc, 'entity'),
    heading: t('entity.heading'),
    body: t('entity.body'),
  };
  const tocItems = [
    ...view.sections.map(({ id, heading }) => ({ id, label: heading })),
    { id: entity.id, label: entity.heading },
  ];

  /*
   * `data-print-root` bật quy tắc in dùng chung ở `styles/globals.css`: header, chân trang và
   * thanh tab bị ẩn, chỉ còn văn bản.
   */
  return (
    <div data-print-root>
      <PageHero
        breadcrumb={[
          { label: tNav('home'), href: ROUTES.HOME },
          { label: t('index.title'), href: legalPath.index },
          { label: view.title },
        ]}
        eyebrow={t('meta.eyebrow')}
        title={view.title}
        lead={view.summary}
        meta={t('meta.effectiveFrom', { date: fmt.dateKey(LEGAL_EFFECTIVE_FROM) })}
      />

      <div className={styles.layout}>
        <article className={styles.doc}>
          <LegalDocBody view={view} entity={entity} anchorLabel={t('meta.anchorLabel')} />

          {/* Cặp trước/sau: bộ văn bản đọc theo thứ tự — lý do ở docblock `LegalDocPager`. */}
          <LegalDocPager current={doc} docs={docs} />

          <footer className={styles.footer}>
            <p className={styles.printHint}>{t('meta.printHint')}</p>
          </footer>
        </article>

        <aside className={styles.side}>
          <LegalDocSwitcher current={doc} docs={docs} label={t('meta.docNav')} />
          <LegalTableOfContents title={t('meta.toc')} items={tocItems} />
        </aside>
      </div>
    </div>
  );
}
