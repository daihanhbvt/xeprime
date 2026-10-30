import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { customerTripTimeline, type CustomerTripStage } from '@xeprime/types';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, market, radius, space } from '@/theme/tokens';

// Nhỏ gọn khi nằm trong thanh trên (người dùng chốt 28/10/2026).
const DOT = 18;

/**
 * Dòng thời gian của khách — ĐÚNG hai mốc.
 *
 * "Đã giao xe" / "Đang thuê" là **trạng thái hiện tại**, không phải mốc thứ ba: thêm mốc nghĩa
 * là dòng thời gian dài ra theo tiến trình vận hành và không còn nằm gọn một hàng trên màn
 * 390px. Việc quyết định có dựng hay không thuộc `customerTripTimeline` (`@xeprime/types`) —
 * chuyến chưa duyệt và các kết cục hỏng KHÔNG có dòng thời gian, vì đánh dấu bất kỳ mốc nào ở
 * đó cũng là nói dối.
 */
export function TripTimeline({
  stage,
  bare = false,
}: {
  stage: CustomerTripStage;
  /** Không khung thẻ — đặt trong thanh trên (`AppHeader.below`) như dải bước của các màn chuyến khác. */
  bare?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.timeline');
  const state = customerTripTimeline(stage);

  if (!state.visible) return null;

  // Khuôn dải bước của app (người dùng chốt 28/10/2026): chấm có viền, tích TRẮNG trên nền XANH LÁ,
  // đường nối nằm đúng tâm chấm; nhãn hàng dưới, hai đầu canh mép.
  return (
    <YStack
      {...(bare
        ? {}
        : { p: space.md, br: radius.card, bw: 1, bc: colors.border, bg: colors.surface })}
      accessibilityRole="progressbar"
      accessibilityLabel={state.completedDone ? t('ariaDone') : t('ariaPending')}
    >
      {/* Chấm + nhãn CÙNG MỘT HÀNG, đường nối ở giữa hai cặp (người dùng chốt 28/10/2026). */}
      <XStack ai="center" gap={space.xs}>
        <Dot done={state.confirmedDone} current={!state.confirmedDone} />
        <StepLabel label={t('confirmed')} on={state.confirmedDone} />
        <YStack
          f={1}
          h={2}
          mx={space.xs}
          br={radius.pill}
          bg={state.confirmedDone ? colors.success : colors.border}
        />
        <Dot done={state.completedDone} current={state.confirmedDone && !state.completedDone} />
        <StepLabel label={t('completed')} on={state.completedDone} />
      </XStack>
    </YStack>
  );
}

function Dot({ done, current }: { done: boolean; current: boolean }) {
  const colors = useColors();
  return (
    <YStack
      w={DOT}
      h={DOT}
      br={radius.pill}
      ai="center"
      jc="center"
      bw={1}
      bc={done || current ? colors.success : colors.border}
      bg={done ? colors.success : current ? colors.successSurface : colors.surface}
    >
      {done ? (
        <Ionicons name="checkmark" size={12} color={market.onDark} />
      ) : (
        <YStack w={6} h={6} br={radius.pill} bg={current ? colors.success : colors.border} />
      )}
    </YStack>
  );
}

function StepLabel({ label, on }: { label: string; on: boolean }) {
  const colors = useColors();
  return (
    <Text
      col={on ? colors.text : colors.textMuted}
      fos={fontSize.label}
      fow={on ? fontWeight.semibold : fontWeight.regular}
    >
      {label}
    </Text>
  );
}
