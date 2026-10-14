import {
  buildPlanPricingCards,
  formatMoneyVnd,
  PLAN_TIER_ICON,
  zaloHref,
  VI_MONEY_SEPARATORS,
  type MoneySeparators,
  type PlanBenefitLine,
  type PlanCardSource,
  type PlanPricingCard,
  type PlanTierIcon,
} from '@xeprime/domain';
import domainEn from '@xeprime/domain/messages/en/domain.json';
import subscriptionEn from '@xeprime/domain/messages/en/subscription.json';
import domainVi from '@xeprime/domain/messages/vi/domain.json';
import subscriptionVi from '@xeprime/domain/messages/vi/subscription.json';
import {
  PLAN_GUIDE_PLACEHOLDER,
  PLAN_GUIDE_REASON,
  graceEndsAtFor,
  type AppLocale,
  type PlanFeature,
  type PlanGuidePlaceholder,
  type PlanGuideReason,
} from '@xeprime/types';

/**
 * Dựng email "Hướng dẫn đăng ký và gia hạn gói trên website" từ MẪU DO ADMIN QUẢN LÝ
 * (`plan_guide_email_templates`). Hàm thuần — không DB, không Nest — để dispatcher, màn xem trước
 * của admin, test và script xuất bản xem trước dùng CHUNG một đường.
 *
 * An toàn: mọi giá trị đưa vào thân HTML đều được ESCAPE (tên người nhận, tên gian hàng do người
 * dùng tự nhập). Ngoại lệ duy nhất là `{{planTable}}` — khối HTML do CHÍNH hàm này dựng từ dữ liệu
 * gói, mỗi mảnh chữ bên trong cũng đã escape. Thân mẫu là HTML do admin nền tảng soạn (người có
 * quyền `platform.app_config.manage`), không phải dữ liệu người dùng.
 *
 * Tiền luôn VND, ngày luôn giờ Việt Nam ở cả hai ngôn ngữ (ADR 0012). Giá mỗi kỳ là con số TUYỆT ĐỐI
 * trong `limits.termPrices` — không có phép nhân nào ở đây (ADR 0041 điều 2).
 */

/**
 * Một dòng danh mục gói — ĐÚNG hình dạng hộp thoại "Mua / gia hạn gói" của web đọc (`TenantPlanDto`):
 * thẻ dựng bằng `buildPlanPricingCards` (`@xeprime/domain`), cùng một luật bậc nào hiện, thứ tự,
 * biểu tượng, quyền lợi, giá tiêu đề và bậc tư vấn (`salesOnly`).
 */
export interface PlanGuidePlan extends PlanCardSource {
  name: string;
  description: string | null;
}

export interface PlanGuideTemplateContent {
  subjectVi: string;
  subjectEn: string;
  bodyVi: string;
  bodyEn: string;
}

export interface PlanGuideRenderInput {
  locale: AppLocale;
  reason: PlanGuideReason;
  recipientName: string | null;
  shopName: string | null;
  expiresAt: Date | null;
  plans: readonly PlanGuidePlan[];
  purchaseUrl: string;
  /**
   * Trang hỗ trợ của site partner — đường DỰ PHÒNG của mọi "Liên hệ tư vấn" (nút bậc `salesOnly`,
   * `{{zaloUrl}}`) khi chưa khai Zalo hợp lệ. Có Zalo ⇒ link `https://zalo.me/<số>`.
   */
  contactUrl: string;
  /** Gốc tuyệt đối của icon PNG email (`<web>/email`) — biến `{{assetBase}}` của mẫu. */
  assetBaseUrl: string;
  hotline: string | null;
  zalo: string | null;
  /** `SUBSCRIPTION_RENEWAL_REMINDER_DAYS` — hằng worker dùng để quyết định gửi thư "sắp hết hạn". */
  reminderDays: number;
  /** Ngày ân hạn của gói (`limits_json.graceDays`). `null`/0 ⇒ khối `{{#graceDays}}` ẩn. */
  graceDays: number | null;
  /** % phí dịch vụ mỗi chuyến tuyến hoa hồng (chính sách phí đang hiệu lực). `null` ⇒ khối ẩn. */
  commissionPercent: number | null;
  /** % phí dịch vụ mỗi chuyến tuyến gói (`tripServiceFeePercent`). `null` ⇒ khối ẩn. */
  packageCommissionPercent: number | null;
}

