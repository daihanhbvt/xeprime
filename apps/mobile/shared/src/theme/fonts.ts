import { useFonts } from 'expo-font';
import { Platform } from 'react-native';

// `import` chứ không `require`: cùng quy ước với `src/assets.ts`, và Metro vẫn nội suy được
// đường dẫn lúc build. Kiểu khai ở `global.d.ts`.
import GoogleSansFlex_400Regular from '../../assets/fonts/GoogleSansFlex_400Regular.ttf';
import GoogleSansFlex_500Medium from '../../assets/fonts/GoogleSansFlex_500Medium.ttf';
import GoogleSansFlex_600SemiBold from '../../assets/fonts/GoogleSansFlex_600SemiBold.ttf';
import GoogleSansFlex_700Bold from '../../assets/fonts/GoogleSansFlex_700Bold.ttf';

/**
 * Chữ của app — CÙNG họ font với `apps/web`: **Google Sans Flex**, họ chữ DUY NHẤT của design v2
 * (biến Figma `font-googlesan`, ADR 0062; web nạp qua `next/font` ở `app/layout.tsx`). Chuyển từ Be
 * Vietnam Pro + Playfair ngày 20/11/2026 (người dùng báo chữ app khác Figma, câu "Bạn đã nhớ ra mật
 * khẩu? Quay lại đăng nhập!" tràn hàng vì Be Vietnam Pro rộng hơn). Bốn file tĩnh 400/500/600/700
 * tải từ Google Fonts (OFL); bộ ký tự có đủ chữ Việt (thiếu glyph nào, ví dụ "₫", máy tự lấy từ font
 * hệ thống). `display` không còn là Playfair - web cũng đã bỏ (bí danh về cùng họ chữ).
 *
 * Ghi chú lịch sử (Be Vietnam Pro):
 * `packages/ui` đã khai `--xp-font-family` (Be Vietnam Pro) và `--xp-font-family-display`
 * (Playfair Display) từ đầu, web dùng cả hai, còn native thì rơi về `'System'`. Đó là lý do
 * duy nhất khiến app trông như một sản phẩm khác với web dù dùng chung mọi token màu.
 *
 * File `.ttf` nằm ngay trong `assets/fonts/`, KHÔNG qua `@expo-google-fonts/*`. Package đó
 * xuất một barrel `index.js` require **cả 36 weight** (kể cả italic), và Metro trong monorepo
 * pnpm không giải được đường dẫn asset xuyên qua lớp symlink của `.pnpm` — bundle chết ở
 * `Unable to resolve ./100Thin_Italic/…ttf` dù file có thật. Chép 5 file cần dùng vào repo vừa
 * hết lỗi, vừa bỏ được hai dependency, vừa không kéo 31 face không ai dùng vào bundle.
 */
export const FONT_FAMILY = {
  body: 'GoogleSansFlex_400Regular',
  medium: 'GoogleSansFlex_500Medium',
  semibold: 'GoogleSansFlex_600SemiBold',
  bold: 'GoogleSansFlex_700Bold',
  /** Tiêu đề kiểu "display" - web v2 gộp về cùng họ chữ (Playfair đã bỏ), dùng mặt Bold. */
  display: 'GoogleSansFlex_700Bold',
  /**
   * Font MẶC ĐỊNH CỦA MÁY — không phải một file `.ttf` nào trong repo.
   *
   * Tên họ chữ khác nhau theo nền tảng và không có tên chung: iOS nhận bí danh `'System'`
   * (San Francisco), còn Android thì `'System'` KHÔNG phải một họ đã đăng ký — tên thật của
   * mặt chữ mặc định là `'sans-serif'` (Roboto). Gõ một trong hai ở chỗ dùng là đúng ở một máy
   * và rơi về mặc định ngầm ở máy kia.
   *
   * Có khe này để chỗ cần font hệ thống gọi tên nó, thay vì rải chuỗi trần kèm `Platform.select`
   * ở từng component.
   */
  system: Platform.select({ ios: 'System', default: 'sans-serif' }),
} as const;

/**
 * Font còn được NHÚNG vào bản build qua config plugin `expo-font` (`app.json` của hai app). Lý do:
 * chỉ nạp lúc chạy thì Android đo ô chữ bằng font hệ thống ở khung hình đầu và KHÔNG đo lại khi
 * font của app (rộng hơn font hệ thống) về — nhãn tab mất chữ, nút "Đăng nhập" cụt thành "Đăng", reload mới
 * hết. Nhúng sẵn thì Android có font từ khung hình đầu (họ chữ = tên file, khớp `FONT_FAMILY`).
 * iOS đăng ký font nhúng theo tên PostScript nên VẪN cần lượt nạp dưới đây cho các bí danh này.
 *
 * Nạp font ở root. KHÔNG chặn render: chưa nạp xong thì React Native rơi về font hệ thống, chữ
 * hiện ngay rồi đổi mặt khi font sẵn sàng.
 *
 * Chặn render bằng splash để tránh cú đổi mặt đó là đánh đổi sai: nó biến một nhấp nháy 200ms
 * thành một màn trắng 200ms, và trên máy yếu thì lâu hơn hẳn.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    GoogleSansFlex_400Regular,
    GoogleSansFlex_500Medium,
    GoogleSansFlex_600SemiBold,
    GoogleSansFlex_700Bold,
  });

  return loaded;
}
