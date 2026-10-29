import type { ReactNode } from 'react';
import { TamaguiProvider, Theme } from 'tamagui';
import { tamaguiConfig } from './tamagui.config';
import { ThemeProvider, useAppScheme } from './ThemeProvider';

/**
 * Gói giao diện cho layout gốc của CẢ HAI app: giữ lựa chọn sáng/tối và đưa nó vào Tamagui.
 * `<Theme>` (chứ không chỉ `defaultTheme`) vì `defaultTheme` chỉ đọc một lần lúc mount.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <SchemeTheme>{children}</SchemeTheme>
      </TamaguiProvider>
    </ThemeProvider>
  );
}

function SchemeTheme({ children }: { children: ReactNode }) {
  const { scheme } = useAppScheme();
  return <Theme name={scheme}>{children}</Theme>;
}
