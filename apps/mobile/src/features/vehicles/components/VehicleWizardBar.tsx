import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

const CIRCLE = 28;
/** Vạch nối giữa hai bước — mảnh như đường kẻ của `Steps`, không phải một thanh tiến độ. */
const CONNECTOR_HEIGHT = 2;
const CONNECTOR_ARROW = 12;

export interface WizardStep {
  key: string;
  /** Nhãn rút gọn — bốn bước phải vừa MỘT hàng ở 390px. */
  shortTitle: string;
}

/**
 * Thanh bước của wizard tạo xe — bản native của `<Steps>` (AntD không có bản RN).
 *
 * Số nằm TRÊN nhãn, đúng hình thái mobile của web: bốn bước xếp ngang một hàng. Chỉ bấm về bước
 * ĐÃ đi qua — nhảy tới bước sau sẽ vượt qua phần kiểm tra từng bước, mà đó chính là thứ giữ cho
 * người dùng không bị chặn ở bước cuối bởi lỗi của một ô họ chưa nhìn thấy.
 */
export function VehicleWizardBar({
  steps,
  current,
  onStepChange,
}: {
  steps: readonly WizardStep[];
  current: number;
  onStepChange: (index: number) => void;
}) {
  return (
    <XStack>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const reachable = index < current;
        const first = index === 0;
        const last = index === steps.length - 1;

        return (
          <Pressable
            key={step.key}
            onPress={reachable ? () => onStepChange(index) : undefined}
            disabled={!reachable}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !reachable }}
            accessibilityLabel={step.shortTitle}
            style={{ flex: 1 }}
          >
            <YStack ai="center" gap={2}>
              {/*
                Vòng tròn nằm GIỮA hai nửa vạch nối, không đứng trơ một mình.

                Không có vạch thì bốn vòng tròn rời rạc đọc như bốn cái nút, không ai thấy đây là
                một chặng đường có thứ tự. Vạch bên TRÁI đã tô là "đã đi qua đoạn này", nên nó tô
                tới đúng bước đang đứng; vạch bên phải chỉ tô khi bước này đã xong.

                Mũi tên đặt ở CUỐI nửa vạch phải, tức đúng ranh giới hai ô — nhìn ra nó nằm chính
                giữa khoảng trống giữa hai vòng tròn, không lệch về bên nào.
              */}
              <XStack ai="center" alignSelf="stretch" height={CIRCLE}>
                <Connector show={!first} done={index <= current} />

                <YStack
                  w={CIRCLE}
                  h={CIRCLE}
                  br={radius.pill}
                  ai="center"
                  jc="center"
                  mx={space.xs}
                  bg={active || done ? colors.primary : colors.surfaceMuted}
                >
                  <Text
                    col={active || done ? colors.onPrimary : colors.textMuted}
                    fos={fontSize.bodySm}
                    fow={fontWeight.bold}
                  >
                    {index + 1}
                  </Text>
                </YStack>

                <Connector show={!last} done={done} arrow />
              </XStack>

              <Text
                col={active ? colors.text : colors.textMuted}
                fos={fontSize.label}
                fow={active ? fontWeight.semibold : fontWeight.regular}
                numberOfLines={1}
              >
                {step.shortTitle}
              </Text>
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/**
 * Nửa vạch nối một bên của một vòng tròn.
 *
 * `show` tắt ở hai đầu dải — bước đầu không có gì ở bên trái, bước cuối không có gì ở bên phải —
 * nhưng ô rỗng vẫn CHIẾM CHỖ (`f={1}`), nếu không thì vòng tròn đầu và cuối bị kéo lệch khỏi tâm
 * ô của chúng và bốn nhãn bên dưới không còn thẳng hàng với vòng tròn của mình.
 */
function Connector({ show, done, arrow }: { show: boolean; done: boolean; arrow?: boolean }) {
  const tone = done ? colors.primary : colors.borderSubtle;

  return (
    <XStack f={1} ai="center">
      <YStack f={1} height={CONNECTOR_HEIGHT} bg={show ? tone : 'transparent'} />
      {show && arrow ? (
        <Ionicons name="chevron-forward" size={CONNECTOR_ARROW} color={tone} />
      ) : null}
    </XStack>
  );
}
