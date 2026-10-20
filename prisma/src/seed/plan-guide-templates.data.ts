/**
 * Năm BỘ MẪU email "Hướng dẫn đăng ký và gia hạn gói trên website" — dữ liệu NỀN (`SEED_MODE=system`).
 *
 * Mỗi bộ một phong cách riêng để admin chọn (`plan_guide_email_templates`, đúng MỘT bộ đang dùng),
 * và có ĐỦ bốn nội dung (PLAN_GUIDE_VARIANT: chào mừng · sắp hết hạn · hết hạn · ân hạn). Trong một
 * bộ, đầu thư/bảng gói/chân thư dùng chung; chỉ tiêu đề, lời mở, nút và màu nhấn đổi theo nội dung.
 * HTML an toàn cho email: khung 640px căn giữa, bảng lồng nhau + CSS inline, nút "bulletproof"
 * (ô bảng có nền + liên kết có padding), không flex/grid, không SVG (Gmail gỡ SVG), không CSS/JS
 * ngoài. Gradient luôn đi kèm `bgcolor`/màu nền đặc làm dự phòng cho client không hỗ trợ.
 *
 * Icon là PNG nhỏ do web phục vụ tĩnh (`apps/web/public/email/*.png`), tham chiếu bằng
 * `{{assetBase}}/<file>.png` — server điền gốc tuyệt đối (`APP_WEB_URL` + `/email`). Mỗi ảnh có
 * `alt` (hoặc `alt=""` khi chỉ trang trí) để thư vẫn đọc được khi client chặn ảnh.
 *
 * Biến `{{name}}` do server dựng và escape (xem `apps/api/src/modules/email/plan-guide-email.ts`);
 * `{{#name}}…{{/name}}` chỉ hiện khi biến có giá trị. `{{planTable}}` dựng các gói thành CỘT NGANG
 * với ĐÚNG nội dung thẻ của hộp thoại "Mua / gia hạn gói" trên web; kiểu thẻ chọn bằng chú thích
 * `<!-- planTableStyle:<kiểu> -->` (outline · elevated · warm · soft · premium). Màu lấy từ
 * XP_TOKENS (`@xeprime/ui`).
 *
 * Thuần (không DB) — seed (`plan-guide-templates.ts`) và script xem trước dùng chung.
 */

import {
  PLAN_GUIDE_VARIANT,
  PLAN_GUIDE_VARIANT_VALUES,
  type PlanGuideVariant,
} from '@xeprime/types';

interface Locale {
  subject: string;
  body: string;
}

export interface PlanGuideTemplateVariantSeed {
  vi: Locale;
  en: Locale;
}

export interface PlanGuideTemplateSeed {
  code: string;
  name: string;
  variants: Readonly<Record<PlanGuideVariant, PlanGuideTemplateVariantSeed>>;
}

// XP_TOKENS (packages/ui/src/tokens) — email không đọc được CSS variable nên chép giá trị.
const C = {
  primary: '#d6a02c',
  primaryHover: '#c4920f',
  primaryActive: '#a9761a',
  primaryLight: '#fdf6e3',
  goldBright: '#f0c75e',
  ink: '#2a2318',
  text: '#1a1a1a',
  text2: '#6b6560',
  text3: '#9e9890',
  bg: '#faf9f7',
  muted: '#f5f3ef',
  border: '#e8e4dd',
  dark: '#1e1b16',
  inverse: '#e8e4dd',
  warning: '#e07b26',
  warningDeep: '#c2410c',
  warningBg: '#fff7ed',
  success: '#16a34a',
  successBg: '#f0fdf4',
  error: '#dc2626',
  errorBg: '#fef2f2',
} as const;

const GOLD_GRADIENT = `linear-gradient(90deg,${C.primaryActive} 0%,${C.primary} 50%,${C.goldBright} 100%)`;

const FONT = "font-family:Arial,Helvetica,'Segoe UI',sans-serif";

interface Copy {
  lang: 'vi' | 'en';
  hello: string;
  help: string;
  helpText: string;
  hotline: string;
  zalo: string;
  tagline: string;
  footer: string;
}

const VI: Copy = {
  lang: 'vi',
  hello: 'Chào {{recipientName}},',
  help: 'Cần hỗ trợ chọn gói?',
  helpText: 'Đội ngũ XePrime luôn sẵn sàng tư vấn gói phù hợp với số xe của bạn.',
  hotline: 'Hotline',
  zalo: 'Zalo',
  tagline: 'Nền tảng cho thuê xe tự lái &amp; dài hạn',
  footer:
    'Gói kích hoạt tự động khi XePrime nhận đủ tiền chuyển khoản. Bạn nhận email này vì đã đăng ký hoặc đang dùng gói gian hàng trên XePrime.',
};
const EN: Copy = {
  lang: 'en',
  hello: 'Hi {{recipientName}},',
  help: 'Need help choosing?',
  helpText: 'The XePrime team is happy to recommend the plan that fits your fleet.',
  hotline: 'Hotline',
  zalo: 'Zalo',
  tagline: 'Self-drive &amp; long-term car rental platform',
  footer:
    'Your plan activates automatically once XePrime receives the full transfer. You receive this email because you registered for or use a shop plan on XePrime.',
};

