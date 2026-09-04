import { describe, expect, it } from 'vitest';
import enLegal from '@xeprime/domain/messages/en/legal.json';
import viLegal from '@xeprime/domain/messages/vi/legal.json';

import {
  LEGAL_DOC_VALUES,
  LEGAL_EFFECTIVE_FROM,
  LEGAL_SECTIONS,
  isLegalDoc,
  legalPath,
} from './legal';
import { FOOTER_COLUMNS } from '@/features/marketplace/constants';
import { ROUTES } from './routes';

/**
 * Bốn văn bản pháp lý công khai.
 *
 * Nội dung do luật sư quyết, nhưng ba thứ dưới đây là kỹ thuật và phải khoá lại bằng test:
 *
 *  1. **Danh sách mục ở code và bản dịch không được lệch nhau.** `LEGAL_SECTIONS` quyết định
 *     thứ tự hiển thị; nếu một mục có tên ở đó mà thiếu bản dịch, trang sẽ âm thầm thiếu một
 *     điều khoản — đúng kiểu sai không ai thấy trong một văn bản pháp lý.
 *  2. **Chiều ngược lại cũng vậy:** một mục đã dịch mà quên thêm vào `LEGAL_SECTIONS` là công
 *     sức viết ra rồi không bao giờ hiện.
 *  3. **Chân trang không được trỏ vào hư không** — đó là lý do cả đợt này tồn tại.
 */

type SectionBundle = Record<string, { heading: string; body: string }>;
type DocBundle = { title: string; summary: string; sections: SectionBundle };

const docs = (bundle: typeof viLegal) => bundle.docs as unknown as Record<string, DocBundle>;

/** Một văn bản, đã khẳng định là có — để mỗi bài test khỏi lặp lại phép thu hẹp kiểu. */
function docOf(bundle: typeof viLegal, doc: string): DocBundle {
  const found = docs(bundle)[doc];
  if (!found) throw new Error(`legal.json thiếu hẳn văn bản "${doc}"`);
  return found;
}

describe('văn bản pháp lý — code và bản dịch phải khớp', () => {
  it.each(LEGAL_DOC_VALUES)('%s: mọi mục trong LEGAL_SECTIONS đều có bản dịch vi + en', (doc) => {
    for (const section of LEGAL_SECTIONS[doc]) {
      for (const [locale, bundle] of [
        ['vi', viLegal],
        ['en', enLegal],
      ] as const) {
        const entry = docOf(bundle, doc).sections[section];
        expect(entry, `${locale}/legal.json thiếu mục "${section}" của "${doc}"`).toBeTruthy();
        expect(entry?.heading.trim()).not.toBe('');
        expect(entry?.body.trim()).not.toBe('');
      }
    }
  });

  it.each(LEGAL_DOC_VALUES)(
    '%s: không mục nào đã dịch mà bị bỏ quên khỏi LEGAL_SECTIONS',
    (doc) => {
      const translated = Object.keys(docOf(viLegal, doc).sections);
      expect([...translated].sort()).toEqual([...LEGAL_SECTIONS[doc]].sort());
    },
  );

  it('mọi văn bản có tiêu đề và tóm tắt ở cả hai ngôn ngữ', () => {
    for (const doc of LEGAL_DOC_VALUES) {
      for (const bundle of [viLegal, enLegal]) {
        expect(docOf(bundle, doc).title.trim()).not.toBe('');
        expect(docOf(bundle, doc).summary.trim()).not.toBe('');
      }
    }
  });

  it('ngày hiệu lực là một ngày hợp lệ dạng YYYY-MM-DD', () => {
    expect(LEGAL_EFFECTIVE_FROM).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(LEGAL_EFFECTIVE_FROM))).toBe(false);
  });

  it('isLegalDoc chỉ nhận đúng bốn slug', () => {
    for (const doc of LEGAL_DOC_VALUES) expect(isLegalDoc(doc)).toBe(true);
    expect(isLegalDoc('khong-ton-tai')).toBe(false);
    expect(isLegalDoc('')).toBe(false);
  });
});

/**
 * Câu "tiếp tục tức là bạn đồng ý với …" đặt cạnh bốn nút cam kết (đăng nhập/đăng ký, gửi yêu
 * cầu đặt xe, mua gói, tạo gian hàng). Chúng là con đường vào văn bản pháp lý ở những màn
 * KHÔNG có chân trang marketplace, nên hai thứ phải khoá lại:
 *
 *  1. Thẻ trong câu phải nằm trong bộ thẻ mà `LegalConsentNote` cấp handler — next-intl ném
 *     lỗi lúc render nếu thiếu, tức là vỡ ngay giữa hộp thoại đặt xe.
 *  2. Hai ngôn ngữ phải viện dẫn ĐÚNG những văn bản như nhau: bản tiếng Anh nói "Terms" mà bản
 *     tiếng Việt nói "Quy chế sàn" là hai cam kết khác nhau trên cùng một nút.
 */
describe('câu cam kết pháp lý cạnh nút hành động', () => {
  const KNOWN_TAGS = ['terms', 'privacy', 'rules', 'cancellation'];
  const PLACES = ['auth', 'booking', 'subscription', 'shop'];

  const consent = (bundle: typeof viLegal) =>
    (bundle as unknown as { consent: Record<string, string> }).consent;

  const tagsOf = (message: string) =>
    [...message.matchAll(/<([a-zA-Z]+)>/g)].map((m) => m[1]).sort();

  it.each(PLACES)('%s: có ở cả hai ngôn ngữ và chỉ dùng thẻ đã biết', (place) => {
    for (const [locale, bundle] of [
      ['vi', viLegal],
      ['en', enLegal],
    ] as const) {
      const message = consent(bundle)[place];
      expect(message, `${locale}/legal.json thiếu câu cam kết "${place}"`).toBeTruthy();
      const tags = tagsOf(message ?? '');
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) expect(KNOWN_TAGS).toContain(tag);
    }
  });

  it.each(PLACES)('%s: hai ngôn ngữ viện dẫn cùng bộ văn bản', (place) => {
    expect(tagsOf(consent(enLegal)[place] ?? '')).toEqual(tagsOf(consent(viLegal)[place] ?? ''));
  });
});

describe('chân trang — không còn liên kết chết', () => {
  const footerHrefs = FOOTER_COLUMNS.flatMap((col) => col.links.map((l) => l.href));

  /**
   * Trước 03/09/2026, 9 trong 11 mục chân trang trỏ về `ROUTES.HOME` — gồm cả "Điều khoản dịch
   * vụ" và "Chính sách bảo mật". Bấm vào một văn bản pháp lý rồi quay lại trang chủ là dạng
   * link chết khó chịu nhất: nó trông như hoạt động.
   */
  it('không mục nào trỏ về trang chủ như một chỗ trống', () => {
    expect(footerHrefs).not.toContain(ROUTES.HOME);
  });

  it('đủ bốn văn bản pháp lý và trang hỗ trợ', () => {
    for (const doc of LEGAL_DOC_VALUES) {
      expect(footerHrefs).toContain(legalPath.doc(doc));
    }
    expect(footerHrefs).toContain(ROUTES.SUPPORT);
  });

  it('không mục nào lặp lại đích', () => {
    expect(new Set(footerHrefs).size).toBe(footerHrefs.length);
  });
});