/** Giá trị đã định dạng mà dòng `{{reason}}` dự phòng cần — chuỗi rỗng = không có. */
interface ReasonValues {
  expiresAt: string;
  graceEndsAt: string;
  commissionPercent: string;
  packageCommissionPercent: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Nhãn của THẺ GÓI đọc từ CÙNG file message với hộp thoại web (`Subscription.purchase.*` +
 * `Domain.planFeature`) — một khoá một bản dịch, không chép chữ sang đây.
 */
interface CardMessages {
  purchase: Record<string, string>;
  planFeature: Record<string, string>;
}
const CARD_MESSAGES: Readonly<Record<AppLocale, CardMessages>> = {
  vi: { purchase: subscriptionVi.purchase, planFeature: domainVi.planFeature },
  en: { purchase: subscriptionEn.purchase, planFeature: domainEn.planFeature },
};

/** ICU tối giản cho các khoá thẻ gói — chỉ `{name}` (không plural/select ở các khoá này). */
function msg(locale: AppLocale, key: string, values: Record<string, string | number> = {}): string {
  const raw = CARD_MESSAGES[locale].purchase[key] ?? key;
  return raw.replace(/\{(\w+)\}/g,(whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

function benefitLabel(locale: AppLocale, line: PlanBenefitLine): string {
  switch (line.kind) {
    case 'vehicles':
      return line.count == null
        ? msg(locale, 'limitVehiclesUnlimited')
        : msg(locale, 'limitVehicles', { count: line.count });
    case 'branches':
      return line.count == null
        ? msg(locale, 'limitBranchesUnlimited')
        : msg(locale, 'limitBranches', { count: line.count });
    case 'feature':
      return CARD_MESSAGES[locale].planFeature[line.feature as PlanFeature] ?? line.feature;
  }
}

interface Copy {
  reason: Record<PlanGuideReason, (v: ReasonValues) => string>;
  friend: string;
  shopFallback: string;
  noPlans: string;
  intlLocale: string;
  /** Dấu phân cách tiền — format TRÊN CHUỖI, không qua `Number` (ADR 0007). */
  moneySeparators: MoneySeparators;
}

const COPY: Readonly<Record<AppLocale, Copy>> = {
  vi: {
    reason: {
      [PLAN_GUIDE_REASON.REGISTERED]: () =>
        'Cảm ơn bạn đã đăng ký gian hàng trên XePrime. Gian hàng sẽ mở ngay khi gói được thanh toán trên website.',
      [PLAN_GUIDE_REASON.CONSULTATION]: () =>
        'XePrime đã nhận yêu cầu tư vấn gói của bạn — nhân viên sẽ liên hệ sớm. Trong lúc chờ, bạn có thể xem và chọn gói ngay trên website.',
      [PLAN_GUIDE_REASON.EXPIRING]: (v) =>
        `Gói của bạn sẽ hết hạn ngày ${v.expiresAt}. Gia hạn trên website để giữ ${v.packageCommissionPercent ? `mức hoa hồng ${v.packageCommissionPercent}` : 'quyền lợi gói'} trên mỗi chuyến.`,
      [PLAN_GUIDE_REASON.EXPIRED]: (v) =>
        `Gói của bạn đã hết hạn ngày ${v.expiresAt}. Gia hạn ngay để không chuyển sang tính phí dịch vụ${v.commissionPercent ? ` ${v.commissionPercent}` : ''} theo chuyến.`,
      [PLAN_GUIDE_REASON.GRACE]: (v) =>
        `Gói của bạn đã hết hạn ngày ${v.expiresAt} và đang trong thời gian ân hạn. Gia hạn trước khi ân hạn kết thúc${v.graceEndsAt ? ` (${v.graceEndsAt})` : ''}.`,
    },
    friend: 'bạn',
    shopFallback: 'gian hàng của bạn',
    noPlans: 'Xem bảng giá đầy đủ trên website.',
    intlLocale: 'vi-VN',
    moneySeparators: VI_MONEY_SEPARATORS,
  },
  en: {
    reason: {
      [PLAN_GUIDE_REASON.REGISTERED]: () =>
        'Thank you for registering a shop on XePrime. Your shop opens as soon as a plan is paid on the website.',
      [PLAN_GUIDE_REASON.CONSULTATION]: () =>
        'XePrime has received your plan consultation request — our team will contact you shortly. Meanwhile you can review and choose a plan on the website.',
      [PLAN_GUIDE_REASON.EXPIRING]: (v) =>
        `Your plan expires on ${v.expiresAt}. Renew on the website to keep ${v.packageCommissionPercent ? `${v.packageCommissionPercent} commission` : 'your plan benefits'} on every trip.`,
      [PLAN_GUIDE_REASON.EXPIRED]: (v) =>
        `Your plan expired on ${v.expiresAt}. Renew now to avoid switching to the${v.commissionPercent ? ` ${v.commissionPercent}` : ''} per-trip service fee.`,
      [PLAN_GUIDE_REASON.GRACE]: (v) =>
        `Your plan expired on ${v.expiresAt} and is in its grace period. Renew before the grace period ends${v.graceEndsAt ? ` (${v.graceEndsAt})` : ''}.`,
    },
    friend: 'there',
    shopFallback: 'your shop',
    noPlans: 'See the full price list on the website.',
    intlLocale: 'en-GB',
    moneySeparators: { group: ',', decimal: '.' },
  },
};

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
/** Khối điều kiện `{{#name}}…{{/name}}` — chỉ giữ phần trong khi biến có giá trị (vd Hotline/Zalo). */
const SECTION_RE = /\{\{#([a-zA-Z]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

export function renderPlanGuideTemplate(
  template: PlanGuideTemplateContent,
  input: PlanGuideRenderInput,
): RenderedEmail {
  const c = COPY[input.locale];
  const formatDate = (d: Date | null): string =>
    d
      ? new Intl.DateTimeFormat(c.intlLocale, {
          dateStyle: 'long',
          timeZone: 'Asia/Ho_Chi_Minh',
        }).format(d)
      : '';
  const graceDays = input.graceDays != null && input.graceDays > 0 ? input.graceDays : null;
  const expiresAt = formatDate(input.expiresAt);
  // Hết ân hạn = ends_at + graceDays — cùng phép của `resolveEffectiveBilling` (cộng ngày tuyệt đối).
  const graceEndsAt = formatDate(
    input.expiresAt && graceDays != null
      ? graceEndsAtFor(input.expiresAt, graceDays)
      : null,
  );
  const reasonValues: ReasonValues = {
    expiresAt,
    graceEndsAt,
    commissionPercent: formatPercent(input.commissionPercent, c.intlLocale),
    packageCommissionPercent: formatPercent(input.packageCommissionPercent, c.intlLocale),
  };
  // Gốc icon PNG — chỉ http(s), không có `/` cuối để mẫu viết `{{assetBase}}/check.png`.
  // "Liên hệ tư vấn" mở Zalo admin khai (Cấu hình app Partner); chưa khai/không hợp lệ ⇒ trang hỗ trợ.
  const consultUrl = zaloHref(input.zalo) ?? safeUrl(input.contactUrl);
  const assetBase = safeUrl(input.assetBaseUrl).replace(/\/+$/, '');

  // Giá trị CHỮ (chưa escape) — subject dùng nguyên, body escape từng giá trị.
  const textValues: Record<Exclude<PlanGuidePlaceholder, 'planTable'>, string> = {
    [PLAN_GUIDE_PLACEHOLDER.RECIPIENT_NAME]: oneLine(input.recipientName) || c.friend,
    [PLAN_GUIDE_PLACEHOLDER.SHOP_NAME]: oneLine(input.shopName) || c.shopFallback,
    [PLAN_GUIDE_PLACEHOLDER.PURCHASE_URL]: safeUrl(input.purchaseUrl),
    [PLAN_GUIDE_PLACEHOLDER.ASSET_BASE]: assetBase,
    [PLAN_GUIDE_PLACEHOLDER.HOTLINE]: oneLine(input.hotline),
    [PLAN_GUIDE_PLACEHOLDER.ZALO]: oneLine(input.zalo),
    [PLAN_GUIDE_PLACEHOLDER.ZALO_URL]: consultUrl,
    [PLAN_GUIDE_PLACEHOLDER.EXPIRES_AT]: expiresAt,
    [PLAN_GUIDE_PLACEHOLDER.REMINDER_DAYS]: String(input.reminderDays),
    [PLAN_GUIDE_PLACEHOLDER.GRACE_DAYS]: graceDays == null ? '' : String(graceDays),
    [PLAN_GUIDE_PLACEHOLDER.GRACE_ENDS_AT]: graceEndsAt,
    [PLAN_GUIDE_PLACEHOLDER.COMMISSION_PERCENT]: reasonValues.commissionPercent,
    [PLAN_GUIDE_PLACEHOLDER.PACKAGE_COMMISSION_PERCENT]: reasonValues.packageCommissionPercent,
    [PLAN_GUIDE_PLACEHOLDER.REASON]: c.reason[input.reason](reasonValues),
  };
  const subjectTpl = input.locale === 'en' ? template.subjectEn : template.subjectVi;
  const rawBody = input.locale === 'en' ? template.bodyEn : template.bodyVi;
  let style: PlanTableStyle = 'outline';
  const bodyTpl = rawBody.replace(PLAN_TABLE_STYLE_RE, (_m, name: string) => {
    if ((PLAN_TABLE_STYLES as readonly string[]).includes(name)) style = name as PlanTableStyle;
    return '';
  });
  const planTable = buildPlanTableHtml(input.plans, input.locale, style, {
    purchaseUrl: safeUrl(input.purchaseUrl),
    contactUrl: consultUrl,
    assetBaseUrl: assetBase,
  });

  const hasValue = (name: string): boolean =>
    name === PLAN_GUIDE_PLACEHOLDER.PLAN_TABLE
      ? input.plans.length > 0
      : Boolean(lookup(textValues, name));
  const sections = (tpl: string): string =>
    tpl.replace(SECTION_RE, (_whole, name: string, inner: string) => (hasValue(name) ? inner : ''));

  const subject = oneLine(
    sections(subjectTpl).replace(PLACEHOLDER_RE, (whole, name: string) =>
      name === PLAN_GUIDE_PLACEHOLDER.PLAN_TABLE ? '' : (lookup(textValues, name) ?? whole),
    ),
  );
  const html = sections(bodyTpl).replace(PLACEHOLDER_RE, (whole, name: string) => {
    if (name === PLAN_GUIDE_PLACEHOLDER.PLAN_TABLE) return planTable;
    const v = lookup(textValues, name);
    return v === undefined ? whole : escapeHtml(v);
  });

  return { subject, html, text: htmlToText(html) };
}

/**
 * Kiểu thẻ của `{{planTable}}`. Mẫu chọn kiểu bằng một chú thích HTML đặt ở bất kỳ đâu trong thân:
 * `<!-- planTableStyle:elevated -->` (chú thích bị gỡ khỏi email). Không khai ⇒ `outline`.
 * Hợp đồng biến vẫn chỉ có MỘT `{{planTable}}`.
 */
export const PLAN_TABLE_STYLES = ['outline', 'elevated', 'warm', 'soft', 'premium'] as const;
export type PlanTableStyle = (typeof PLAN_TABLE_STYLES)[number];
const PLAN_TABLE_STYLE_RE = /<!--\s*planTableStyle:([a-z]+)\s*-->/g;

interface CardPalette {
  cardBg: string;
  border: string;
  recBorder: string;
  radius: number;
  shadow: string;
  /** Dải "Được đề xuất" — màu nền đặc (fallback) + gradient (client hỗ trợ). */
  ribbonBg: string;
  ribbonGradient: string;
  ribbonText: string;
  headBg: string;
  headGradient: string | null;
  name: string;
  headMuted: string;
  text: string;
  muted: string;
  price: string;
  priceUnit: string;
  divider: string;
  /** Nút của thẻ được đề xuất. */
  btnBg: string;
  btnText: string;
  /** Nút của các thẻ còn lại — viền. */
  btnOutline: string;
}

const FONT = "font-family:Arial,Helvetica,'Segoe UI',sans-serif";

/** Màu chép từ XP_TOKENS (`@xeprime/ui`) — email không đọc được CSS variable. */
const PALETTES: Readonly<Record<PlanTableStyle, CardPalette>> = {
  outline: {
    cardBg: '#ffffff', border: '#e8e4dd', recBorder: '#d6a02c', radius: 12, shadow: 'none',
    ribbonBg: '#d6a02c', ribbonGradient: 'linear-gradient(90deg,#c4920f 0%,#e9bd52 100%)',
    ribbonText: '#2a2318', headBg: '#ffffff', headGradient: null, name: '#1a1a1a',
    headMuted: '#6b6560', text: '#1a1a1a', muted: '#6b6560', price: '#a9761a', priceUnit: '#6b6560',
    divider: '#f5f3ef', btnBg: '#d6a02c', btnText: '#2a2318', btnOutline: '#d6a02c',
  },
  elevated: {
    cardBg: '#ffffff', border: '#ece8e1', recBorder: '#d6a02c', radius: 16,
    shadow: '0 10px 28px rgba(42,35,24,0.12)', ribbonBg: '#d6a02c',
    ribbonGradient: 'linear-gradient(90deg,#a9761a 0%,#d6a02c 50%,#f0c75e 100%)',
    ribbonText: '#2a2318', headBg: '#fffdf8',
    headGradient: 'linear-gradient(180deg,#fdf6e3 0%,#ffffff 100%)', name: '#1a1a1a',
    headMuted: '#6b6560', text: '#1a1a1a', muted: '#6b6560', price: '#a9761a', priceUnit: '#6b6560',
    divider: '#f5f3ef', btnBg: '#2a2318', btnText: '#f0c75e', btnOutline: '#2a2318',
  },
  warm: {
    cardBg: '#ffffff', border: '#f3dcc4', recBorder: '#e07b26', radius: 12, shadow: 'none',
    ribbonBg: '#e07b26', ribbonGradient: 'linear-gradient(90deg,#c2410c 0%,#f59e0b 100%)',
    ribbonText: '#ffffff', headBg: '#fff7ed',
    headGradient: 'linear-gradient(180deg,#ffedd5 0%,#fff7ed 100%)', name: '#1a1a1a',
    headMuted: '#7c5a3c', text: '#1a1a1a', muted: '#6b6560', price: '#c2410c', priceUnit: '#7c5a3c',
    divider: '#fbeee0', btnBg: '#e07b26', btnText: '#ffffff', btnOutline: '#e07b26',
  },
  soft: {
    cardBg: '#ffffff', border: '#efe6d2', recBorder: '#d6a02c', radius: 20, shadow: 'none',
    ribbonBg: '#d6a02c', ribbonGradient: 'linear-gradient(90deg,#e9bd52 0%,#d6a02c 100%)',
    ribbonText: '#2a2318', headBg: '#fdf6e3',
    headGradient: 'linear-gradient(160deg,#fdf6e3 0%,#f0fdf4 100%)', name: '#2a2318',
    headMuted: '#6b6560', text: '#2a2318', muted: '#6b6560', price: '#15803d', priceUnit: '#6b6560',
    divider: '#f5f3ef', btnBg: '#2a2318', btnText: '#ffffff', btnOutline: '#a9761a',
  },
  premium: {
    cardBg: '#ffffff', border: '#d4cfc6', recBorder: '#d6a02c', radius: 6, shadow: 'none',
    ribbonBg: '#d6a02c', ribbonGradient: 'linear-gradient(90deg,#a9761a 0%,#f0c75e 50%,#a9761a 100%)',
    ribbonText: '#1e1b16', headBg: '#1e1b16',
    headGradient: 'linear-gradient(160deg,#2a2318 0%,#1e1b16 100%)', name: '#ffffff',
    headMuted: '#cfc8bb', text: '#1a1a1a', muted: '#6b6560', price: '#f0c75e', priceUnit: '#cfc8bb',
    divider: '#f5f3ef', btnBg: '#d6a02c', btnText: '#1e1b16', btnOutline: '#1e1b16',
  },
};

/** Tên file icon PNG (`apps/web/public/email/`) theo loại biểu tượng bậc — cùng loại web vẽ bằng AntD. */
const TIER_ICON_FILE: Readonly<Record<PlanTierIcon, string>> = {
  [PLAN_TIER_ICON.TREND]: 'plan-trend.png',
  [PLAN_TIER_ICON.STAR]: 'plan-star.png',
  [PLAN_TIER_ICON.CROWN]: 'plan-crown.png',
};

export interface PlanTableLinks {
  purchaseUrl: string;
  contactUrl: string;
  assetBaseUrl: string;
}

/**
 * Khối bảng gói — ĐÚNG nội dung thẻ của hộp thoại "Mua / gia hạn gói" trên web, dẫn xuất bằng
 * `buildPlanPricingCards` dùng chung (bậc nào hiện, thứ tự, biểu tượng, "Được đề xuất", quyền lợi,
 * giá tiêu đề, bậc tư vấn).
 *
 * Bố cục: tối đa HAI thẻ một hàng như lưới của hộp thoại web. Mỗi hàng là MỘT bảng có một `<tr>`
 * cho từng PHẦN của thẻ (đầu · giá · quyền lợi · nút) — ô cùng phần của các thẻ cạnh nhau nằm trên
 * cùng một hàng bảng nên luôn thẳng hàng, dù thẻ có/không mô tả hay nhãn "Được đề xuất"; hàng quyền
 * lợi giãn ra, hàng nút luôn ở đáy. Viền thẻ vẽ bằng viền trái/phải của từng ô + viền trên/dưới ở
 * phần đầu/nút. Màn hẹp (`.xp-desk` ẩn, `.xp-mob` hiện — media query của mẫu) dùng bản xếp chồng
 * một thẻ một bảng; client bỏ qua media query vẫn đọc bản hai cột. Bản xếp chồng bọc giữa hai chú
 * thích `xp-mob` để bản chữ thuần không lặp nội dung.
 */
export function buildPlanTableHtml(
  plans: readonly PlanGuidePlan[],
  locale: AppLocale,
  style: PlanTableStyle = 'outline',
  links: PlanTableLinks = { purchaseUrl: '#', contactUrl: '#', assetBaseUrl: '' },
): string {
  const c = COPY[locale];
  const pal = PALETTES[style];
  const cards = buildPlanPricingCards(plans);
  if (cards.length === 0) {
    return `<p style="margin:0;${FONT};color:#6b6560;font-size:14px">${escapeHtml(c.noPlans)}</p>`;
  }
  const ctx: CardCtx = {
    locale,
    pal,
    links,
    asset: (file) => `${escapeHtml(links.assetBaseUrl)}/${file}`,
  };
  const table = (width: string, rows: string): string =>
    `<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;table-layout:fixed">${rows}</table>`;
  if (cards.length === 1) {
    // Một gói: thẻ không kéo hết bề ngang — căn giữa, rộng vừa đọc.
    return `<table role="presentation" width="340" align="center" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:340px;margin:0 auto;border-collapse:separate">${sectionRows(cards, ctx)}</table>`;
  }
  const spacer = '<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>';
  const desktop: string[] = [];
  for (let i = 0; i < cards.length; i += MAX_CARDS_PER_ROW) {
    desktop.push(table('100%', sectionRows(cards.slice(i, i + MAX_CARDS_PER_ROW), ctx, MAX_CARDS_PER_ROW)));
  }
  const mobile = cards.map((card) => table('100%', sectionRows([card], ctx)));
  return (
    `<div class="xp-desk">${desktop.join(spacer)}</div>` +
    `${MOBILE_OPEN}<div class="xp-mob" style="display:none;max-height:0;overflow:hidden;mso-hide:all">${mobile.join(spacer)}</div>${MOBILE_CLOSE}`
  );
}

/** Như lưới hộp thoại web: hai thẻ một hàng — tên/giá không bị bóp xuống dòng. */
const MAX_CARDS_PER_ROW = 2;
const MOBILE_OPEN = '<!--xp-mob-->';
const MOBILE_CLOSE = '<!--/xp-mob-->';

interface CardCtx {
  locale: AppLocale;
  pal: CardPalette;
  links: PlanTableLinks;
  asset: (file: string) => string;
}

type Section = 'head' | 'price' | 'benefits' | 'button';
const SECTIONS: readonly Section[] = ['head', 'price', 'benefits', 'button'];

/**
 * Các `<tr>` của một hàng thẻ: một hàng bảng cho mỗi phần. Ít thẻ hơn số cột ⇒ ô trống giữ độ
 * rộng (thẻ lẻ cuối danh mục không kéo hết bề ngang).
 */
function sectionRows(
  slice: readonly PlanPricingCard<PlanGuidePlan>[],
  o: CardCtx,
  cols = slice.length,
): string {
  const width = `${Math.floor(100 / cols)}%`;
  const anyRecommended = slice.some((card) => card.recommended);
  const gap = '<td width="16" style="width:16px;font-size:0;line-height:0">&nbsp;</td>';
  return SECTIONS.map((section) => {
    const cells = slice.map((card) => sectionCell(card, section, width, anyRecommended, o));
    while (cells.length < cols) {
      cells.push(`<td width="${width}" style="width:${width};font-size:0;line-height:0">&nbsp;</td>`);
    }
    return `<tr>${cells.join(gap)}</tr>`;
  }).join('');
}

function sectionCell(
  card: PlanPricingCard<PlanGuidePlan>,
  section: Section,
  width: string,
  anyRecommended: boolean,
  o: CardCtx,
): string {
  const { locale, pal } = o;
  const c = COPY[locale];
  const bw = card.recommended ? 2 : 1;
  const bc = card.recommended ? pal.recBorder : pal.border;
  const r = pal.radius;
  const pad = 18;
  const base = `width:${width};${FONT};border-left:${bw}px solid ${bc};border-right:${bw}px solid ${bc};`;

  switch (section) {
    case 'head': {
      const bgImage = pal.headGradient ? `background-image:${pal.headGradient};` : '';
      // Nhãn "Được đề xuất" nằm DƯỚI tên; thẻ cùng hàng giữ một dòng cao bằng nhau.
      const badge = card.recommended
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr><td bgcolor="${pal.ribbonBg}" style="background:${pal.ribbonBg};background-image:${pal.ribbonGradient};border-radius:999px;padding:3px 10px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;white-space:nowrap;color:${pal.ribbonText}">&#9733;&nbsp;${escapeHtml(msg(locale, 'recommendedTag'))}</td></tr></table>`
        : anyRecommended
          ? '<div style="margin-top:8px;height:22px;line-height:22px;font-size:0">&nbsp;</div>'
          : '';
      const description = card.plan.description
        ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:${pal.headMuted}">${escapeHtml(card.plan.description)}</p>`
        : '';
      return (
        `<td valign="top" bgcolor="${pal.headBg}" style="${base}background:${pal.headBg};${bgImage}border-top:${bw}px solid ${bc};border-radius:${r}px ${r}px 0 0;padding:${pad + 2}px ${pad}px 4px">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td valign="middle" width="34" style="width:34px"><img src="${o.asset(TIER_ICON_FILE[card.icon])}" width="34" height="34" alt="" style="display:block;border:0;width:34px;height:34px"></td>` +
        `<td valign="middle" style="padding-left:10px;font-size:18px;line-height:1.25;font-weight:800;color:${pal.name}">${escapeHtml(card.plan.name)}</td>` +
        `</tr></table>${badge}${description}</td>`
      );
    }
    case 'price': {
      const inner = card.headline
        ? `<span style="font-size:24px;font-weight:800;color:${pal.price};white-space:nowrap">${escapeHtml(formatMoneyVnd(card.headline.price, c.moneySeparators, ''))}</span>` +
          `<span style="font-size:13px;color:${pal.priceUnit};white-space:nowrap">&nbsp;${escapeHtml(
            card.headline.months === 1
              ? msg(locale, 'perMonth')
              : msg(locale, 'perTerm', { months: card.headline.months }),
          )}</span>`
        : `<span style="font-size:20px;font-weight:800;color:${pal.price}">${escapeHtml(msg(locale, 'contactForQuote'))}</span>`;
      return `<td valign="bottom" bgcolor="${pal.headBg}" style="${base}background:${pal.headBg};padding:12px ${pad}px 14px;line-height:1.2">${inner}</td>`;
    }
    case 'benefits': {
      const lines = card.benefits
        .map(
          (line) =>
            `<tr><td width="24" valign="top" style="width:24px;padding:4px 0"><img src="${o.asset('check.png')}" width="16" height="16" alt="&#10003;" style="display:block;border:0;width:16px;height:16px;color:${pal.recBorder};font-size:13px;font-weight:700"></td>` +
            `<td valign="top" style="padding:4px 0;font-size:13px;line-height:1.45;color:${pal.text}">${escapeHtml(benefitLabel(locale, line))}</td></tr>`,
        )
        .join('');
      return `<td valign="top" bgcolor="${pal.cardBg}" style="${base}background:${pal.cardBg};padding:12px ${pad}px 8px;border-top:1px solid ${pal.divider}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lines}</table></td>`;
    }
    case 'button': {
      const href = escapeHtml(card.selfServe ? o.links.purchaseUrl : o.links.contactUrl);
      const label = escapeHtml(
        card.selfServe ? msg(locale, 'tierSelect') : msg(locale, 'contactSales'),
      );
      const btn = card.recommended
        ? `<td align="center" bgcolor="${pal.btnBg}" style="background:${pal.btnBg};border-radius:8px"><a href="${href}" target="_blank" style="display:block;padding:12px 8px;font-size:14px;font-weight:700;line-height:18px;color:${pal.btnText};text-decoration:none;border-radius:8px">${label}</a></td>`
        : `<td align="center" bgcolor="${pal.cardBg}" style="background:${pal.cardBg};border:2px solid ${pal.btnOutline};border-radius:8px"><a href="${href}" target="_blank" style="display:block;padding:10px 8px;font-size:14px;font-weight:700;line-height:18px;color:${pal.btnOutline};text-decoration:none;border-radius:8px">${label}</a></td>`;
      return `<td valign="bottom" bgcolor="${pal.cardBg}" style="${base}background:${pal.cardBg};border-bottom:${bw}px solid ${bc};border-radius:0 0 ${r}px ${r}px;padding:8px ${pad}px ${pad}px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${btn}</tr></table></td>`;
    }
  }
}

/**
 * % hiển thị, bỏ số 0 thừa: `10%`, `7,5%` (vi) / `7.5%` (en). `null` ⇒ chuỗi rỗng (khối ẩn).
 * Đây là TỈ LỆ hiển thị, không phải tiền — không có phép tính tiền nào đi qua nó.
 */
export function formatPercent(value: number | null, intlLocale: string): string {
  if (value == null || !Number.isFinite(value)) return '';
  return `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2, useGrouping: false }).format(value)}%`;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
}

function lookup(values: Record<string, string>, name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
}

/** Bỏ xuống dòng (chống chèn header vào subject) và khoảng trắng thừa. */
function oneLine(s: string | null | undefined): string {
  return (s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Chỉ nhận http(s) — một `javascript:` trong `href` là thứ không bao giờ được rơi vào email. */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : '#';
}

function htmlToText(html: string): string {
  return html
    .replace(/<!--xp-mob-->[\s\S]*?<!--\/xp-mob-->/g, '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/(p|tr|h[1-6]|div|li)>/gi, '\n')
    .replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, '$1 ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#10003;/g, '✓')
    .replace(/&#8594;/g, '→')
    .replace(/&#9201;/g, '⏱')
    .replace(/&#9733;/g, '★')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}
