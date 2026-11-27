import { describe, expect, it } from 'vitest';
import enLegal from '@xeprime/domain/messages/en/legal.json';
import viLegal from '@xeprime/domain/messages/vi/legal.json';

import {
  AUTO_ACCEPT_MIN_LEAD_MINUTES,
  CANCEL_CREDIT_DELAY_BOUNDS,
  FEE_SCHEDULE_DEFAULTS,
  HOLD_DYNAMIC_WINDOW,
  HOLD_FREE_CANCEL_HOURS,
  HOLD_PAYMENT_WINDOW_MINUTES,
  HOST_METRIC_WINDOW_DAYS,
  SERVICE_TYPE,
  TAX_RATES_DEFAULTS,
  VEHICLE_TYPE,
  WITHDRAWAL_TERMS,
  taxRateTotalPercent,
} from '@xeprime/types';

import {
  LEGAL_DOC,
  LEGAL_DOC_GROUPS,
  LEGAL_DOC_VALUES,
  LEGAL_DOC_WEB_VALUES,
  LEGAL_EFFECTIVE_FROM,
  LEGAL_SECTIONS,
  LEGAL_WEB_ONLY_DOCS,
  isLegalDoc,
  isWebLegalDoc,
  legalDocsFor,
  legalPath,
  legalSectionKeys,
} from './legal';
import { FOOTER_COLUMNS, FOOTER_SERVICE_LINKS } from '@/features/marketplace/constants';
import { ROUTES } from './routes';

/**
 * Bộ văn bản pháp lý công khai.
 *
 * Nội dung do luật sư quyết, nhưng những thứ dưới đây là kỹ thuật và phải khoá lại bằng test:
 *
 *  1. **Danh sách mục ở code và bản dịch không được lệch nhau.** `LEGAL_SECTIONS` quyết định
 *     thứ tự hiển thị; nếu một mục có tên ở đó mà thiếu bản dịch, trang sẽ âm thầm thiếu một
 *     điều khoản — đúng kiểu sai không ai thấy trong một văn bản pháp lý.
 *  2. **Chiều ngược lại cũng vậy:** một mục đã dịch mà quên thêm vào `LEGAL_SECTIONS` là công
 *     sức viết ra rồi không bao giờ hiện.
 *  3. **Con số trong văn bản khớp con số hệ thống đang áp** (thuế, biểu phí, cửa sổ huỷ, rút
 *     tiền): văn bản và chính sách phí là hai nguồn khác nhau, đổi một bên mà quên bên kia là
 *     công bố một con số không ai đang áp.
 *  4. **Chân trang và trang mục lục không được bỏ sót văn bản nào.**
 */

type TableBundle = {
  columns: Record<string, string>;
  rows: Record<string, Record<string, string>>;
};
type SectionBundle = Record<
  string,
  { heading: string; body: string; items?: Record<string, string>; table?: TableBundle }
>;
type DocBundle = { title: string; summary: string; sections: SectionBundle };

const BUNDLES = [
  ['vi', viLegal],
  ['en', enLegal],
] as const;

const docs = (bundle: typeof viLegal) => bundle.docs as unknown as Record<string, DocBundle>;

/** Một văn bản, đã khẳng định là có — để mỗi bài test khỏi lặp lại phép thu hẹp kiểu. */
function docOf(bundle: typeof viLegal, doc: string): DocBundle {
  const found = docs(bundle)[doc];
  if (!found) throw new Error(`legal.json thiếu hẳn văn bản "${doc}"`);
  return found;
}

/** Toàn bộ chữ của một mục (đoạn + gạch + ô bảng), để soát con số. */
function sectionText(bundle: typeof viLegal, doc: string, section: string): string {
  const entry = docOf(bundle, doc).sections[section];
  if (!entry) throw new Error(`thiếu mục "${section}" của "${doc}"`);
  const items = Object.values(entry.items ?? {});
  const cells = Object.values(entry.table?.rows ?? {}).flatMap((row) => Object.values(row));
  return [entry.body, ...items, ...cells].join(' ');
}

