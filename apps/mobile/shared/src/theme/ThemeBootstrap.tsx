import { StatusBar } from 'react-native';
import { useAppScheme, useColors } from './ThemeProvider';

/**
 * Thanh trạng thái đi theo giao diện của app, không theo máy. Mount một lần ở layout gốc của CẢ
 * HAI app, bên trong `ThemeProvider`.
 */
export function ThemeBootstrap() {
  const { scheme } = useAppScheme();
  const colors = useColors();
  return (
    <StatusBar
      barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      backgroundColor={colors.background}
    />
  );
}
