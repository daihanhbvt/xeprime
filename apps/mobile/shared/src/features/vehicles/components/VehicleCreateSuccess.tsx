import { memo, useCallback, useEffect } from 'react';
import { BackHandler, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { LineIcon } from '@/components/icons/LineIcon';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { VehicleDetail } from '../api';

/** Bốn mục "Hoàn thiện hồ sơ xe" - CÙNG bộ, cùng thứ tự, cùng đích với web `VehicleCreateSuccess`. */
const ITEMS: ReadonlyArray<{ key: string; tab: VehicleEditTab }> = [
  { key: 'documents', tab: VEHICLE_EDIT_TAB.DOCUMENTS },
  { key: 'media', tab: VEHICLE_EDIT_TAB.MEDIA },
  { key: 'policy', tab: VEHICLE_EDIT_TAB.POLICY },
  // Không còn pill "Không bắt buộc" ở Bảo dưỡng & số KM (người dùng chốt 28/11/2026, theo Figma).
  { key: 'maintenance', tab: VEHICLE_EDIT_TAB.MAINTENANCE },
];

/** Figma "Image" `24486:113267`: dấu tích 3D 100x100. */
const HERO_SIZE = 100;

/**
 * Màn kết quả sau khi thêm xe - Figma Thêm xe MB (`24486:112841`): không có thanh tiêu đề (nút back
 * hệ thống lui khỏi wizard), thẻ thành công (dấu tích 3D · tiêu đề · câu trạng thái), thẻ "Hoàn thiện
 * hồ sơ để duyệt nhanh hơn" dẫn thẳng tới đúng tab sửa xe, và ba nút nằm trong nội dung: Danh sách
 * xe · Thêm xe mới · Hoàn thiện hồ sơ xe. Bảo dưỡng không còn pill "Không bắt buộc"
 * (chốt 28/11/2026). Hai trạng thái: đã gửi duyệt / đã lưu nháp.
 */
export function VehicleCreateSuccess({
  vehicle,
  submittedForReview,
  onCreateAnother,
}: {
  vehicle: VehicleDetail;
  submittedForReview: boolean;
  onCreateAnother: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.success');
  const tCreate = useTranslations('Vehicles.form.appCreate.success');
  const router = useRouter();
  const subject = [vehicle.name, vehicle.plateNumber].filter(Boolean).join(' - ');
  const title = submittedForReview ? tCreate('submittedTitle') : t('draftTitle');

  /*
   * Xe đã tạo xong - lùi (nút back Android, vuốt lùi iOS, back của thanh điều hướng) về DANH SÁCH XE,
   * không trở lại wizard / màn trước wizard (người dùng chốt 28/11/2026).
   */
  const toList = useCallback(() => router.replace(ROUTES.manage.vehicles()), [router]);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        toList();
        return true;
      });
      return () => sub.remove();
    }, [toList]),
  );
  const navigation = useNavigation();
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        const type = event.data.action.type;
        if (type !== 'GO_BACK' && type !== 'POP') return;
        event.preventDefault();
        toList();
      }),
    [navigation, toList],
  );

  return (
    <Screen scrollReveal edges={['top', 'left', 'right', 'bottom']}>
      <YStack gap={space.md}>
        <YStack
          bg={colors.surface}
          bw={1}
          bc={colors.border}
          br={radius.card}
          px={space.lg}
          py={space.xl}
          gap={space.md}
          ai="center"
        >
          <Image
            source={images.vehicleSubmitSuccess}
            style={HERO}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
          <Text
            col={colors.text}
            fos={typeScale.heading.fontSize}
            lh={typeScale.heading.lineHeight}
            fow={fontWeight.semibold}
            ta="center"
            accessibilityRole="header"
          >
            {title}
          </Text>
          <Text
            col={colors.textMuted}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            ta="center"
          >
            {submittedForReview
              ? t('submittedBody', { vehicle: subject })
              : t('draftBody', { vehicle: subject })}
          </Text>
        </YStack>

        <InfoGroupCard title={tCreate('checklistTitle')}>
          {ITEMS.map((item, index) => (
            <YStack key={item.key} gap={space.md}>
              {index > 0 ? <DashedRule /> : null}
              <ChecklistRow
                title={t(`items.${item.key}.title` as 'items.documents.title')}
                body={
                  item.key === 'documents'
                    ? tCreate('documentsBody')
                    : t(`items.${item.key}.body` as 'items.documents.body')
                }
                onPress={() => router.push(ROUTES.manage.vehicleEditTab(vehicle.id, item.tab))}
              />
            </YStack>
          ))}
        </InfoGroupCard>

        {/* Figma "_Modal actions": vạch kẻ, hàng hai nút viền, rồi nút vàng cả hàng - trong nội dung. */}
        <YStack gap={space.md} pt={space.xs} borderTopWidth={1} borderColor={colors.border}>
          <XStack gap={space.md} pt={space.md}>
            <YStack f={1}>
              <Button
                label={t('backToList')}
                variant="outlineDark"
                lineIcon="arrow-left"
                onPress={toList}
              />
            </YStack>
            <YStack f={1}>
              <Button
                label={t('createAnother')}
                variant="outlineDark"
                lineIcon="add"
                onPress={onCreateAnother}
              />
            </YStack>
          </XStack>
          <Button
            variant="gradient"
            label={t('completeProfile')}
            lineIcon="arrow-right"
            iconEnd
            onPress={() =>
              router.replace(ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.INFORMATION))
            }
          />
        </YStack>
      </YStack>
    </Screen>
  );
}

const HERO = { width: HERO_SIZE, height: HERO_SIZE } as const;

/** Đường kẻ đứt giữa các mục (Figma "Vector 18"). */
function DashedRule() {
  const colors = useColors();
  return <YStack h={0} borderTopWidth={1} borderStyle="dashed" borderColor={colors.border} />;
}

/** Một mục: tiêu đề 14 medium + dòng phụ 12 `text/gray/low`, chevron "Right 2" 20. */
const ChecklistRow = memo(function ChecklistRow({
  title,
  body,
  onPress,
}: {
  title: string;
  body: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title} - ${body}`}
      onPress={onPress}
      style={({ pressed }) => (pressed ? PRESSED : null)}
    >
      <XStack ai="center" gap={space.md}>
        <YStack f={1} minWidth={0} gap={2}>
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
          >
            {title}
          </Text>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {body}
          </Text>
        </YStack>
        <LineIcon name="chevron-right" color={colors.placeholder} />
      </XStack>
    </Pressable>
  );
});

const PRESSED = { opacity: 0.6 } as const;
