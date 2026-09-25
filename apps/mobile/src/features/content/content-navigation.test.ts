import { LEGAL_DOC } from '@xeprime/domain';
import {
  contentNavigation,
  contentPage,
  CONTENT_NATIVE_TARGET,
} from './content-navigation';

const WEB = 'https://xeprime.vn';

/**
 * Ba khu nội dung (`/about`, `/legal*`, `/support`) đọc từ web và đi lại được giữa nhau; chỉ ba
 * đích có màn THẬT của app mới rời WebView.
 *
 * Bài này là thứ đỏ lên nếu web thêm một đích mới mà app quên khai — đúng chỗ một lỗi im lặng đã
 * xảy ra: bản đầu chỉ bắt `/support`, nên hai CTA của trang giới thiệu rơi vào nhánh CHẶN và
 * người dùng bấm mà không có phản hồi nào.
 */
describe('contentNavigation', () => {
  describe('đi tiếp TRONG WebView', () => {
    it('cả ba khu nội dung và các neo của chúng', () => {
      expect(contentNavigation(`${WEB}/about`)).toEqual({ kind: 'webview' });
      expect(contentNavigation(`${WEB}/about#about-money`)).toEqual({ kind: 'webview' });
      expect(contentNavigation(`${WEB}/support`)).toEqual({ kind: 'webview' });
      expect(contentNavigation(`${WEB}/support#support-topics`)).toEqual({ kind: 'webview' });
      expect(contentNavigation(`${WEB}/legal`)).toEqual({ kind: 'webview' });
      expect(contentNavigation(`${WEB}/legal/terms`)).toEqual({ kind: 'webview' });
      expect(contentNavigation(`${WEB}/legal/terms#section-3`)).toEqual({ kind: 'webview' });
    });
  });

  describe('đích có màn NATIVE — rời WebView', () => {
    it('“Đăng xe cho thuê” mở wizard đăng xe', () => {
      expect(contentNavigation(`${WEB}/list-your-vehicle`)).toEqual({
        kind: 'native',
        target: CONTENT_NATIVE_TARGET.LIST_YOUR_VEHICLE,
      });
    });

    it('“Tìm xe” mở màn tìm kiếm', () => {
      expect(contentNavigation(`${WEB}/search`)).toEqual({
        kind: 'native',
        target: CONTENT_NATIVE_TARGET.SEARCH,
      });
    });

    /** Bản web của khu quản lý đòi session cookie mà app không có. */
    it('khu quản lý mở khu quản lý NATIVE, không phải màn đăng nhập thứ hai', () => {
      expect(contentNavigation(`${WEB}/manage/login`)).toEqual({
        kind: 'native',
        target: CONTENT_NATIVE_TARGET.MANAGE,
      });
      expect(contentNavigation(`${WEB}/manage`).kind).toBe('native');
    });

    it('nhận ra đích dù có query hoặc hash', () => {
      expect(contentNavigation(`${WEB}/search?provinceCode=79`).kind).toBe('native');
      expect(contentNavigation(`${WEB}/list-your-vehicle?from=about`).kind).toBe('native');
    });
  });

  describe('CHẶN', () => {
    /**
     * Cho phép mọi liên kết là dựng một bản web đầy đủ bên trong app, nơi nút lui của app không
     * hiểu người dùng đang ở đâu.
     */
    it('phần còn lại của chợ xe và tên miền lạ', () => {
      expect(contentNavigation(`${WEB}/`)).toEqual({ kind: 'block' });
      expect(contentNavigation(`${WEB}/listings/abc`)).toEqual({ kind: 'block' });
      expect(contentNavigation(`${WEB}/shops/gara-abc`)).toEqual({ kind: 'block' });
      expect(contentNavigation('https://example.com/phishing')).toEqual({ kind: 'block' });
    });

    /** `includes('/legal')` cũ cho một tên miền lạ lọt vào chỉ vì có chữ đó trong đường dẫn. */
    it('KHÔNG lọt vì đường dẫn chỉ CHỨA tên một khu nội dung', () => {
      expect(contentNavigation('https://example.com/not-legal/terms')).toEqual({ kind: 'block' });
      expect(contentNavigation(`${WEB}/legalese`)).toEqual({ kind: 'block' });
      expect(contentNavigation(`${WEB}/aboutus`)).toEqual({ kind: 'block' });
    });
  });

  /**
   * Neo vào RANH GIỚI đoạn đường dẫn, không `includes(...)`.
   *
   * `includes('/support')` cũng khớp `/legal/support-policy`, và `includes('/search')` khớp
   * `/legal/search-terms` — bắt nhầm là kéo người đọc ra khỏi văn bản họ đang mở, giữa chừng một
   * điều khoản.
   */
  it('KHÔNG bắt nhầm một đoạn đường dẫn chỉ CHỨA tên đích', () => {
    expect(contentNavigation(`${WEB}/legal/support-policy`)).toEqual({ kind: 'webview' });
    expect(contentNavigation(`${WEB}/legal/search-terms`)).toEqual({ kind: 'webview' });
  });
});

/**
 * Thanh đầu màn phải nói tên trang ĐANG HIỆN. Từ 23/09/2026 web có cặp trước/sau, bộ chuyển văn
 * bản và mục lục ngay trong trang, nên người đọc đi giữa các trang mà không rời màn — một tiêu đề
 * lấy từ tham số route sẽ đứng nguyên, và người ta đọc "Chính sách bảo mật" dưới dòng chữ "Điều
 * khoản sử dụng".
 */
describe('contentPage', () => {
  it('đọc ra đúng trang', () => {
    expect(contentPage(`${WEB}/about`)).toEqual({ kind: 'about' });
    expect(contentPage(`${WEB}/about#about-how`)).toEqual({ kind: 'about' });
    expect(contentPage(`${WEB}/support`)).toEqual({ kind: 'support' });
    expect(contentPage(`${WEB}/legal`)).toEqual({ kind: 'legalIndex' });
  });

  it('đọc ra đúng VĂN BẢN pháp lý, kể cả khi mang neo hoặc tham số', () => {
    expect(contentPage(`${WEB}/legal/${LEGAL_DOC.TERMS}`)).toEqual({
      kind: 'legalDoc',
      doc: LEGAL_DOC.TERMS,
    });
    expect(contentPage(`${WEB}/legal/${LEGAL_DOC.MARKETPLACE_RULES}`)).toEqual({
      kind: 'legalDoc',
      doc: LEGAL_DOC.MARKETPLACE_RULES,
    });
    expect(contentPage(`${WEB}/legal/${LEGAL_DOC.PRIVACY}#muc-2`)).toEqual({
      kind: 'legalDoc',
      doc: LEGAL_DOC.PRIVACY,
    });
  });

  /** Slug lạ chỉ có thể là trang 404 của web — thà nói "Văn bản pháp lý" còn hơn nói tên sai. */
  it('slug không thuộc bộ bốn văn bản rơi về CHỈ MỤC, không đoán', () => {
    expect(contentPage(`${WEB}/legal/gi-do`)).toEqual({ kind: 'legalIndex' });
    expect(contentPage(`${WEB}/legal/TERMS`)).toEqual({ kind: 'legalIndex' });
  });

  /** `null` = giữ nguyên tiêu đề đang có, không xoá trắng nó. */
  it('địa chỉ không phải trang nội dung trả null', () => {
    expect(contentPage('about:blank')).toBeNull();
    expect(contentPage(`${WEB}/listings/abc`)).toBeNull();
  });
});
