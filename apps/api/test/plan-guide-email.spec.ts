import { PLAN_GUIDE_VARIANT_VALUES } from '@xeprime/types';
import { PLAN_GUIDE_TEMPLATE_SEEDS } from '../../../prisma/src/seed/plan-guide-templates.data';
import {
  buildPlanTableHtml,
  formatPercent,
  renderPlanGuideTemplate,
} from '../src/modules/email/plan-guide-email';

/** Bảng gói của email: tối đa 2 thẻ một hàng, mỗi PHẦN thẻ một `<tr>` để thẳng hàng giữa các thẻ. */
const plan = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  description: null,
  billingMode: 'package',
  limits: {
    maxVehicles: 3,
    maxBranches: 1,
    features: [],
    termPrices: [{ months: 1, price: '100000' }],
    ...extra,
  },
});

describe('buildPlanTableHtml — bố cục thẻ', () => {
  const plans = [plan('A'), plan('B', { recommended: true }), plan('C')];

  it('hai thẻ một hàng; mỗi hàng bảng có đúng 4 <tr> phần (đầu · giá · quyền lợi · nút)', () => {
    const html = buildPlanTableHtml(plans, 'vi');
    const desk = /<div class="xp-desk">([\s\S]*?)<\/div><!--xp-mob-->/.exec(html)![1]!;
    const tables = desk.split('table-layout:fixed').slice(1);
    expect(tables).toHaveLength(2); // 3 thẻ ⇒ 2 hàng
    // hàng thứ nhất: 4 phần × 2 thẻ, mỗi ô phần mang viền trái của thẻ
    expect((tables[0]!.match(/border-left:/g) ?? []).length).toBe(8);
    expect(html).toContain('<!--xp-mob-->');
  });

  it('bản chữ thuần không lặp thẻ từ bản xếp chồng cho màn hẹp', () => {
    const out = renderPlanGuideTemplate(
      { subjectVi: 's', subjectEn: 's', bodyVi: '{{planTable}}', bodyEn: '{{planTable}}' },
      {
        locale: 'vi',
        reason: 'registered',
        recipientName: null,
        shopName: null,
        expiresAt: null,
        plans,
        purchaseUrl: 'https://p.test/subscription',
        contactUrl: 'https://p.test/support',
        assetBaseUrl: 'https://w.test/email',
        hotline: null,
        zalo: null,
        reminderDays: 7,
        graceDays: null,
        commissionPercent: null,
        packageCommissionPercent: 0,
      },
    );
    expect(out.text.match(/\bA\b/g)).toHaveLength(1);
  });
});

describe('formatPercent', () => {
  it('bỏ số 0 thừa, dấu thập phân theo ngôn ngữ; null ⇒ rỗng', () => {
    expect(formatPercent(10, 'vi-VN')).toBe('10%');
    expect(formatPercent(7.5, 'vi-VN')).toBe('7,5%');
    expect(formatPercent(7.5, 'en-GB')).toBe('7.5%');
    expect(formatPercent(0, 'vi-VN')).toBe('0%');
    expect(formatPercent(null, 'vi-VN')).toBe('');
  });
});

describe('mẫu seed — mọi số liệu là biến, không chép cứng', () => {
  /** Chữ người đọc thấy: bỏ thẻ HTML (CSS `width:100%` không phải nội dung) và biến `{{…}}`. */
  const visible = (html: string) =>
    html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ');

  it.each(PLAN_GUIDE_TEMPLATE_SEEDS.map((t) => [t.code, t] as const))('%s: không phần trăm cứng, không "N ngày/days" cứng', (_code, t) => {
    for (const variant of PLAN_GUIDE_VARIANT_VALUES) {
      for (const locale of ['vi', 'en'] as const) {
        const { subject, body } = t.variants[variant][locale];
        for (const text of [subject, visible(body)]) {
          expect(text).not.toMatch(/\d+(?:[.,]\d+)?\s*%/);
          expect(text).not.toMatch(/\d+\s*(?:ngày|days?)(?![a-z])/i);
        }
      }
    }
  });

  it('bốn nội dung của mỗi bộ dùng biến số liệu mới', () => {
    for (const t of PLAN_GUIDE_TEMPLATE_SEEDS) {
      const all = (v: string) => JSON.stringify(t.variants[v as keyof typeof t.variants]);
      expect(all('expiring')).toContain('{{reminderDays}}');
      expect(all('expired')).toContain('{{#graceEndsAt}}');
      expect(all('grace')).toContain('{{commissionPercent}}');
      expect(all('welcome')).toContain('{{packageCommissionPercent}}');
    }
  });
});

describe('"Liên hệ tư vấn" mở Zalo của admin', () => {
  const plans = [plan('A'), plan('Pro', { salesOnly: true, termPrices: [] })];
  const render = (zalo: string | null) =>
    renderPlanGuideTemplate(
      {
        subjectVi: 's',
        subjectEn: 's',
        bodyVi: '{{planTable}}{{#zalo}}<a href="{{zaloUrl}}">{{zalo}}</a>{{/zalo}}|{{zaloUrl}}',
        bodyEn: '',
      },
      {
        locale: 'vi',
        reason: 'registered',
        recipientName: null,
        shopName: null,
        expiresAt: null,
        plans,
        purchaseUrl: 'https://p.test/subscription',
        contactUrl: 'https://p.test/support',
        assetBaseUrl: 'https://w.test/email',
        hotline: null,
        zalo,
        reminderDays: 7,
        graceDays: null,
        commissionPercent: null,
        packageCommissionPercent: 0,
      },
    ).html;

  it('có Zalo ⇒ nút bậc tư vấn và {{zaloUrl}} trỏ https://zalo.me/<số nội địa>', () => {
    const html = render('+84 901 234 567');
    expect(html).toContain('<a href="https://zalo.me/0901234567" target="_blank"');
    expect(html).toContain('<a href="https://zalo.me/0901234567">+84 901 234 567</a>');
    expect(html).toContain('|https://zalo.me/0901234567');
    expect(html).not.toContain('https://p.test/support');
    expect(html).toContain('href="https://p.test/subscription"'); // bậc tự mua vẫn đi trang mua
  });

  it('chưa khai / số không hợp lệ ⇒ rơi về trang hỗ trợ của site partner', () => {
    for (const zalo of [null, 'abc']) {
      const html = render(zalo);
      expect(html).not.toContain('zalo.me');
      expect(html).toContain('href="https://p.test/support"');
      expect(html).toContain('|https://p.test/support');
    }
  });
});
