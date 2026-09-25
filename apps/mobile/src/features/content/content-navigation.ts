import { isLegalDoc, legalPath, type LegalDoc } from '@xeprime/domain';

/**
 * Luật điều hướng cho MỌI trang NỘI DUNG mà app đọc từ web — hàm THUẦN, không biết gì về
 * `WebView`.
 *
 * ## Vì sao chỉ còn MỘT luật
 *
 * Ba khu `/about`, `/legal*` và `/support` từng có ba cách xử lý khác nhau, và mỗi lần thêm một
 * lối đi là một lần phải nhớ sửa đủ ba chỗ. Ngày 24/09/2026 người dùng chốt: cả ba đều đọc từ web
 * (chúng đổi theo CHÍNH SÁCH, không theo bản app), nên chúng là MỘT khu nội dung — đi lại giữa
 * chúng là chuyện bình thường và ở lại trong cùng một bộ đọc.
 *
 * Chỉ những đích KHÔNG phải nội dung mới rời WebView: ba màn đó là thao tác thật của app (wizard
 * đăng xe, tìm xe, khu quản lý) và bản web của chúng không dùng được trong app.
 *
 * ## Vì sao tách khỏi component
 *
 * Đây là chỗ một lỗi im lặng đã xảy ra: bản đầu chỉ bắt `/support`, nên hai CTA của trang giới
 * thiệu rơi vào nhánh CHẶN — WebView không đi, app cũng không đi, người dùng bấm mà **không có
 * phản hồi nào**. Không có gì đỏ lên: một hàm trả `false` trông y hệt một quyết định đúng.
 */

/** Đường dẫn của từng trang nội dung trên web. Đoạn TĨNH, không tham số. */
export const CONTENT_PATH = {
  ABOUT: '/about',
  SUPPORT: '/support',
  LEGAL: legalPath.index,
} as const;

/** Màn NATIVE mà một liên kết rời WebView để mở. */
export const CONTENT_NATIVE_TARGET = {
  LIST_YOUR_VEHICLE: 'listYourVehicle',
  SEARCH: 'search',
  MANAGE: 'manage',
} as const;

export type ContentNativeTarget =
  (typeof CONTENT_NATIVE_TARGET)[keyof typeof CONTENT_NATIVE_TARGET];

/**
 * Quyết định cho một lượt điều hướng trong WebView.
 *
 * - `{ kind: 'native', target }` — rời WebView, mở màn thật của app;
 * - `{ kind: 'webview' }` — đi tiếp trong chính WebView này;
 * - `{ kind: 'block' }` — chặn.
 */
export type ContentNavigation =
  | { kind: 'native'; target: ContentNativeTarget }
  | { kind: 'webview' }
  | { kind: 'block' };

/**
 * Mọi mẫu neo vào RANH GIỚI đoạn đường dẫn (`/`, `?`, `#`, hết chuỗi), KHÔNG `includes(...)`.
 *
 * `includes('/support')` cũng khớp `/legal/support-policy`, và bắt nhầm nó là kéo người đọc ra
 * khỏi văn bản họ đang mở. Cùng lý do cho `/search`: `/legal/search-terms` không phải trang tìm xe.
 */
function boundary(path: string): RegExp {
  return new RegExp(`${path}(?:[/?#]|$)`);
}

const ABOUT_PATTERN = boundary(CONTENT_PATH.ABOUT);
const SUPPORT_PATTERN = boundary(CONTENT_PATH.SUPPORT);
const LEGAL_PATTERN = boundary(CONTENT_PATH.LEGAL);

/**
 * Đích NATIVE xét TRƯỚC: một đích có màn thật không bao giờ được rơi xuống nhánh chặn, và
 * `/search` cũng không được để WebView tự mở một trang tìm kiếm thứ hai bên trong app.
 *
 * `/manage` là cổng khu quản lý — bản web của nó đòi đăng nhập bằng session cookie mà app không
 * có, nên để nó chạy trong WebView là bày ra một màn đăng nhập thứ hai cho người ĐÃ đăng nhập.
 */
const NATIVE_PATTERNS: readonly { pattern: RegExp; target: ContentNativeTarget }[] = [
  { pattern: boundary('/list-your-vehicle'), target: CONTENT_NATIVE_TARGET.LIST_YOUR_VEHICLE },
  { pattern: boundary('/search'), target: CONTENT_NATIVE_TARGET.SEARCH },
  { pattern: boundary('/manage'), target: CONTENT_NATIVE_TARGET.MANAGE },
];

export function contentNavigation(url: string): ContentNavigation {
  const native = NATIVE_PATTERNS.find(({ pattern }) => pattern.test(url));
  if (native) return { kind: 'native', target: native.target };

  if (ABOUT_PATTERN.test(url) || SUPPORT_PATTERN.test(url) || LEGAL_PATTERN.test(url)) {
    return { kind: 'webview' };
  }

  /*
   * Còn lại thì CHẶN. Cho phép mọi liên kết là dựng một bản web đầy đủ bên trong app, nơi nút
   * lui của app không hiểu người dùng đang ở đâu.
   */
  return { kind: 'block' };
}

/** Trang nội dung mà một địa chỉ đang trỏ tới — dùng cho TIÊU ĐỀ thanh đầu màn. */
export type ContentPage =
  | { kind: 'about' }
  | { kind: 'support' }
  | { kind: 'legalIndex' }
  | { kind: 'legalDoc'; doc: LegalDoc };

/** Đoạn `/legal/<slug>` trong một địa chỉ. Chỉ nhận slug kebab-case nên không cần giải mã URL. */
const LEGAL_DOC_PATTERN = /\/legal\/([a-z0-9-]+)(?:[/?#]|$)/;

/**
 * `null` = địa chỉ không phải trang nội dung nào (địa chỉ trung gian, hoặc một cú chuyển vừa bị
 * chặn). Người gọi GIỮ tiêu đề đang có thay vì xoá trắng nó.
 *
 * Vì sao cần: từ 23/09/2026 web có cặp trước/sau, bộ chuyển văn bản và mục lục ngay trong trang,
 * nên người đọc đi giữa các trang mà không rời màn. Một tiêu đề lấy từ tham số route sẽ đứng
 * nguyên: người ta đọc "Chính sách bảo mật" dưới thanh đầu màn ghi "Điều khoản sử dụng" — với văn
 * bản pháp lý thì đó không phải lỗi thẩm mỹ, nó trả lời sai câu "tôi đang đồng ý với văn bản nào".
 */
export function contentPage(url: string): ContentPage | null {
  if (ABOUT_PATTERN.test(url)) return { kind: 'about' };
  if (SUPPORT_PATTERN.test(url)) return { kind: 'support' };

  if (!LEGAL_PATTERN.test(url)) return null;

  const slug = LEGAL_DOC_PATTERN.exec(url)?.[1];
  /*
   * Slug lạ rơi về CHỈ MỤC, không đoán: một địa chỉ `/legal/gi-do` chỉ có thể là trang 404 của
   * web, và thanh đầu màn thà nói "Văn bản pháp lý" còn hơn nói tên một văn bản không nằm dưới nó.
   */
  return slug && isLegalDoc(slug) ? { kind: 'legalDoc', doc: slug } : { kind: 'legalIndex' };
}
