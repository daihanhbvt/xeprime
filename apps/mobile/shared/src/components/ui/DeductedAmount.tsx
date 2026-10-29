import { isPositiveMoney } from '@xeprime/domain';
import { Text } from 'tamagui';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight } from '@/theme/tokens';

/**
 * Một khoản TRỪ khỏi tiền chủ xe (hoa hồng `H`, thuế `T` — ADR 0064) — bản native của
 * `DeductedAmount` web: số DƯƠNG trên dây, hiện kèm dấu trừ và màu khoản trừ. Bằng 0 (hoặc không
 * dương) thì hiện mờ, không dấu: "không bị trừ gì" không phải một khoản trừ. So trên CHUỖI (ADR 0007).
 */
export function DeductedAmount({
  value,
  emphasis = false,
  size = fontSize.bodySm,
}: {
  value: string | null | undefined;
  /** Đậm chữ — trong bảng/sổ, nơi khoản trừ phải bắt mắt giữa các cột tiền. */
  emphasis?: boolean;
  size?: number;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  if (!isPositiveMoney(value)) {
    return (
      <Text col={colors.placeholder} fos={size}>
        {fmt.money('0')}
      </Text>
    );
  }
  return (
    <Text col={colors.danger} fos={size} fow={emphasis ? fontWeight.semibold : undefined}>
      {`−${fmt.money(value)}`}
    </Text>
  );
}