/** Khung ngoài chung: preheader ẩn, nền, bảng 640px căn giữa, media query xếp chồng cột. */
function frame(o: { lang: string; bg: string; planStyle: string; inner: string }): string {
  return `<!doctype html>
<html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>XePrime</title>
<style>
:root{color-scheme:light;supported-color-schemes:light}
@media only screen and (max-width:480px){
.xp-wrap{width:100%!important}
.xp-pad{padding-left:18px!important;padding-right:18px!important}
.xp-cols,.xp-cols tbody,.xp-cols tr{display:block!important;width:100%!important}
.xp-col{display:block!important;width:100%!important;box-sizing:border-box}
.xp-gap{display:block!important;width:100%!important;height:12px!important}
.xp-h1{font-size:23px!important}
.xp-hide{display:none!important}
.xp-desk{display:none!important}
.xp-mob{display:block!important;max-height:none!important;overflow:visible!important}
}
</style></head>
<body style="margin:0;padding:0;background:${o.bg};-webkit-text-size-adjust:100%">
<!-- planTableStyle:${o.planStyle} -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">{{reason}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${o.bg}" style="background:${o.bg}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" class="xp-wrap" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;${FONT}">
${o.inner}
</table>
</td></tr>
</table>
</body></html>`;
}

/** Nút "bulletproof": ô bảng có nền đặc (+ gradient nếu client hỗ trợ) bọc liên kết có padding. */
function button(o: {
  label: string;
  bg: string;
  gradient?: string | undefined;
  color: string;
  radius: number;
  arrow?: boolean;
}): string {
  const image = o.gradient ? `background-image:${o.gradient};` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td align="center" bgcolor="${o.bg}" style="background:${o.bg};${image}border-radius:${o.radius}px;box-shadow:0 6px 16px rgba(42,35,24,0.18)">
<a href="{{purchaseUrl}}" target="_blank" style="display:inline-block;padding:16px 42px;${FONT};font-size:16px;font-weight:700;line-height:20px;color:${o.color};text-decoration:none;border-radius:${o.radius}px">${o.label}${o.arrow === false ? '' : '&nbsp;&nbsp;&#8594;'}</a>
</td></tr></table>`;
}

function spacer(h: number): string {
  return `<div style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</div>`;
}

function icon(file: string, size: number, alt = ''): string {
  return `<img src="{{assetBase}}/${file}" width="${size}" height="${size}" alt="${alt}" style="display:block;border:0;width:${size}px;height:${size}px">`;
}

/** Hàng 3 điểm nổi bật có icon — mỗi cột: icon tròn, tiêu đề, một dòng mô tả. */
function highlights(
  items: readonly (readonly [file: string, title: string, text: string])[],
  o: { title: string; text: string; align?: 'left' | 'center' },
): string {
  const align = o.align ?? 'center';
  const cells = items
    .map(
      ([file, title, text]) =>
        `<td class="xp-col" width="33%" align="${align}" valign="top" style="width:33%;padding:6px 8px;text-align:${align}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${align === 'center' ? 'align="center"' : ''}><tr><td>${icon(file, 44)}</td></tr></table>
<p style="margin:10px 0 4px;font-size:14px;line-height:1.35;font-weight:700;color:${o.title}">${title}</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${o.text}">${text}</p></td>`,
    )
    .join('');
  return `<table role="presentation" class="xp-cols" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

/** Ba bước có số trong vòng tròn màu + đường nối — chỉ là bảng, không ảnh. */
function steps(
  items: readonly string[],
  o: {
    circle: string;
    circleGradient?: string | undefined;
    number: string;
    text: string;
    line: string;
  },
): string {
  const image = o.circleGradient ? `background-image:${o.circleGradient};` : '';
  const cells = items
    .map(
      (s, i) =>
        `<td class="xp-col" width="33%" valign="top" style="width:33%;padding:0 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="40" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="40" height="40" bgcolor="${o.circle}" style="width:40px;height:40px;background:${o.circle};${image}border-radius:20px;font-size:17px;font-weight:800;line-height:40px;color:${o.number};text-align:center">${i + 1}</td></tr></table></td>
<td class="xp-hide" valign="middle" style="padding-left:8px"><div style="height:2px;line-height:2px;font-size:0;background:${i < items.length - 1 ? o.line : 'transparent'}">&nbsp;</div></td>
</tr></table>
<p style="margin:10px 0 0;font-size:13px;line-height:1.55;color:${o.text}">${s}</p></td>`,
    )
    .join('');
  return `<table role="presentation" class="xp-cols" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

/** Danh sách có dấu tích vàng (icon PNG, alt ✓). */
function checklist(items: readonly string[], color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      (s) =>
        `<tr><td width="30" valign="top" style="padding:5px 0">${icon('check.png', 20, '&#10003;')}</td><td style="padding:5px 0;font-size:14px;line-height:1.5;color:${color}">${s}</td></tr>`,
    )
    .join('')}</table>`;
}

/** Khối hỗ trợ — Hotline/Zalo (icon tròn màu) chỉ hiện khi admin đã khai. */
function support(
  c: Copy,
  o: { title: string; text: string; link: string; chipBg: string },
): string {
  const chip = (file: string, label: string, value: string, href: string | null) =>
    `<td class="xp-col" valign="middle" style="padding:6px 12px 6px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${o.chipBg}" style="background:${o.chipBg};border-radius:24px"><tr>
<td style="padding:6px 6px 6px 6px">${icon(file, 30, label)}</td>
<td style="padding:6px 16px 6px 4px;font-size:13px;line-height:1.3;color:${o.text}">${label}<br>${
      href
        ? `<a href="${href}" target="_blank" style="color:${o.link};font-weight:700;text-decoration:none;font-size:15px">${value}</a>`
        : `<strong style="color:${o.link};font-size:15px">${value}</strong>`
    }</td></tr></table></td>`;
  return `<p style="margin:0 0 4px;font-size:15px;font-weight:700;color:${o.title}">${c.help}</p>
