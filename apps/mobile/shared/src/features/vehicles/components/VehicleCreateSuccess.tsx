import { memo } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Ionicons } from '@/components/icons/Ionicons';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { VehicleDetail } from '../api';

/** Bốn mục "Hoàn thiện hồ sơ xe" - CÙNG bộ, cùng thứ tự, cùng đích với web `VehicleCreateSuccess`. */
const ITEMS: ReadonlyArray<{ key: string; tab: VehicleEditTab; optional?: boolean }> = [
  { key: 'documents', tab: VEHICLE_EDIT_TAB.DOCUMENTS },
  { key: 'media', tab: VEHICLE_EDIT_TAB.MEDIA },
  { key: 'policy', tab: VEHICLE_EDIT_TAB.POLICY },
  { key: 'maintenance', tab: VEHICLE_EDIT_TAB.MAINTENANCE, optional: true },
];

/**
 * Màn kết quả sau khi thêm xe - Figma `24352:67918` ("Đã gửi duyệt xe thành công"), bản native của
 * web `VehicleCreateSuccess`: tiêu đề theo trạng thái (gửi duyệt / nháp), danh sách hoàn thiện hồ sơ
 * dẫn thẳng tới đúng tab sửa xe, ba lối đi Danh sách xe · Thêm xe mới · Hoàn thiện hồ sơ xe.
 */
export function VehicleCreateSuccess({
  vehicle,
  submittedForReview,
  onCreateAnother,
  onClose,
}: {
  vehicle: VehicleDetail;
  submittedForReview: boolean;
  onCreateAnother: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.success');
  const router = useRouter();
  const subject = [vehicle.name, vehicle.plateNumber].filter(Boolean).join(' - ');
  const title = submittedForReview ? t('submittedTitle') : t('draftTitle');

  return (
    <>
      <AppHeader title={title} onBack={onClose} />
      <Screen
        scrollReveal
        edges={['left', 'right', 'bottom']}
        footer={
          <YStack gap={space.sm}>
            <Button
              variant="gradient"
              label={t('completeProfile')}
              icon="add-outline"
              onPress={() =>
                router.replace(ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.INFORMATION))
              }
            />
            <XStack gap={space.sm}>
              <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
                <Button
                  label={t('backToList')}
                  variant="outline"
                  icon="arrow-back"
                  onPress={() => router.replace(ROUTES.manage.vehicles())}
                />
              </YStack>
              <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
                <Button
                  label={t('createAnother')}
                  variant="outline"
                  icon="add-outline"
                  onPress={onCreateAnother}
                />
              </YStack>
            </XStack>
          </YStack>
        }
      >
        <YStack gap={layout.section}>
          <YStack ai="center" gap={space.sm}>
            <YStack
              w={iconSize.lg * 2}
              h={iconSize.lg * 2}
              br={radius.pill}
              bg={colors.successSurface}
              ai="center"
              jc="center"
            >
              <Ionicons name="checkmark" size={iconSize.lg} color={colors.success} />
            </YStack>
            <Text
              col={colors.text}
              fos={fontSize.h3}
              fow={fontWeight.bold}
              ta="center"
              accessibilityRole="header"
            >
              {title}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
              {submittedForReview
                ? t('submittedBody', { vehicle: subject })
                : t('draftBody', { vehicle: subject })}
            </Text>
          </YStack>

          <Card>
            <YStack gap={space.xs}>
              <Text
                col={colors.text}
                fos={fontSize.bodyLg}
                fow={fontWeight.bold}
                accessibilityRole="header"
              >
                {t('checklistTitle')}
              </Text>
              {ITEMS.map((item) => (
                <ChecklistRow
                  key={item.key}
                  title={t(`items.${item.key}.title` as 'items.documents.title')}
                  body={t(`items.${item.key}.body` as 'items.documents.body')}
                  optional={item.optional ? t('optional') : null}
                  onPress={() => router.push(ROUTES.manage.vehicleEditTab(vehicle.id, item.tab))}
                />
              ))}
            </YStack>
          </Card>
        </YStack>
      </Screen>
    </>
  );
}

const ChecklistRow = memo(function ChecklistRow({
  title,
  body,
  optional,
  onPress,
}: {
  title: string;
  body: string;
  optional: string | null;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[title, body, optional].filter(Boolean).join(' - ')}
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {title}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {body}
          </Text>
        </YStack>
        {optional ? <Pill label={optional} tone="neutral" /> : null}
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.placeholder} />
      </XStack>
    </Pressable>
  );
});
