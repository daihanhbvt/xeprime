/**
 * CLAUDE.md §9 — ngày giờ đi qua MỘT cửa.
 *
 * `packages/domain/src/datetime.ts` là chỗ duy nhất `dayjs.extend(utc/timezone)`, và cũng là chỗ
 * duy nhất định nghĩa hai chiều quy đổi của một ô chọn ngày giờ:
 *
 *   - `toAppTz(iso)`            — mốc UTC từ API  → giờ hiển thị `Asia/Ho_Chi_Minh`;
 *   - `appWallClockToIso(value)` — giờ người dùng vừa chọn → mốc UTC gửi lên API.
 *
 * Một `import dayjs from 'dayjs'` trong mã sản phẩm vừa đặt cược vào THỨ TỰ NẠP module để có
 * plugin (`.tz()` nổ nếu module datetime chưa được nạp trước), vừa là lối vào quen thuộc của
 * `dayjs()` giờ MÁY — đúng món nợ mà đợt 03/09/2026 dọn đi, và là lý do `ci.yml` từng phải ghim
 * `TZ` để che.
 *
 * `allowTypeImports` mở: `import type { Dayjs } from 'dayjs'` không kéo theo runtime nào và
 * không mở đường cho giờ máy. Test được miễn — chúng cố tình dựng mốc ở nhiều múi giờ khác nhau.
 */
export const noDirectDayjsImport = {
  ignores: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'dayjs',
            message:
              "CLAUDE.md §9: lấy dayjs từ '@xeprime/domain' (hoặc '@/lib/datetime' ở apps/web) — nơi nạp plugin utc/timezone và nơi có toAppTz / appWallClockToIso.",
            allowTypeImports: true,
          },
        ],
        patterns: [
          {
            // CHỈ `plugin/*`: `dayjs.extend` là trạng thái TOÀN CỤC, nạp rải rác thì hành vi
            // của `.tz()` phụ thuộc thứ tự import. `dayjs/locale/*` thì không — đó là dữ liệu
            // ngôn ngữ cho Ant Design (`app/providers.tsx`) và không đụng gì tới múi giờ.
            group: ['dayjs/plugin/*'],
            message:
              'CLAUDE.md §9: plugin dayjs chỉ được nạp ở packages/domain/src/datetime.ts — nạp thêm chỗ khác là đặt cược vào thứ tự import.',
            allowTypeImports: true,
          },
        ],
      },
    ],
  },
};

export default [noDirectDayjsImport];
