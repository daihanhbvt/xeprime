import { useFonts } from 'expo-font';

// `import` chứ không `require`: cùng quy ước với `src/assets.ts`, và Metro vẫn nội suy được
// đường dẫn lúc build. Kiểu khai ở `global.d.ts`.
import BeVietnamPro_400Regular from '../../assets/fonts/BeVietnamPro_400Regular.ttf';
import BeVietnamPro_500Medium from '../../assets/fonts/BeVietnamPro_500Medium.ttf';
import BeVietnamPro_600SemiBold from '../../assets/fonts/BeVietnamPro_600SemiBold.ttf';
import BeVietnamPro_700Bold from '../../assets/fonts/BeVietnamPro_700Bold.ttf';
import PlayfairDisplay_700Bold from '../../assets/fonts/PlayfairDisplay_700Bold.ttf';

/**
 * Chữ của app — CÙNG hai họ font với `apps/web`.
 *
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
  body: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  display: 'PlayfairDisplay_700Bold',
} as const;

/**
 * Nạp font ở root. KHÔNG chặn render: chưa nạp xong thì React Native rơi về font hệ thống, chữ
 * hiện ngay rồi đổi mặt khi font sẵn sàng.
 *
 * Chặn render bằng splash để tránh cú đổi mặt đó là đánh đổi sai: nó biến một nhấp nháy 200ms
 * thành một màn trắng 200ms, và trên máy yếu thì lâu hơn hẳn.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    PlayfairDisplay_700Bold,
  });

  return loaded;
}