describe('văn bản pháp lý - code và bản dịch phải khớp', () => {
  it.each(LEGAL_DOC_WEB_VALUES)(
    '%s: mọi mục trong LEGAL_SECTIONS đều có bản dịch vi + en',
    (doc) => {
      for (const section of LEGAL_SECTIONS[doc]) {
        for (const [locale, bundle] of BUNDLES) {
          const entry = docOf(bundle, doc).sections[section.key];
          expect(
            entry,
            `${locale}/legal.json thiếu mục "${section.key}" của "${doc}"`,
          ).toBeTruthy();
          expect(entry?.heading.trim()).not.toBe('');
          expect(entry?.body.trim()).not.toBe('');

          /*
           * Các KHOẢN trong một điều cũng khai thứ tự ở code. Thiếu bản dịch thì trang lặng lẽ
           * bỏ qua khoản đó (`buildLegalDocView` lọc bằng `t.has`) — tức một điều khoản biến
           * mất mà không có gì báo.
           */
          for (const item of section.items ?? []) {
            const value = entry?.items?.[item];
            expect(
              value,
              `${locale}/legal.json thiếu khoản "${item}" của mục "${section.key}" trong "${doc}"`,
            ).toBeTruthy();
            expect(value?.trim()).not.toBe('');
          }

          /* Bảng: đủ tiêu đề cột, đủ ô cho mọi dòng × cột — một ô trống là một quyền lợi bị nuốt. */
          if (section.table) {
            const table = entry?.table;
            expect(table, `${locale}: mục "${section.key}" của "${doc}" thiếu bảng`).toBeTruthy();
            for (const col of section.table.columns) {
              expect(table?.columns[col]?.trim(), `${locale}: thiếu cột "${col}"`).toBeTruthy();
            }
            for (const row of section.table.rows) {
              for (const col of section.table.columns) {
                expect(
                  table?.rows[row]?.[col]?.trim(),
                  `${locale}: thiếu ô "${row}.${col}" ở mục "${section.key}" của "${doc}"`,
                ).toBeTruthy();
              }
            }
          }
        }
      }
    },
  );

  it.each(LEGAL_DOC_WEB_VALUES)(
    '%s: không mục nào đã dịch mà bị bỏ quên khỏi LEGAL_SECTIONS',
    (doc) => {
      const translated = Object.keys(docOf(viLegal, doc).sections);
      expect([...translated].sort()).toEqual([...legalSectionKeys(doc)].sort());
    },
  );

  /** Chiều ngược lại cho các KHOẢN và DÒNG BẢNG: viết ra rồi quên khai thứ tự thì không bao giờ hiện. */
  it.each(LEGAL_DOC_WEB_VALUES)(
    '%s: không khoản / dòng bảng nào đã dịch mà thiếu trong code',
    (doc) => {
      for (const section of LEGAL_SECTIONS[doc]) {
        const entry = docOf(viLegal, doc).sections[section.key];
        expect(Object.keys(entry?.items ?? {}).sort(), `mục "${section.key}" của "${doc}"`).toEqual(
          [...(section.items ?? [])].sort(),
        );
        expect(Object.keys(entry?.table?.rows ?? {}).sort()).toEqual(
          [...(section.table?.rows ?? [])].sort(),
        );
        expect(Object.keys(entry?.table?.columns ?? {}).sort()).toEqual(
          [...(section.table?.columns ?? [])].sort(),
        );
      }
    },
  );

  it('mọi văn bản có tiêu đề và tóm tắt ở cả hai ngôn ngữ', () => {
    for (const doc of LEGAL_DOC_WEB_VALUES) {
      for (const [, bundle] of BUNDLES) {
        expect(docOf(bundle, doc).title.trim()).not.toBe('');
        expect(docOf(bundle, doc).summary.trim()).not.toBe('');
      }
    }
  });

  it('ngày hiệu lực là một ngày hợp lệ dạng YYYY-MM-DD', () => {
    expect(LEGAL_EFFECTIVE_FROM).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(LEGAL_EFFECTIVE_FROM))).toBe(false);
  });
});

