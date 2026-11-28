import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import type { WizardStep } from './VehicleWizardBar';

/** Figma "Status Labels" (`24486:108047`): ba vạch cao 4 cách nhau 10, nhãn dưới vạch cách 4. */
const BAR_HEIGHT = 4;
const BAR_GAP = 10;
const LABEL_GAP = 4;

/**
 * Thanh đầu wizard thêm xe - Figma Thêm xe MB (`24486:108037`): ← + "Thêm xe mới" + "Bước x/3" (14
 * medium `text/brand/high`), dưới là ba vạch tiến độ kèm nhãn bước. Vạch đã tới/đang ở = vàng
 * `shape/primary`, chưa tới = `shape/gray-100`; nhãn bước đang mở đậm `text/gray/medium`, còn lại
 * `text/gray/very-low`.
 *
 * Chỉ bấm về bước ĐÃ đi qua - nhảy tới bước sau sẽ vượt qua phần kiểm tra từng bước (như
 * `VehicleWizardBar` cũ).
 */
export const CreateWizardHeader = memo(function CreateWizardHeader({
  title,
  steps,
  current,
  onStepChange,
  onBack,
}: {
  title: string;
  steps: readonly WizardStep[];
  current: number;
  onStepChange: (index: number) => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.appCreate');
  return (
    <PageTopBar
      title={title}
      onBack={onBack}
      actions={
        <Text
          col={colors.brandHigh}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.medium}
        >
          {t('stepCount', { current: current + 1, total: steps.length })}
        </Text>
      }
      below={
        <XStack gap={BAR_GAP} ai="flex-start">
          {steps.map((step, index) => {
            const active = index === current;
            const reached = index <= current;
            const reachable = index < current;
            return (
              <Pressable
                key={step.key}
                style={FLEX}
                disabled={!reachable}
                onPress={() => onStepChange(index)}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: !reachable }}
                accessibilityLabel={step.shortTitle}
              >
                <YStack gap={LABEL_GAP} ai="center">
                  <YStack
                    alignSelf="stretch"
                    h={BAR_HEIGHT}
                    br={radius.pill}
                    bg={reached ? colors.brandShape : colors.barIdle}
                  />
                  <Text
                    col={active ? colors.textMuted : colors.textPlaceholder}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={active ? fontWeight.semibold : fontWeight.regular}
                    ta="center"
                    numberOfLines={1}
                  >
                    {step.shortTitle}
                  </Text>
                </YStack>
              </Pressable>
            );
          })}
        </XStack>
      }
    />
  );
});

const FLEX = { flex: 1 } as const;
