import { LEGAL_SECTIONS, type LegalDoc } from '@/constants/legal';

/**
 * Bộ dịch tối thiểu mà mô hình văn bản cần: gọi được để lấy chữ, và hỏi được khoá có tồn tại
 * không. Cả `getTranslations` (server) lẫn `useTranslations` (client) của next-intl đều thoả —
 * nơi gọi bọc lại để ép kiểu khoá ghép động MỘT chỗ.
 */
export interface LegalTranslator {
  text: (key: string) => string;
  has: (key: string) => boolean;
}

export interface LegalTableView {
  readonly caption: string;
  readonly columns: ReadonlyArray<{ readonly key: string; readonly label: string }>;
  readonly rows: ReadonlyArray<{
    readonly key: string;
    readonly cells: ReadonlyArray<{
      readonly column: string;
      readonly label: string;
      readonly text: string;
    }>;
  }>;
}

export interface LegalSectionView {
  readonly key: string;
  readonly id: string;
  readonly heading: string;
  readonly body: string;
  readonly items: ReadonlyArray<{ readonly key: string; readonly text: string }>;
  readonly table: LegalTableView | null;
}

export interface LegalDocView {
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly LegalSectionView[];
}

/** Neo của một mục — mang cả tên văn bản để link dán ra ngoài không mơ hồ giữa hai văn bản. */
export function legalSectionId(doc: LegalDoc, section: string, prefix = ''): string {
  return `${prefix}${doc}-${section}`;
}

/**
 * Dựng nội dung một văn bản từ `LEGAL_SECTIONS` (thứ tự — code) + bó message (chữ).
 *
 * MỘT hàm cho cả trang `/legal/<doc>` (server) và hộp xem nhanh trong luồng đặt xe (client):
 * hai nơi tự lặp lại phép ghép khoá là hai cơ hội để popup thiếu một khoản mà trang đầy đủ có.
 *
 *  - Một mục / khoản / ô có tên ở code mà thiếu bản dịch thì BỎ QUA thay vì ném lỗi làm trắng
 *    cả văn bản (`legal.test.ts` chặn trường hợp đó ở CI).
 *  - `inApp`: WebView của app khách — dùng biến thể `bodyInApp` / `itemsInApp` (câu không nhắc
 *    gói/thuê bao) và bỏ hẳn mục `hiddenInApp`.
 *  - `idPrefix`: hộp xem nhanh nằm CHUNG trang với nội dung khác, nên neo của nó mang tiền tố để
 *    không trùng `id` với trang.
 */
export function buildLegalDocView(
  t: LegalTranslator,
  doc: LegalDoc,
  options: { inApp: boolean; idPrefix?: string },
): LegalDocView {
  const { inApp, idPrefix = '' } = options;
  const pick = (key: string, inAppKey: string) =>
    inApp && t.has(inAppKey) ? t.text(inAppKey) : t.text(key);
  const base = `docs.${doc}`;

  const sections = LEGAL_SECTIONS[doc]
    .filter((s) => !(inApp && s.hiddenInApp))
    .filter((s) => t.has(`${base}.sections.${s.key}.heading`))
    .map((s): LegalSectionView => {
      const sectionKey = `${base}.sections.${s.key}`;
      const heading = t.text(`${sectionKey}.heading`);
      const table: LegalTableView | null = s.table
        ? (() => {
            const columns = s.table.columns
              .filter((col) => t.has(`${sectionKey}.table.columns.${col}`))
              .map((col) => ({ key: col, label: t.text(`${sectionKey}.table.columns.${col}`) }));
            return {
              caption: heading,
              columns,
              rows: s.table.rows
                .filter((row) => t.has(`${sectionKey}.table.rows.${row}.${columns[0]?.key ?? ''}`))
                .map((row) => ({
                  key: row,
                  cells: columns.map((col) => {
                    const cellKey = `${sectionKey}.table.rows.${row}.${col.key}`;
                    return {
                      column: col.key,
                      label: col.label,
                      text: t.has(cellKey) ? t.text(cellKey) : '',
                    };
                  }),
                })),
            };
          })()
        : null;

      return {
        key: s.key,
        id: legalSectionId(doc, s.key, idPrefix),
        heading,
        body: pick(`${sectionKey}.body`, `${sectionKey}.bodyInApp`),
        items: (s.items ?? [])
          .filter((item) => t.has(`${sectionKey}.items.${item}`))
          .map((item) => ({
            key: item,
            text: pick(`${sectionKey}.items.${item}`, `${sectionKey}.itemsInApp.${item}`),
          })),
        table,
      };
    });

  return { title: t.text(`${base}.title`), summary: t.text(`${base}.summary`), sections };
}
