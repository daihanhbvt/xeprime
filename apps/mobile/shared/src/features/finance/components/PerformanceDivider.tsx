import { YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';

/** Figma "Hiệu suất kinh doanh": các dòng cách nhau 12, giữa là một vạch 1px `stroke/gray-low`. */
export const PERFORMANCE_LIST_GAP = 12;

export function PerformanceDivider() {
  const colors = useColors();
  return <YStack h={1} bg={colors.border} />;
}
