import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { customerTripTimeline, type CustomerTripStage } from '@xeprime/types';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

const DOT = 24;

/**
 * Dòng thời gian của khách — ĐÚNG hai mốc.
 *
 * "Đã giao xe" / "Đang thuê" là **trạng thái hiện tại**, không phải mốc thứ ba: thêm mốc nghĩa
 * là dòng thời gian dài ra theo tiến trình vận hành và không còn nằm gọn một hàng trên màn
 * 390px. Việc quyết định có dựng hay không thuộc `customerTripTimeline` (`@xeprime/types`) —
 * chuyến chưa duyệt và các kết cục hỏng KHÔNG có dòng thời gian, vì đánh dấu bất kỳ mốc nào ở
 * đó cũng là nói dối.
 */
export function TripTimeline({ stage }: { stage: CustomerTripStage }) {
  const t = useTranslations('Trips.timeline');
  const state = customerTripTimeline(stage);

  if (!state.visible) return null;

  return (
    <XStack
      ai="center"
      accessibilityRole="progressbar"
      accessibilityLabel={state.completedDone ? t('ariaDone') : t('ariaPending')}
    >
      <Step label={t('confirmed')} done={state.confirmedDone} />
      <YStack f={1} height={2} bg={state.completedDone ? colors.success : colors.borderSubtle} />
      <Step label={t('completed')} done={state.completedDone} />
    </XStack>
  );
}

function Step({ label, done }: { label: string; done: boolean }) {
  return (
    <YStack ai="center" gap={space.xs} width={96}>
      <YStack
        w={DOT}
        h={DOT}
        br={DOT / 2}
        bg={done ? colors.success : colors.surfaceMuted}
        bw={1}
        bc={done ? colors.success : colors.border}
        ai="center"
        jc="center"
      >
        <Ionicons
          name={done ? 'checkmark' : 'ellipse-outline'}
          size={14}
          color={done ? colors.textInverse : colors.placeholder}
        />
      </YStack>
      <Text
        col={done ? colors.text : colors.textMuted}
        fos={fontSize.label}
        fow={done ? fontWeight.semibold : fontWeight.regular}
        ta="center"
      >
        {label}
      </Text>
    </YStack>
  );
}
