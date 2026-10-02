import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_LOCALE, type AppLocale } from '@/i18n/config';

/**
 * Ngôn ngữ mở app là `vi`, KHÔNG theo ngôn ngữ của MÁY (28/09/2026).
 *
 * Trước đó app đọc `expo-localization` và chỉ rơi về `vi` khi máy không phải vi/en — nên một
 * máy đặt tiếng Anh (mặc định của emulator, và của khá nhiều máy bán ra) mở app là ra tiếng
 * Anh, trong khi CÙNG người dùng đó mở web lại ra tiếng Việt: web không hỏi trình duyệt, nó
 * mặc định `vi` và chỉ đọc cookie `XP_LOCALE` (ADR 0012). Hai client trả lời khác nhau cho
 * cùng một câu hỏi là lỗi, và bản đúng là bản của web.
 *
 * LỰA CHỌN của người dùng vẫn thắng: `I18nProvider` đọc `SECURE_KEY.LOCALE` ngay sau lần render
 * đầu rồi ghi đè. Giá trị ở đây chỉ dành cho khung hình đầu tiên, khi chưa ai chọn gì.
 */

interface LocaleState {
  current: AppLocale;
}

const localeSlice = createSlice({
  name: 'locale',
  initialState: (): LocaleState => ({ current: DEFAULT_LOCALE }),
  reducers: {
    localeChanged(state, action: PayloadAction<AppLocale>) {
      state.current = action.payload;
    },
  },
});

export const { localeChanged } = localeSlice.actions;
export const localeReducer = localeSlice.reducer;
