import { cx } from '@/lib/cx';
import type { LegalDocView, LegalTableView } from '../legal-doc-model';
import styles from './LegalDocBody.module.css';

interface LegalDocBodyProps {
  readonly view: LegalDocView;
  /** Mục "Đơn vị vận hành" cuối văn bản — mục như mọi mục khác, có trong mục lục và neo được. */
  readonly entity: { readonly id: string; readonly heading: string; readonly body: string };
  /**
   * Nhãn khả truy cập của neo chia sẻ `#`. Không truyền ⇒ không có neo — hộp xem nhanh không
   * cần neo (một liên kết `#mục` trong popup đổi hash của TRANG đang đặt xe).
   */
  readonly anchorLabel?: string;
  /** `3` khi văn bản nằm trong hộp thoại có tiêu đề `h2` riêng. */
  readonly headingLevel?: 2 | 3;
  /** `compact`: cỡ chữ nhỏ hơn một bậc cho hộp xem nhanh. */
  readonly variant?: 'page' | 'compact';
}

/**
 * Thân một văn bản pháp lý: các mục (đoạn mở đầu, gạch đầu dòng, bảng) + đơn vị vận hành.
 *
 * Thuần trình bày, KHÔNG hook, KHÔNG `'use client'`: chạy như Server Component ở trang
 * `/legal/<doc>` (giữ HTML tĩnh cho SEO và bản in) và chạy trong cây client của hộp xem nhanh
 * `LegalDocDialog` — một nguồn render cho cả hai, nên popup không bao giờ thiếu một khoản mà
 * trang đầy đủ có.
 */
export function LegalDocBody({
  view,
  entity,
  anchorLabel,
  headingLevel = 2,
  variant = 'page',
}: LegalDocBodyProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  const heading = (id: string, text: string) => (
    <Heading className={styles.heading}>
      {text}
      {/*
        Neo chia sẻ: hiện khi rê chuột hoặc khi tới bằng bàn phím. Người ta trích dẫn một ĐIỀU cụ
        thể của văn bản, không trích cả văn bản.
      */}
      {anchorLabel ? (
        <a href={`#${id}`} className={styles.anchor} aria-label={anchorLabel}>
          #
        </a>
      ) : null}
    </Heading>
  );

  return (
    <div className={cx(styles.body, variant === 'compact' && styles.compact)}>
      {view.sections.map((section) => (
        <section key={section.key} id={section.id} className={styles.section}>
          {heading(section.id, section.heading)}
          <p className={styles.paragraph}>{section.body}</p>
          {section.items.length > 0 ? (
            <ul className={styles.itemList}>
              {section.items.map((item) => (
                <li key={item.key} className={styles.item}>
                  {item.text}
                </li>
              ))}
            </ul>
          ) : null}
          {section.table ? <LegalTable table={section.table} /> : null}
        </section>
      ))}

      <section id={entity.id} className={styles.section}>
        {heading(entity.id, entity.heading)}
        <p className={styles.paragraph}>{entity.body}</p>
      </section>
    </div>
  );
}

/**
 * Bảng của một mục (ma trận huỷ chuyến, ai nhận khoản nào).
 *
 * Bảng THẬT (`<table>` + `<th scope>`) để trình đọc màn hình đọc được "dòng × cột". Dưới 640px
 * mỗi dòng co thành một thẻ, nhãn cột hiện trước từng ô qua `data-label` — bảng bốn cột không
 * đọc được trên điện thoại, còn cuộn ngang thì người ta không biết là phải cuộn.
 */
function LegalTable({ table }: { table: LegalTableView }) {
  const [first, ...rest] = table.columns;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((col) => (
              <th key={col.key} scope="col" className={styles.th}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => {
            const [head, ...cells] = row.cells;
            return (
              <tr key={row.key} className={styles.tr}>
                <th scope="row" className={styles.rowHead} data-label={first?.label}>
                  {head?.text}
                </th>
                {cells.map((cell, index) => (
                  <td
                    key={cell.column}
                    className={styles.td}
                    data-label={rest[index]?.label ?? cell.label}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
