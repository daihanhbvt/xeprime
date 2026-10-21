import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/** Các chặng của một chuyến từ phía khách — ADR 0044: yêu cầu → duyệt → giữ chỗ → đơn thuê. */
export type BookingJourneyStage = 'trip' | 'request' | 'payment' | 'confirmed';

/** Đường kính viên số — vừa một chữ số hoặc dấu tích ở cỡ nhãn. */
const DOT = 24;

/**
 * Tiến trình CẢ HÀNH TRÌNH đặt xe — "Bước 2 / 4 · Gửi yêu cầu", bản native của `BookingJourney`
 * bên web (#205).
 *
 * Kể đủ các chặng tới lúc có đơn thuê, dù luồng này chỉ chứa hai chặng đầu: khách cần biết gửi
 * xong chưa phải là xong — còn chờ chủ xe nhận và trả tiền giữ chỗ. Không có khoản thu trước
 * (`hasHoldStage = false`) thì không có chặng "Thanh toán giữ chỗ" — vẽ nó ra là hứa một bước
 * không bao giờ tới (ADR 0044 điều 4).
 *
 * Bước bằng lái nằm GIỮA hai chặng nên thanh vẫn đứng ở "Chọn chuyến" — không phải ai cũng đi qua
 * nó, nên nó không bao giờ là một chặng riêng. Cùng luật với web.
 */
export function BookingJourney({
  current,
  hasHoldStage,
  complete = false,
  variant = 'card',
}: {
  current: BookingJourneyStage;
  hasHoldStage: boolean;
  /**
   * Cả hành trình đã xong (chuyến đã xác nhận) ⇒ MỌI chặng mang dấu tích, kể cả chặng cuối — cùng
   * prop `complete` của web. Thiếu nó thì "Đã xác nhận" vẫn là "đang ở bước này", đọc như còn việc.
   */
  complete?: boolean;
  /**
   * `inline` — đúng khuôn web ở đầu các màn chuyến (`TripPageHeader.aside`): câu "Bước n / N · …"
   * rồi các viên tròn viền 24 nối nhau không vạch. `card` (mặc định) là thẻ của luồng đặt xe.
   */
  variant?: 'card' | 'inline';
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  if (variant === 'inline') {
    return <InlineJourney current={current} hasHoldStage={hasHoldStage} complete={complete} />;
  }
  const stages: BookingJourneyStage[] = hasHoldStage
    ? ['trip', 'request', 'payment', 'confirmed']
    : ['trip', 'request', 'confirmed'];
  const currentStage = stages.includes(current) ? current : 'trip';
  const currentIndex = complete ? stages.length - 1 : stages.indexOf(currentStage);
  const captionStage = complete ? stages[stages.length - 1]! : currentStage;

  return (
    <YStack
      gap={space.sm}
      px={space.md}
      py={space.sm}
      br={radius.lg}
      bw={1}
      bc={colors.borderSubtle}
      bg={colors.surface}
      accessibilityLabel={t('journey.label')}
    >
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {t('journey.caption', {
          current: currentIndex + 1,
          total: stages.length,
          label: t(`journey.steps.${captionStage}`),
        })}
      </Text>
      <XStack ai="center">
        {stages.map((stage, index) => {
          const done = complete || index < currentIndex;
          const active = !complete && index === currentIndex;
          const reached = done || active;
          return (
            <XStack key={stage} ai="center" f={index === stages.length - 1 ? 0 : 1}>
              <YStack
                w={DOT}
                h={DOT}
                br={radius.pill}
                ai="center"
                jc="center"
                bg={reached ? colors.primary : colors.surfaceMuted}
                accessible
                accessibilityLabel={
                  done
                    ? `${t(`journey.steps.${stage}`)} ${t('stepDone')}`
                    : t(`journey.steps.${stage}`)
                }
                accessibilityState={{ selected: active }}
              >
                {done ? (
                  <Ionicons name="checkmark" size={iconSize.xs} color={colors.onPrimary} />
                ) : (
                  <Text
                    col={active ? colors.onPrimary : colors.textMuted}
                    fos={fontSize.label}
                    fow={fontWeight.bold}
                  >
                    {index + 1}
                  </Text>
                )}
              </YStack>
              {index < stages.length - 1 ? (
                <YStack f={1} h={2} mx={space.xs} bg={done ? colors.primary : colors.border} />
              ) : null}
            </XStack>
          );
        })}
      </XStack>
    </YStack>
  );
}

/** Khuôn `inline` — `BookingJourney.module.css` web: chưa tới viền xám, đang đứng viền vàng nền vàng nhạt, xong nền vàng. */
function InlineJourney({
  current,
  hasHoldStage,
  complete,
}: {
  current: BookingJourneyStage;
  hasHoldStage: boolean;
  complete: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const stages: BookingJourneyStage[] = hasHoldStage
    ? ['trip', 'request', 'payment', 'confirmed']
    : ['trip', 'request', 'confirmed'];
  const currentStage = stages.includes(current) ? current : 'trip';
  const currentIndex = complete ? stages.length - 1 : stages.indexOf(currentStage);
  const captionStage = complete ? stages[stages.length - 1]! : currentStage;

  return (
    <XStack ai="center" gap={space.md} flexWrap="wrap" accessibilityLabel={t('journey.label')}>
      <Text col={colors.textMuted} fos={fontSize.body}>
        {t('journey.caption', {
          current: currentIndex + 1,
          total: stages.length,
          label: t(`journey.steps.${captionStage}`),
        })}
      </Text>
      <XStack ai="center" gap={space.md}>
        {stages.map((stage, index) => {
          const done = complete || index < currentIndex;
          const active = !complete && index === currentIndex;
          return (
            <YStack
              key={stage}
              w={DOT}
              h={DOT}
              br={radius.pill}
              bw={1}
              bc={done || active ? colors.primary : colors.border}
              bg={done ? colors.primary : active ? colors.surfaceSelected : colors.surface}
              ai="center"
              jc="center"
              accessible
              accessibilityLabel={
                done
                  ? `${t(`journey.steps.${stage}`)} ${t('stepDone')}`
                  : t(`journey.steps.${stage}`)
              }
              accessibilityState={{ selected: active }}
            >
              {done ? (
                <Ionicons name="checkmark" size={iconSize.xs} color={colors.onPrimary} />
              ) : (
                <Text
                  col={active ? colors.primaryHover : colors.placeholder}
                  fos={fontSize.bodySm}
                  fow={fontWeight.semibold}
                >
                  {index + 1}
                </Text>
              )}
            </YStack>
          );
        })}
      </XStack>
    </XStack>
  );
}
