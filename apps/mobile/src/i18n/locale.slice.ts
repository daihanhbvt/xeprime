import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { getLocales } from 'expo-localization';
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/i18n/config';

/**
 * Ngôn ngữ máy đọc được ĐỒNG BỘ, nên lần render đầu đã đúng với người dùng mới. Lựa chọn đã
 * lưu (đọc bất đồng bộ từ SecureStore) ghi đè sau đó một nhịp — đổi cách này thì phải chặn
 * render cho tới khi đọc xong, và người dùng thấy màn trắng.
 */
function deviceLocale(): AppLocale {
  const [first] = getLocales();
  return isAppLocale(first?.languageCode) ? first.languageCode : DEFAULT_LOCALE;
}

interface LocaleState {
  current: AppLocale;
}

const localeSlice = createSlice({
  name: 'locale',
  initialState: (): LocaleState => ({ current: deviceLocale() }),
  reducers: {
    localeChanged(state, action: PayloadAction<AppLocale>) {
      state.current = action.payload;
    },
  },
});

export const { localeChanged } = localeSlice.actions;
export const localeReducer = localeSlice.reducer;
