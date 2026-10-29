import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, market, radius, space } from '@/theme/tokens';

/** Các chặng của một chuyến từ phía khách — ADR 0044: yêu cầu → duyệt → giữ chỗ → đơn thuê. */
// Ba chặng như web #230 — bỏ "Chọn chuyến": chuyến chọn ở thẻ đặt xe của trang xe, không phải một bước.
export type BookingJourneyStage = 'request' | 'payment' | 'confirmed';

/**
 * Các chặng của luồng ĐẶT HỘ (gian hàng lập đơn tay). Không có duyệt, không có giữ chỗ: người bấm
 * là chính gian hàng, và đơn ra đời ngay lúc bấm tạo — nên chỉ có ba chặng.
 */
export type StaffJourneyStage = 'trip' | 'review' | 'created';

const STAFF_STAGES: readonly StaffJourneyStage[] = ['trip', 'review', 'created'];

type BookingJourneyProps =
  | {
      audience?: 'customer';
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
    }
  | {
      /** Luồng đặt hộ của gian hàng — cùng hình thái thanh, chặng riêng (web `audience="staff"`). */
      audience: 'staff';
      current: StaffJourneyStage;
      variant?: 'card' | 'inline';
    };

/** Chặng + nhãn đã dịch — phần khác nhau giữa hai đối tượng, còn lại dựng chung. */
interface JourneyStep {
  key: string;
  label: string;
}

/** Danh sách chặng, chặng đang đứng và cờ hoàn tất — MỘT phép dựng cho cả hai khuôn. */
function useJourneySteps(props: BookingJourneyProps): {
  steps: JourneyStep[];
  currentIndex: number;
  complete: boolean;
} {
  const t = useTranslations('BookingRequests.flow');
  const tStaff = useTranslations('BookingRequests.staffFlow');
  if (props.audience === 'staff') {
    const steps = STAFF_STAGES.map((stage) => ({ key: stage, label: tStaff(`journey.${stage}`) }));
    return {
      steps,
      currentIndex: steps.findIndex((step) => step.key === props.current),
      complete: false,
    };
  }
  const stages: BookingJourneyStage[] = props.hasHoldStage
    ? ['request', 'payment', 'confirmed']
    : ['request', 'confirmed'];
  const steps = stages.map((stage) => ({ key: stage, label: t(`journey.steps.${stage}`) }));
  // Chặng không có trên thanh (vd 'payment' của chuyến không thu trước) ⇒ đứng ở chặng đầu.
  const currentKey = stages.includes(props.current) ? props.current : 'request';
  const complete = props.complete ?? false;
  return {
    steps,
    currentIndex: complete ? steps.length - 1 : steps.findIndex((step) => step.key === currentKey),
    complete,
  };
}

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
export function BookingJourney(props: BookingJourneyProps) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const { steps, currentIndex, complete } = useJourneySteps(props);
  if (props.variant === 'inline') {
    return <InlineJourney steps={steps} currentIndex={currentIndex} complete={complete} />;
  }
  const caption = steps[currentIndex]!;

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
          total: steps.length,
          label: caption.label,
        })}
      </Text>
      <XStack ai="center">
        {steps.map((step, index) => {
          const done = complete || index < currentIndex;
          const active = !complete && index === currentIndex;
          const reached = done || active;
          return (
            <XStack key={step.key} ai="center" f={index === steps.length - 1 ? 0 : 1}>
              <YStack
                w={DOT}
                h={DOT}
                br={radius.pill}
                ai="center"
                jc="center"
                bg={reached ? colors.primary : colors.surfaceMuted}
                accessible
                accessibilityLabel={done ? `${step.label} ${t('stepDone')}` : step.label}
                accessibilityState={{ selected: active }}
              >
                {done ? (
                  <Ionicons name="checkmark" size={iconSize.xs} color={market.onDark} />
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
              {index < steps.length - 1 ? (
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
  steps,
  currentIndex,
  complete,
}: {
  steps: JourneyStep[];
  currentIndex: number;
  complete: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const caption = steps[currentIndex]!;

  /*
   * Figma "List - MB" (người dùng chốt 28/10/2026): "Bước n / N · Chặng" rồi MỘT HÀNG vạch ngang chia
   * đều — vạch đã đi qua và vạch đang đứng tô vàng, vạch chưa tới xám.
   */
  return (
    <YStack gap={space.sm} accessibilityLabel={t('journey.label')}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('journey.caption', {
          current: currentIndex + 1,
          total: steps.length,
          label: caption.label,
        })}
      </Text>
      <XStack gap={space.sm}>
        {steps.map((step, index) => {
          const reached = complete || index <= currentIndex;
          return (
            <YStack
              key={step.key}
              f={1}
              h={4}
              br={radius.pill}
              bg={reached ? colors.primary : colors.border}
              accessible
              accessibilityLabel={complete || index < currentIndex ? `${step.label} ${t('stepDone')}` : step.label}
              accessibilityState={{ selected: !complete && index === currentIndex }}
            />
          );
        })}
      </XStack>
    </YStack>
  );
}