describe('văn bản chỉ-web và nhóm văn bản', () => {
  it('app native (isLegalDoc) không mở được văn bản chỉ-web; web (isWebLegalDoc) mở được mọi văn bản', () => {
    for (const doc of LEGAL_DOC_VALUES) expect(isLegalDoc(doc)).toBe(true);
    for (const doc of LEGAL_WEB_ONLY_DOCS) {
      expect(isLegalDoc(doc)).toBe(false);
      expect(isWebLegalDoc(doc)).toBe(true);
    }
    expect(isLegalDoc('khong-ton-tai')).toBe(false);
    expect(isWebLegalDoc('')).toBe(false);
  });

  /** App native không được nhắc tới gói (né IAP): văn bản điều kiện gói chỉ ở web. */
  it('điều kiện gói là văn bản chỉ-web', () => {
    expect(LEGAL_WEB_ONLY_DOCS.has(LEGAL_DOC.SUBSCRIPTION)).toBe(true);
    expect(legalDocsFor({ inCustomerApp: true })).not.toContain(LEGAL_DOC.SUBSCRIPTION);
    expect(legalDocsFor({ inCustomerApp: false })).toContain(LEGAL_DOC.SUBSCRIPTION);
  });

  it('mỗi văn bản thuộc đúng một nhóm của trang mục lục', () => {
    const grouped = LEGAL_DOC_GROUPS.flatMap((g) => g.docs);
    expect([...grouped].sort()).toEqual([...LEGAL_DOC_WEB_VALUES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('nhóm nào cũng có tiêu đề và mô tả ở cả hai ngôn ngữ', () => {
    for (const { group } of LEGAL_DOC_GROUPS) {
      for (const [, bundle] of BUNDLES) {
        const groups = (
          bundle.index as unknown as { groups: Record<string, { title: string; desc: string }> }
        ).groups;
        expect(groups[group]?.title.trim()).toBeTruthy();
        expect(groups[group]?.desc.trim()).toBeTruthy();
      }
    }
  });
});

/**
 * "Chính sách thuế cho chủ xe" (ADR 0068 điều 6) nêu mức khấu trừ HIỆN HÀNH bằng chữ.
 */
describe('chính sách thuế cho chủ xe', () => {
  const rateItems = {
    [SERVICE_TYPE.SELF_DRIVE]: 'selfDrive',
    [SERVICE_TYPE.LONG_TERM]: 'longTerm',
    [SERVICE_TYPE.WITH_DRIVER]: 'withDriver',
  } as const;

  it.each([
    ['vi', viLegal, ','],
    ['en', enLegal, '.'],
  ] as const)('%s: mức từng loại dịch vụ khớp TAX_RATES_DEFAULTS', (_locale, bundle, decimal) => {
    const pct = (n: number) => `${String(n).replace('.', decimal)}%`;
    const items = docOf(bundle, LEGAL_DOC.OWNER_TAX).sections.rates?.items ?? {};
    for (const [serviceType, itemKey] of Object.entries(rateItems)) {
      const rate = TAX_RATES_DEFAULTS[serviceType as keyof typeof rateItems];
      const text = items[itemKey] ?? '';
      expect(text).toContain(pct(taxRateTotalPercent(rate)));
      expect(text).toContain(pct(rate.vatPercent));
      expect(text).toContain(pct(rate.pitPercent));
    }
  });

  // Ngưỡng do Chính phủ đặt bằng nghị định (Luật 09/2026/QH16): 500 triệu (NĐ 68/2026) đã nâng
  // lên 01 tỷ đồng bởi NĐ 141/2026, áp dụng từ 01/01/2026. Nghị định mới đổi ngưỡng ⇒ sửa mục
  // `threshold` + căn cứ ở `basis` cùng đợt.
  it.each([
    ['vi', viLegal, '01 tỷ đồng'],
    ['en', enLegal, 'VND 1 billion'],
  ] as const)(
    '%s: ngưỡng doanh thu không phải nộp thuế là 01 tỷ đồng, dẫn NĐ 141/2026',
    (_locale, bundle, amount) => {
      const threshold = sectionText(bundle, LEGAL_DOC.OWNER_TAX, 'threshold');
      expect(threshold).toContain(amount);
      expect(threshold).toContain('141/2026');
      expect(threshold).not.toMatch(/500 (triệu|million)/);
      expect(sectionText(bundle, LEGAL_DOC.OWNER_TAX, 'basis')).toContain('141/2026');
    },
  );
});

/**
 * Biểu phí công bố ở Quy chế (mục 12) và tỉ lệ tiền thuê trả trước ở Điều khoản / Chính sách
 * thanh toán phải khớp bộ số mặc định của chính sách phí. Đổi biểu phí = phát hành chính sách phí
 * mới VÀ sửa văn bản cùng đợt (dời `LEGAL_EFFECTIVE_FROM`).
 */
describe('biểu phí công bố khớp FEE_SCHEDULE_DEFAULTS', () => {
  const tiers = FEE_SCHEDULE_DEFAULTS.ownerCommissionTiers;

  it.each(BUNDLES)('%s: nấc hoa hồng theo ngày', (_locale, bundle) => {
    const text = sectionText(bundle, LEGAL_DOC.MARKETPLACE_RULES, 'fees');
    tiers.forEach((tier, index) => {
      const next = tiers[index + 1];
      const range = next ? `${tier.fromDay}-${next.fromDay - 1}` : String(tier.fromDay);
      expect(text, `nấc từ ngày ${tier.fromDay}`).toContain(`${tier.percent}%`);
      expect(text).toContain(range);
    });
  });

  it('vi: phí đặt xe theo loại xe', () => {
    const text = sectionText(viLegal, LEGAL_DOC.MARKETPLACE_RULES, 'fees');
    const vnd = (v: string) => `${Number(v).toLocaleString('de-DE')}đ`;
    expect(text).toContain(vnd(FEE_SCHEDULE_DEFAULTS.customerPlatformFee[VEHICLE_TYPE.CAR]));
    expect(text).toContain(vnd(FEE_SCHEDULE_DEFAULTS.customerPlatformFee[VEHICLE_TYPE.MOTORBIKE]));
  });

  it.each(BUNDLES)('%s: tỉ lệ tiền thuê trả trước', (_locale, bundle) => {
    const pct = `${FEE_SCHEDULE_DEFAULTS.depositPercent}%`;
    expect(sectionText(bundle, LEGAL_DOC.TERMS, 'money')).toContain(pct);
    expect(sectionText(bundle, LEGAL_DOC.PAYMENT, 'tripPayment')).toContain(pct);
    expect(sectionText(bundle, LEGAL_DOC.MARKETPLACE_RULES, 'fees')).toContain(pct);
  });
});

/**
 * Các mốc thời gian của Chính sách huỷ (ADR 0066 · 0072 · 0107) và Chính sách thanh toán đọc từ
 * hằng số server dùng — văn bản hứa một con số khác số hệ thống áp là sai ngay trên tiền khách.
 */
describe('mốc thời gian công bố khớp hằng số hệ thống', () => {
  it('vi: thời hạn thanh toán, huỷ miễn phí, tự nhận chuyến', () => {
    const text = sectionText(viLegal, LEGAL_DOC.CANCELLATION, 'paymentWindow');
    expect(text).toContain(`${Math.round(HOLD_DYNAMIC_WINDOW.PAYMENT_SHARE * 100)}%`);
    expect(text).toContain(`${Math.round(HOLD_DYNAMIC_WINDOW.FREE_CANCEL_SHARE * 100)}%`);
    expect(text).toContain(`tối thiểu ${HOLD_DYNAMIC_WINDOW.MIN_MINUTES} phút`);
    expect(text).toContain(`tối đa ${HOLD_PAYMENT_WINDOW_MINUTES} phút`);
    expect(text).toContain(`tối đa ${HOLD_FREE_CANCEL_HOURS} giờ`);
    expect(text).toContain(`${AUTO_ACCEPT_MIN_LEAD_MINUTES} phút`);
  });

  it('vi: khoảng chờ hoàn tiền khi khách huỷ', () => {
    const text = sectionText(viLegal, LEGAL_DOC.CANCELLATION, 'refund');
    expect(text).toContain(`${CANCEL_CREDIT_DELAY_BOUNDS.default} giờ`);
    expect(text).toContain(`${CANCEL_CREDIT_DELAY_BOUNDS.max / 24} ngày`);
  });

  it('vi: rút tiền và cửa sổ chỉ số uy tín', () => {
    const withdrawal = sectionText(viLegal, LEGAL_DOC.PAYMENT, 'withdrawal');
    expect(withdrawal).toContain(`${WITHDRAWAL_TERMS.MAX_BUSINESS_DAYS} ngày làm việc`);
    expect(withdrawal).toContain(`${WITHDRAWAL_TERMS.CUTOFF_HOUR_VN}:00`);
    expect(withdrawal).toContain(`${WITHDRAWAL_TERMS.MIN_AMOUNT.toLocaleString('de-DE')}đ`);
    expect(sectionText(viLegal, LEGAL_DOC.MARKETPLACE_RULES, 'metrics')).toContain(
      `${HOST_METRIC_WINDOW_DAYS} ngày`,
    );
  });
});

/**
 * Câu "tiếp tục tức là bạn đồng ý với …" đặt cạnh các nút cam kết. Ba thứ phải khoá lại:
 *
 *  1. Thẻ trong câu phải nằm trong bộ thẻ mà `LegalConsentNote` cấp handler — next-intl ném
 *     lỗi lúc render nếu thiếu, tức là vỡ ngay giữa hộp thoại đặt xe.
 *  2. Câu app native còn đọc chỉ được dùng BỐN thẻ cũ: app chỉ cấp handler cho bốn thẻ đó.
 *  3. Hai ngôn ngữ phải viện dẫn ĐÚNG những văn bản như nhau.
 */
describe('câu cam kết pháp lý cạnh nút hành động', () => {
  const WEB_TAGS = [
    'terms',
    'privacy',
    'rules',
    'cancellation',
    'contract',
    'payment',
    'subscription',
  ];
  const NATIVE_TAGS = ['terms', 'privacy', 'rules', 'cancellation'];
  /** Câu app native (`apps/mobile/shared/src/features/legal`) còn đọc. */
  const NATIVE_PLACES = [
    'auth',
    'authCheck',
    'booking',
    'bookingCheck',
    'bookingCheckHost',
    'subscription',
    'shop',
    'shopCheck',
    'marketAuth',
  ];
  const WEB_PLACES = [...NATIVE_PLACES, 'bookingAgree', 'bookingAgreeHost', 'packagePurchase'];

  const consent = (bundle: typeof viLegal) =>
    (bundle as unknown as { consent: Record<string, string> }).consent;

  const tagsOf = (message: string) =>
    [...message.matchAll(/<([a-zA-Z]+)>/g)].map((m) => m[1]).sort();

  it.each(WEB_PLACES)('%s: có ở cả hai ngôn ngữ và chỉ dùng thẻ web đã biết', (place) => {
    for (const [locale, bundle] of BUNDLES) {
      const message = consent(bundle)[place];
      expect(message, `${locale}/legal.json thiếu câu cam kết "${place}"`).toBeTruthy();
      const tags = tagsOf(message ?? '');
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) expect(WEB_TAGS).toContain(tag);
    }
  });

  it.each(NATIVE_PLACES)('%s: chỉ dùng bốn thẻ app native có handler', (place) => {
    for (const [, bundle] of BUNDLES) {
      for (const tag of tagsOf(consent(bundle)[place] ?? '')) expect(NATIVE_TAGS).toContain(tag);
    }
  });

  it.each(WEB_PLACES)('%s: hai ngôn ngữ viện dẫn cùng bộ văn bản', (place) => {
    expect(tagsOf(consent(enLegal)[place] ?? '')).toEqual(tagsOf(consent(viLegal)[place] ?? ''));
  });

  /**
   * Ô đồng ý ở màn Xem lại yêu cầu thuê chỉ giữ HAI liên kết (người dùng chốt 27/11/2026): Điều
   * khoản sử dụng (viện dẫn cả bộ, kể cả điều kiện chung hợp đồng thuê — điều 1) và Chính sách huỷ
   * (điều kiện tiền bạc khách phải thấy trước khi giao kết). Vì vậy Điều khoản phải GIỮ câu viện dẫn.
   */
  it('câu đồng ý khi gửi yêu cầu thuê (web) gồm điều khoản + chính sách huỷ, và điều khoản viện dẫn hợp đồng thuê', () => {
    for (const place of ['bookingAgree', 'bookingAgreeHost']) {
      expect(tagsOf(consent(viLegal)[place] ?? '')).toEqual(['cancellation', 'terms']);
    }
    for (const [, bundle] of BUNDLES) {
      const scope = docOf(bundle, LEGAL_DOC.TERMS).sections.scope?.body ?? '';
      const contractTitle = docOf(bundle, LEGAL_DOC.RENTAL_CONTRACT).title;
      expect(scope).toContain(contractTitle);
    }
    expect(tagsOf(consent(viLegal).packagePurchase ?? '')).toContain('subscription');
  });
});

describe('chân trang - không còn liên kết chết', () => {
  /**
   * MỌI đích trong chân trang, không chỉ các cột: hai cột khai tường minh (`FOOTER_COLUMNS`) và
   * ba bộ lọc dịch vụ dựng riêng (`FOOTER_SERVICE_LINKS`).
   */
  const footerHrefs = [
    ...FOOTER_COLUMNS.flatMap((col) => col.links.map((l) => l.href)),
    ...FOOTER_SERVICE_LINKS.map((l) => l.href),
  ];

  it('không mục nào trỏ về trang chủ như một chỗ trống', () => {
    expect(footerHrefs).not.toContain(ROUTES.HOME);
  });

  /**
   * Chân trang giữ các văn bản cốt lõi pháp luật buộc dẫn từ trang chủ (điều khoản, quy chế,
   * dữ liệu cá nhân, huỷ & hoàn tiền, khiếu nại) + lối tới cả bộ; các văn bản còn lại nằm ở trang
   * mục lục (khoá ở nhóm "mỗi văn bản thuộc đúng một nhóm").
   */
  it('đủ văn bản cốt lõi, lối tới cả bộ và trang hỗ trợ', () => {
    for (const doc of [
      LEGAL_DOC.TERMS,
      LEGAL_DOC.MARKETPLACE_RULES,
      LEGAL_DOC.PRIVACY,
      LEGAL_DOC.CANCELLATION,
      LEGAL_DOC.COMPLAINTS,
    ]) {
      expect(footerHrefs).toContain(legalPath.doc(doc));
    }
    expect(footerHrefs).toContain(legalPath.index);
    expect(footerHrefs).toContain(ROUTES.SUPPORT);
  });

  it('chân trang không dẫn tới văn bản chỉ-web (chân trang cũng hiện trong WebView của app)', () => {
    for (const doc of LEGAL_WEB_ONLY_DOCS) expect(footerHrefs).not.toContain(legalPath.doc(doc));
  });

  it('không mục nào lặp lại đích', () => {
    expect(new Set(footerHrefs).size).toBe(footerHrefs.length);
  });
});