<p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:${o.text}">${c.helpText}</p>
<table role="presentation" class="xp-cols" cellpadding="0" cellspacing="0" border="0"><tr>
{{#hotline}}${chip('phone.png', c.hotline, '{{hotline}}', 'tel:{{hotline}}')}{{/hotline}}
{{#zalo}}${chip('zalo.png', c.zalo, '{{zalo}}', '{{zaloUrl}}')}{{/zalo}}
</tr></table>`;
}

function wordmark(xe: string, prime: string, size = 20): string {
  return `<span style="font-size:${size}px;font-weight:800;letter-spacing:.5px;color:${xe}">Xe</span><span style="font-size:${size}px;font-weight:800;letter-spacing:.5px;color:${prime}">Prime</span>`;
}

/** Chân thư chung: thương hiệu + câu giới thiệu + ghi chú + bản quyền. */
function footer(
  c: Copy,
  o: { xe: string; prime: string; text: string; muted: string; rule: string },
): string {
  return `<tr><td class="xp-pad" align="center" style="padding:28px 28px 4px;text-align:center">
<div style="width:56px;height:3px;line-height:3px;font-size:0;background:${o.rule};margin:0 auto 18px">&nbsp;</div>
${wordmark(o.xe, o.prime, 18)}
<p style="margin:6px 0 12px;font-size:12px;letter-spacing:.3px;color:${o.text}">${c.tagline}</p>
<p style="margin:0 auto;max-width:480px;font-size:11px;line-height:1.7;color:${o.muted}">${c.footer}</p>
<p style="margin:10px 0 0;font-size:11px;color:${o.muted}">© XePrime</p>
</td></tr>`;
}

interface Highlights {
  items: readonly (readonly [string, string, string])[];
}

/** Lời của MỘT nội dung — dùng chung cho cả năm bộ (bộ chỉ đổi cách trình bày). */
interface VariantCopy {
  subject: string;
  /** Nhãn ngắn trên đầu thư (huy hiệu). */
  badge: string;
  headline: string;
  /** Đoạn mở — có thể chứa `{{shopName}}` / `{{expiresAt}}`. */
  lead: string;
  cta: string;
  plans: string;
  stepsTitle: string;
  steps: [string, string, string];
  /** Hành trình có icon (bộ "Thân thiện"). */
  journey: Highlights;
  keepTitle: string;
  keep: [string, string, string];
  /** Nhãn trên ngày `{{expiresAt}}` (bộ "Cảnh báo cam"). */
  deadline: string;
  tip: string;
}

/** Màu nhấn theo nội dung: chào mừng vàng, sắp hết hạn cam, hết hạn đỏ, ân hạn cam đậm. */
interface Tone {
  accent: string;
  deep: string;
  soft: string;
  onAccent: string;
}
const TONE: Readonly<Record<PlanGuideVariant, Tone>> = {
  welcome: { accent: C.primary, deep: C.primaryActive, soft: C.primaryLight, onAccent: C.ink },
  expiring: { accent: C.warning, deep: C.warningDeep, soft: C.warningBg, onAccent: '#ffffff' },
  expired: { accent: C.error, deep: '#b91c1c', soft: C.errorBg, onAccent: '#ffffff' },
  grace: { accent: C.warningDeep, deep: '#9a3412', soft: C.warningBg, onAccent: '#ffffff' },
};

const BUY_STEPS_VI: [string, string, string] = [
  'Đăng nhập trang đối tác XePrime.',
  'Chọn gói và kỳ hạn hợp với số xe.',
  'Chuyển khoản theo mã QR — gói tự kích hoạt khi tiền về.',
];
const RENEW_STEPS_VI: [string, string, string] = [
  'Đăng nhập trang đối tác XePrime.',
  'Chọn kỳ hạn gia hạn (có thể đổi bậc gói).',
  'Chuyển khoản theo mã QR — gói gia hạn tự động khi tiền về.',
];
const BUY_STEPS_EN: [string, string, string] = [
  'Sign in to the XePrime partner site.',
  'Pick the plan and term that fit your fleet.',
  'Pay via the QR transfer — the plan activates when funds arrive.',
];
const RENEW_STEPS_EN: [string, string, string] = [
  'Sign in to the XePrime partner site.',
  'Choose a renewal term (you can switch tiers).',
  'Pay via the QR transfer — the renewal applies when funds arrive.',
];
const JOURNEY_BUY_VI: Highlights = {
  items: [
    ['shop.png', '1. Chọn gói', 'Gói hợp với số xe của bạn'],
    ['shield.png', '2. Thanh toán', 'Chuyển khoản theo mã QR'],
    ['rocket.png', '3. Lên chợ', 'Gói tự kích hoạt, đăng xe ngay'],
  ],
};
const JOURNEY_RENEW_VI: Highlights = {
  items: [
    ['shop.png', '1. Chọn kỳ hạn', 'Gia hạn hoặc đổi bậc gói'],
    ['shield.png', '2. Thanh toán', 'Chuyển khoản theo mã QR'],
    ['rocket.png', '3. Chạy tiếp', 'Gói gia hạn tự động khi tiền về'],
  ],
};
const JOURNEY_BUY_EN: Highlights = {
  items: [
    ['shop.png', '1. Pick a plan', 'One that fits your fleet size'],
    ['shield.png', '2. Pay', 'Bank transfer via QR code'],
    ['rocket.png', '3. Go live', 'Activates automatically — list your cars'],
  ],
};
const JOURNEY_RENEW_EN: Highlights = {
  items: [
    ['shop.png', '1. Pick a term', 'Renew or switch tiers'],
    ['shield.png', '2. Pay', 'Bank transfer via QR code'],
    ['rocket.png', '3. Keep going', 'Renewal applies when funds arrive'],
  ],
};
const KEEP_VI: [string, string, string] = [
  'Giữ mức hoa hồng XePrime {{packageCommissionPercent}} trên mỗi chuyến',
  'Không gián đoạn công cụ quản lý đội xe',
  'Gia hạn trong vài phút, kích hoạt tự động khi tiền về',
];
const KEEP_EN: [string, string, string] = [
  'Keep {{packageCommissionPercent}} XePrime commission on every trip',
  'No interruption to your fleet tools',
  'Renew in minutes — activates automatically when paid',
];

const COPY_VI: Readonly<Record<PlanGuideVariant, VariantCopy>> = {
  welcome: {
    subject: 'Hướng dẫn đăng ký gói gian hàng trên website XePrime',
    badge: 'Chào mừng đến XePrime',
    headline: 'Đăng ký gói cho {{shopName}}',
    lead: 'Chọn gói hợp với số xe, thanh toán bằng chuyển khoản theo mã QR — gian hàng mở ngay khi XePrime nhận đủ tiền. Toàn bộ thao tác làm trên website đối tác. Gói gian hàng tính hoa hồng XePrime {{packageCommissionPercent}} mỗi chuyến{{#commissionPercent}}, thay vì phí dịch vụ {{commissionPercent}} mỗi chuyến của tuyến phí theo chuyến{{/commissionPercent}}.',
    cta: 'Chọn gói &amp; thanh toán',
    plans: 'Bảng giá gói gian hàng',
    stepsTitle: 'Chỉ ba bước',
    steps: BUY_STEPS_VI,
    journey: JOURNEY_BUY_VI,
    keepTitle: 'Gói gian hàng mang lại',
    keep: [
      'Hoa hồng XePrime {{packageCommissionPercent}} trên mỗi chuyến',
      'Lịch xe, đơn thuê, thu chi trong một nơi',
      'Kích hoạt tự động khi tiền chuyển khoản về',
    ],
    deadline: '',
    tip: 'Chỉ mất vài phút: chọn gói, chuyển khoản theo mã QR, gói tự kích hoạt khi tiền về.',
  },
  expiring: {
    subject: 'Gói của {{shopName}} sắp hết hạn — gia hạn trên XePrime',
    badge: 'Gói sắp hết hạn',
    headline: 'Gói của {{shopName}} sắp hết hạn',
    lead: 'Gói gian hàng còn chưa đầy {{reminderDays}} ngày. Gia hạn trước {{expiresAt}} để giữ mức hoa hồng {{packageCommissionPercent}} trên mỗi chuyến{{#commissionPercent}} (thay vì phí dịch vụ {{commissionPercent}} mỗi chuyến của tuyến phí theo chuyến){{/commissionPercent}} và không gián đoạn công cụ quản lý đội xe.',
    cta: 'Gia hạn gói',
    plans: 'Chọn gói để gia hạn',
    stepsTitle: 'Gia hạn trong ba bước',
    steps: RENEW_STEPS_VI,
    journey: JOURNEY_RENEW_VI,
    keepTitle: 'Gia hạn để giữ',
    keep: KEEP_VI,
    deadline: 'Hạn sử dụng gói',
    tip: 'Gia hạn sớm không mất ngày nào — kỳ mới nối tiếp ngay sau kỳ hiện tại.',
  },
  expired: {
    subject: 'Gói của {{shopName}} hết hạn hôm nay',
    badge: 'Gói hết hạn hôm nay',
    headline: 'Gói của {{shopName}} đã hết hạn hôm nay',
    lead: 'Gói gian hàng hết hạn hôm nay ({{expiresAt}}). Gian hàng đang được giữ trong thời gian ân hạn{{#graceDays}} {{graceDays}} ngày{{/graceDays}}{{#graceEndsAt}}, đến hết {{graceEndsAt}}{{/graceEndsAt}} — gia hạn ngay để tiếp tục dùng đầy đủ quyền lợi của gói.',
    cta: 'Gia hạn ngay',
    plans: 'Chọn gói để gia hạn',
    stepsTitle: 'Gia hạn trong ba bước',
    steps: RENEW_STEPS_VI,
    journey: JOURNEY_RENEW_VI,
    keepTitle: 'Gia hạn ngay để giữ',
    keep: KEEP_VI,
    deadline: 'Gói đã hết hạn ngày',
    tip: 'Thời gian ân hạn có giới hạn{{#graceEndsAt}} (đến {{graceEndsAt}}){{/graceEndsAt}} — gia hạn hôm nay để không phải chuyển sang tuyến phí theo chuyến{{#commissionPercent}} ({{commissionPercent}} mỗi chuyến){{/commissionPercent}}.',
  },
  grace: {
    subject: '{{shopName}} đang trong thời gian ân hạn — gia hạn để giữ gói',
    badge: 'Đang trong ân hạn',
    headline: '{{shopName}} đang trong thời gian ân hạn',
    lead: 'Gói gian hàng đã hết hạn ngày {{expiresAt}}. Khi thời gian ân hạn kết thúc{{#graceEndsAt}} ({{graceEndsAt}}){{/graceEndsAt}}, gian hàng sẽ chuyển sang tuyến phí theo chuyến (XePrime thu phí dịch vụ{{#commissionPercent}} {{commissionPercent}}{{/commissionPercent}} trên mỗi chuyến) và không còn công cụ quản lý nâng cao — xe của bạn vẫn hiển thị trên chợ. Gia hạn bây giờ để giữ gói.',
    cta: 'Gia hạn để giữ gói',
    plans: 'Chọn gói để gia hạn',
    stepsTitle: 'Gia hạn trong ba bước',
    steps: RENEW_STEPS_VI,
    journey: JOURNEY_RENEW_VI,
    keepTitle: 'Gia hạn trước khi hết ân hạn để giữ',
    keep: KEEP_VI,
    deadline: 'Gói đã hết hạn ngày',
    tip: 'Sau ân hạn, gian hàng tính phí{{#commissionPercent}} {{commissionPercent}}{{/commissionPercent}} theo chuyến — gia hạn bất cứ lúc nào để quay lại gói.',
  },
};

const COPY_EN: Readonly<Record<PlanGuideVariant, VariantCopy>> = {
  welcome: {
    subject: 'How to subscribe to a shop plan on the XePrime website',
    badge: 'Welcome to XePrime',
    headline: 'Choose a plan for {{shopName}}',
    lead: 'Pick the plan that fits your fleet and pay by QR bank transfer — your shop opens as soon as XePrime receives the full amount. Everything happens on the partner website. A shop plan pays {{packageCommissionPercent}} XePrime commission per trip{{#commissionPercent}}, instead of the {{commissionPercent}} per-trip service fee{{/commissionPercent}}.',
    cta: 'Choose a plan &amp; pay',
    plans: 'Shop plan pricing',
    stepsTitle: 'Just three steps',
    steps: BUY_STEPS_EN,
    journey: JOURNEY_BUY_EN,
    keepTitle: 'A shop plan gives you',
    keep: [
      '{{packageCommissionPercent}} XePrime commission on every trip',
      'Calendar, bookings and finances in one place',
      'Automatic activation when your transfer lands',
    ],
    deadline: '',
    tip: 'It takes minutes: pick a plan, pay via QR transfer, and it activates when the funds arrive.',
  },
  expiring: {
    subject: 'The {{shopName}} plan expires soon — renew on XePrime',
    badge: 'Plan expiring soon',
    headline: 'The {{shopName}} plan expires soon',
    lead: 'Your shop plan has less than {{reminderDays}} days left. Renew before {{expiresAt}} to keep {{packageCommissionPercent}} commission on every trip{{#commissionPercent}} (instead of the {{commissionPercent}} per-trip service fee){{/commissionPercent}} and uninterrupted fleet tools.',
    cta: 'Renew plan',
    plans: 'Pick a plan to renew',
    stepsTitle: 'Renew in three steps',
    steps: RENEW_STEPS_EN,
    journey: JOURNEY_RENEW_EN,
    keepTitle: 'Renew to keep',
    keep: KEEP_EN,
    deadline: 'Plan valid until',
    tip: 'Renewing early loses no days — the new term starts right after the current one.',
  },
  expired: {
    subject: 'The {{shopName}} plan expires today',
    badge: 'Plan expires today',
    headline: 'The {{shopName}} plan expired today',
    lead: 'Your shop plan expired today ({{expiresAt}}). Your shop is held in a grace period{{#graceDays}} of {{graceDays}} days{{/graceDays}}{{#graceEndsAt}}, until {{graceEndsAt}}{{/graceEndsAt}} — renew now to keep every plan benefit.',
    cta: 'Renew now',
    plans: 'Pick a plan to renew',
    stepsTitle: 'Renew in three steps',
    steps: RENEW_STEPS_EN,
    journey: JOURNEY_RENEW_EN,
    keepTitle: 'Renew now to keep',
    keep: KEEP_EN,
    deadline: 'Plan expired on',
    tip: 'The grace period is limited{{#graceEndsAt}} (until {{graceEndsAt}}){{/graceEndsAt}} — renew today to avoid moving to the per-trip track{{#commissionPercent}} ({{commissionPercent}} per trip){{/commissionPercent}}.',
  },
  grace: {
    subject: '{{shopName}} is in its grace period — renew to keep your plan',
    badge: 'In grace period',
    headline: '{{shopName}} is in its grace period',
    lead: 'Your shop plan expired on {{expiresAt}}. When the grace period ends{{#graceEndsAt}} ({{graceEndsAt}}){{/graceEndsAt}}, your shop moves to the per-trip track (XePrime charges a{{#commissionPercent}} {{commissionPercent}}{{/commissionPercent}} service fee on every trip) and loses the advanced management tools — your vehicles stay listed on the marketplace. Renew now to keep your plan.',
    cta: 'Renew to keep my plan',
    plans: 'Pick a plan to renew',
    stepsTitle: 'Renew in three steps',
    steps: RENEW_STEPS_EN,
    journey: JOURNEY_RENEW_EN,
    keepTitle: 'Renew before the grace period ends to keep',
    keep: KEEP_EN,
    deadline: 'Plan expired on',
    tip: 'After the grace period your shop pays{{#commissionPercent}} {{commissionPercent}}{{/commissionPercent}} per trip — renew any time to return to a plan.',
  },
};

/** Huy hiệu nhỏ mang màu của nội dung. */
function badge(text: string, tone: Tone): string {
  return `<span style="display:inline-block;background:${tone.accent};color:${tone.onAccent};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:5px 14px;border-radius:14px">${text}</span>`;
}

interface DesignInput {
  c: Copy;
  v: VariantCopy;
  tone: Tone;
  variant: PlanGuideVariant;
}

// ── 1. Tối giản — nền trắng, viền mảnh, dải màu mảnh trên đầu ────────────────

function cleanMinimal({ c, v, tone, variant }: DesignInput, why: Highlights): string {
  const stripe = variant === PLAN_GUIDE_VARIANT.WELCOME ? `background-image:${GOLD_GRADIENT};` : '';
  return frame({
    lang: c.lang,
    bg: '#ffffff',
    planStyle: 'outline',
    inner: `<tr><td height="4" bgcolor="${tone.accent}" style="height:4px;line-height:4px;font-size:0;background:${tone.accent};${stripe}border-radius:2px">&nbsp;</td></tr>
<tr><td class="xp-pad" style="padding:22px 24px 18px;border-bottom:1px solid ${C.border}">${wordmark(C.primary, C.text)}</td></tr>
<tr><td class="xp-pad" style="padding:32px 24px 8px">
<p style="margin:0 0 12px">${badge(v.badge, tone)}</p>
<h1 class="xp-h1" style="margin:0 0 18px;font-size:27px;line-height:1.3;font-weight:800;color:${C.text}">${v.headline}</h1>
<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:${C.text}">${c.hello}</p>
<p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:${C.text2}">${v.lead}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px"><tr><td style="padding:18px 8px">
${highlights(why.items, { title: C.text, text: C.text2 })}
</td></tr></table>
${spacer(30)}
<p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${tone.deep}">${v.plans}</p>
{{planTable}}
${spacer(32)}
${button({ label: v.cta, bg: tone.accent, gradient: variant === PLAN_GUIDE_VARIANT.WELCOME ? GOLD_GRADIENT : undefined, color: tone.onAccent, radius: 8 })}
${spacer(34)}
</td></tr>
<tr><td class="xp-pad" style="padding:24px;border-top:1px solid ${C.border}">
${support(c, { title: C.text, text: C.text2, link: C.primaryActive, chipBg: C.bg })}
</td></tr>
${footer(c, { xe: C.primary, prime: C.text, text: C.text2, muted: C.text3, rule: C.border })}`,
  });
}

// ── 2. Thẻ gói — băng đầu tối, ba bước, thẻ nổi ────────────────────────────

function planCards({ c, v, tone }: DesignInput): string {
  return frame({
    lang: c.lang,
    bg: C.muted,
    planStyle: 'elevated',
    inner: `<tr><td class="xp-pad" align="center" bgcolor="${C.ink}" style="background:${C.ink};background-image:linear-gradient(135deg,${C.dark} 0%,${C.ink} 55%,${tone.deep} 100%);border-radius:18px 18px 0 0;padding:34px 32px 38px;text-align:center">
${wordmark(C.goldBright, '#ffffff', 24)}
<p style="margin:22px 0 10px">${badge(v.badge, tone)}</p>
<h1 class="xp-h1" style="margin:0 0 12px;font-size:29px;line-height:1.25;font-weight:800;color:#ffffff">${v.headline}</h1>
<p style="margin:0 auto;max-width:460px;font-size:15px;line-height:1.6;color:${C.inverse}">${c.lang === 'vi' ? 'Hoa hồng XePrime {{packageCommissionPercent}} trên mỗi chuyến · Quản lý đội xe đầy đủ' : '{{packageCommissionPercent}} XePrime commission per trip · Full fleet management'}</p>
</td></tr>
<tr><td class="xp-pad" bgcolor="#ffffff" style="background:#ffffff;padding:28px 32px 8px">
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${C.text}">${c.hello}</p>
<p style="margin:0;font-size:15px;line-height:1.7;color:${C.text2}">${v.lead}</p>
</td></tr>
<tr><td class="xp-pad" bgcolor="#ffffff" style="background:#ffffff;padding:26px 24px 10px">
<p style="margin:0 0 14px 8px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.text3}">${v.stepsTitle}</p>
${steps(v.steps, { circle: tone.accent, circleGradient: tone.accent === C.primary ? GOLD_GRADIENT : undefined, number: tone.onAccent, text: C.text2, line: C.border })}
</td></tr>
<tr><td class="xp-pad" bgcolor="${tone.soft}" style="background:${tone.soft};background-image:linear-gradient(180deg,#ffffff 0%,${tone.soft} 22%);padding:30px 18px">
{{planTable}}
</td></tr>
<tr><td class="xp-pad" bgcolor="#ffffff" style="background:#ffffff;padding:30px 32px 36px;border-radius:0 0 18px 18px">
${button({ label: v.cta, bg: C.ink, color: C.goldBright, radius: 28 })}
</td></tr>
<tr><td class="xp-pad" style="padding:26px 32px 0">
${support(c, { title: C.text, text: C.text2, link: C.primaryActive, chipBg: '#ffffff' })}
</td></tr>
${footer(c, { xe: C.primary, prime: C.text, text: C.text2, muted: C.text3, rule: tone.accent })}`,
  });
}

// ── 3. Cảnh báo cam — băng màu gradient, đồng hồ, hạn dùng nổi bật ─────────

function alertBanner({ c, v, tone }: DesignInput): string {
  return frame({
    lang: c.lang,
    bg: C.bg,
    planStyle: 'warm',
    inner: `<tr><td class="xp-pad" style="padding:0 24px 16px">${wordmark(C.primary, C.text)}</td></tr>
<tr><td class="xp-pad" bgcolor="${tone.accent}" style="background:${tone.accent};background-image:linear-gradient(120deg,${tone.deep} 0%,${tone.accent} 60%,${tone.accent === C.primary ? C.goldBright : '#f59e0b'} 100%);border-radius:14px 14px 0 0;padding:26px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="64" valign="middle">${icon('clock.png', 52, '&#9201;')}</td>
<td valign="middle" style="padding-left:14px">
<p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff">${v.badge}</p>
<p class="xp-h1" style="margin:6px 0 0;font-size:24px;line-height:1.25;font-weight:800;color:#ffffff">${v.headline}</p>
${v.deadline ? `{{#expiresAt}}<p style="margin:8px 0 0;font-size:14px;color:#ffffff">${v.deadline} <strong>{{expiresAt}}</strong></p>{{/expiresAt}}` : ''}
</td></tr></table>
</td></tr>
<tr><td class="xp-pad" bgcolor="#ffffff" style="background:#ffffff;padding:28px 28px 8px;border-left:1px solid ${C.border};border-right:1px solid ${C.border}">
<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:${C.text}">${c.hello}</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;font-weight:700;color:${C.text}">${v.lead}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${tone.soft}" style="background:${tone.soft};border-left:4px solid ${tone.accent};border-radius:10px"><tr><td style="padding:16px 18px">
<p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:${tone.deep}">${v.keepTitle}</p>
${checklist(v.keep, C.text)}
</td></tr></table>
${spacer(26)}
${button({ label: v.cta, bg: tone.accent, gradient: `linear-gradient(90deg,${tone.deep} 0%,${tone.accent} 100%)`, color: tone.onAccent, radius: 10 })}
${spacer(32)}
<p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${tone.deep}">${v.plans}</p>
{{planTable}}
${spacer(24)}
</td></tr>
<tr><td class="xp-pad" bgcolor="${C.muted}" style="background:${C.muted};border-radius:0 0 14px 14px;padding:22px 28px">
${support(c, { title: C.text, text: C.text2, link: tone.deep, chipBg: '#ffffff' })}
</td></tr>
${footer(c, { xe: C.primary, prime: C.text, text: C.text2, muted: C.text3, rule: tone.accent })}`,
  });
}

// ── 4. Thân thiện — nền kem, bo tròn lớn, hành trình ba bước ───────────────

function friendly({ c, v, tone, variant }: DesignInput, sign: string): string {
  const heroIcon = variant === PLAN_GUIDE_VARIANT.WELCOME ? 'gift.png' : 'clock.png';
  return frame({
    lang: c.lang,
    bg: C.primaryLight,
    planStyle: 'soft',
    inner: `<tr><td align="center" style="padding:4px 0 20px">${wordmark(C.primaryActive, C.ink, 24)}</td></tr>
<tr><td class="xp-pad" bgcolor="#ffffff" style="background:#ffffff;border-radius:28px;padding:0 0 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${tone.soft}" style="background:${tone.soft};background-image:linear-gradient(160deg,${C.primaryLight} 0%,${variant === PLAN_GUIDE_VARIANT.WELCOME ? C.successBg : tone.soft} 100%);border-radius:28px 28px 0 0;padding:34px 28px 26px;text-align:center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>${icon(heroIcon, 64)}</td></tr></table>
<p style="margin:14px 0 0">${badge(v.badge, tone)}</p>
<h1 class="xp-h1" style="margin:12px 0 10px;font-size:27px;line-height:1.3;font-weight:800;color:${C.ink}">${v.headline}</h1>
<p style="margin:0 auto;max-width:470px;font-size:15px;line-height:1.7;color:${C.text}">${c.hello}</p>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="xp-pad" style="padding:24px 32px 0">
<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:${C.text2}">${v.lead}</p>
${highlights(v.journey.items, { title: C.ink, text: C.text2 })}
${spacer(28)}
<p style="margin:0 0 14px;font-size:18px;font-weight:800;color:${C.ink}">${v.plans}</p>
{{planTable}}
${spacer(28)}
${button({ label: v.cta, bg: variant === PLAN_GUIDE_VARIANT.WELCOME ? C.ink : tone.accent, color: '#ffffff', radius: 28 })}
${spacer(14)}
<p style="margin:0;text-align:center;font-size:13px;line-height:1.6;color:${C.text2}">${v.tip}</p>
${spacer(26)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};border-radius:18px"><tr><td style="padding:18px 20px">
${support(c, { title: C.ink, text: C.text2, link: C.primaryActive, chipBg: '#ffffff' })}
</td></tr></table>
<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:${C.ink}">${sign}</p>
</td></tr></table>
</td></tr>
${footer(c, { xe: C.primaryActive, prime: C.ink, text: C.text2, muted: C.text2, rule: tone.accent })}`,
  });
}

// ── 5. Cao cấp — băng tối, viền vàng, vương miện ───────────────────────────

function premiumBrand({ c, v, tone }: DesignInput, promise: Highlights): string {
  const pills = promise.items
    .map(
      ([file, title, text]) =>
        `<td class="xp-col" width="33%" align="center" valign="top" style="width:33%;padding:16px 8px;border-top:1px solid #3a342a;text-align:center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>${icon(file, 40)}</td></tr></table>
<p style="margin:10px 0 2px;font-size:13px;font-weight:700;letter-spacing:.3px;color:${C.goldBright}">${title}</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${C.inverse}">${text}</p></td>`,
    )
    .join('');
  return frame({
    lang: c.lang,
    bg: '#efece6',
    planStyle: 'premium',
    inner: `<tr><td height="5" bgcolor="${tone.accent}" style="height:5px;line-height:5px;font-size:0;background:${tone.accent};${tone.accent === C.primary ? `background-image:${GOLD_GRADIENT};` : ''}">&nbsp;</td></tr>
<tr><td class="xp-pad" align="center" bgcolor="${C.dark}" style="background:${C.dark};background-image:linear-gradient(180deg,${C.dark} 0%,${C.ink} 100%);padding:40px 40px 0;text-align:center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>${icon('plan-crown.png', 52)}</td></tr></table>
<p style="margin:16px 0 0">${wordmark(C.primary, '#ffffff', 30)}</p>
<p style="margin:8px 0 0;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:${C.text3}">${c.tagline}</p>
<div style="width:56px;height:2px;line-height:2px;font-size:0;background:${C.primary};margin:24px auto">&nbsp;</div>
<p style="margin:0 0 14px">${badge(v.badge, tone)}</p>
<h1 class="xp-h1" style="margin:0 0 30px;font-size:29px;line-height:1.3;font-weight:400;color:#ffffff">${v.headline}</h1>
<table role="presentation" class="xp-cols" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${pills}</tr></table>
</td></tr>
<tr><td class="xp-pad" bgcolor="#ffffff" style="background:#ffffff;padding:36px 36px 8px">
<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:${C.text}">${c.hello}</p>
<p style="margin:0 0 30px;font-size:15px;line-height:1.8;color:${C.text2}">${v.lead}</p>
<p style="margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${C.primaryActive}">${v.plans}</p>
{{planTable}}
${spacer(34)}
${button({ label: v.cta, bg: C.primary, gradient: GOLD_GRADIENT, color: C.dark, radius: 3 })}
${spacer(36)}
</td></tr>
<tr><td class="xp-pad" bgcolor="${C.bg}" style="background:${C.bg};padding:24px 36px;border-top:1px solid ${C.border}">
${support(c, { title: C.text, text: C.text2, link: C.primaryActive, chipBg: '#ffffff' })}
</td></tr>
<tr><td height="5" bgcolor="${C.dark}" style="height:5px;line-height:5px;font-size:0;background:${C.dark}">&nbsp;</td></tr>
${footer(c, { xe: C.primaryActive, prime: C.dark, text: C.text2, muted: C.text2, rule: C.primary })}`,
  });
}

const WHY_VI: Highlights = {
  items: [
    [
      'percent.png',
      '{{packageCommissionPercent}} hoa hồng',
      'Hoa hồng XePrime trên mỗi chuyến của gói gian hàng',
    ],
    ['car.png', 'Quản lý đội xe', 'Lịch xe, đơn thuê, thu chi trong một nơi'],
    ['bolt.png', 'Kích hoạt tự động', 'Gói mở ngay khi tiền chuyển khoản về'],
  ],
};
const WHY_EN: Highlights = {
  items: [
    [
      'percent.png',
      '{{packageCommissionPercent}} commission',
      'XePrime commission per trip on a shop plan',
    ],
    ['car.png', 'Fleet management', 'Calendar, bookings and finances in one place'],
    ['bolt.png', 'Instant activation', 'Your plan opens as soon as the transfer lands'],
  ],
};
const PROMISE_VI: Highlights = {
  items: [
    ['percent.png', '{{packageCommissionPercent}} hoa hồng', 'Trên mỗi chuyến'],
    ['car.png', 'Quản lý trọn vẹn', 'Đội xe, đơn thuê, thu chi'],
    ['bolt.png', 'Kích hoạt tự động', 'Ngay khi tiền về'],
  ],
};
const PROMISE_EN: Highlights = {
  items: [
    ['percent.png', '{{packageCommissionPercent}} commission', 'On every trip'],
    ['car.png', 'Complete management', 'Fleet, bookings, finances'],
    ['bolt.png', 'Automatic activation', 'As soon as funds arrive'],
  ],
};

type Design = (vi: DesignInput, en: DesignInput) => { vi: string; en: string };

function buildSet(code: string, name: string, design: Design): PlanGuideTemplateSeed {
  const variants = {} as Record<PlanGuideVariant, PlanGuideTemplateVariantSeed>;
  for (const variant of PLAN_GUIDE_VARIANT_VALUES) {
    const tone = TONE[variant];
    const vi: DesignInput = { c: VI, v: COPY_VI[variant], tone, variant };
    const en: DesignInput = { c: EN, v: COPY_EN[variant], tone, variant };
    const body = design(vi, en);
    variants[variant] = {
      vi: { subject: COPY_VI[variant].subject, body: body.vi },
      en: { subject: COPY_EN[variant].subject, body: body.en },
    };
  }
  return { code, name, variants };
}

export const PLAN_GUIDE_TEMPLATE_SEEDS: readonly PlanGuideTemplateSeed[] = [
  buildSet('clean_minimal', 'Tối giản', (vi, en) => ({
    vi: cleanMinimal(vi, WHY_VI),
    en: cleanMinimal(en, WHY_EN),
  })),
  buildSet('plan_cards', 'Thẻ gói', (vi, en) => ({ vi: planCards(vi), en: planCards(en) })),
  buildSet('reminder_urgent', 'Cảnh báo cam', (vi, en) => ({
    vi: alertBanner(vi),
    en: alertBanner(en),
  })),
  buildSet('friendly_onboarding', 'Thân thiện', (vi, en) => ({
    vi: friendly(vi, 'Thân mến,<br><strong>Đội ngũ XePrime</strong>'),
    en: friendly(en, 'Warm regards,<br><strong>The XePrime team</strong>'),
  })),
  buildSet('premium_brand', 'Cao cấp', (vi, en) => ({
    vi: premiumBrand(vi, PROMISE_VI),
    en: premiumBrand(en, PROMISE_EN),
  })),
];
