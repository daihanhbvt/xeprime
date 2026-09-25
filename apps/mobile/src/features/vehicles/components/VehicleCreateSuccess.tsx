import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_OPERATION_STATUS_META,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { VehicleDetail } from '../api';

const THUMB = 64;

/**
 * Bốn việc còn lại sau khi wizard đóng — CÙNG bộ với `VehicleCreateSuccess` bên web, cùng thứ tự
 * và cùng đích.
 *
 * Khai ở module scope vì mỗi mục là một CẶP khoá dịch (`checkX` + `checkXLink`) đi với một đích;
 * tách ba mảnh đó ra ba nơi là cách chắc chắn nhất để một mục trỏ sang màn của mục bên cạnh.
 * Không có "giấy tờ xe": luồng tạo chưa mở nó, và nó được kể riêng ở dòng cuối checklist.
 */
const CHECKLIST = [
  {
    key: 'checkInfo',
    link: 'checkInfoLink',
    href: (id: string): Href => ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.INFORMATION),
  },
  {
    key: 'checkMedia',
    link: 'checkMediaLink',
    href: (id: string): Href => ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.MEDIA),
  },
  {
    key: 'checkPricing',
    link: 'checkPricingLink',
    href: (id: string): Href => ROUTES.manage.vehiclePricing(id),
  },
  {
    key: 'checkSource',
    link: 'checkSourceLink',
    href: (id: string): Href => ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.SOURCE),
  },
] as const;

const styles = StyleSheet.create({
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

/**
 * Màn xác nhận sau khi tạo xe — nói rõ xe đang ở trạng thái nào (nháp hay đã gửi duyệt) rồi chỉ
 * ra việc còn lại để hồ sơ đủ điều kiện lên chợ.
 *
 * Checklist chỉ liệt kê phần LUỒNG TẠO không thu thập: thông tin chi tiết, ảnh, giá & chính
 * sách, nguồn xe. Nó là lối đi tiếp, không phải một danh sách lỗi.
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
  const t = useTranslations('Vehicles.form.success');
  const router = useRouter();
  const domainLabel = useDomainLabel();

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
  const identity = [vehicle.plateNumber, vehicle.code, domainLabel('vehicleSourceType', vehicle.sourceType)]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  return (
    <>
      <AppHeader title={t('title')} onBack={onClose} />
      <Screen
        edges={['left', 'right', 'bottom']}
        footer={
          <YStack gap={space.sm}>
            <Button
              label={t('viewDetail')}
              onPress={() => router.replace(ROUTES.manage.vehicleDetail(vehicle.id))}
            />
            <Button label={t('createAnother')} variant="secondary" onPress={onCreateAnother} />
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
            <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
              {t('title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
              {submittedForReview ? t('submitted') : t('draft')}
            </Text>
          </YStack>

          <Card>
            {/*
              Web gắn `aria-label="Xe vừa tạo"` lên một `<section>` — một LANDMARK có nhãn, thứ
              React Native không có. Bản native gộp thẻ thành MỘT nút đọc được kèm nguyên nội dung
              vào nhãn: `accessibilityLabel` trên một View không `accessible` là một thuộc tính
              không ai đọc, và một dòng parity giả còn tệ hơn là không có.
            */}
            <XStack
              ai="center"
              gap={space.sm}
              accessible
              accessibilityLabel={[
                t('cardLabel'),
                vehicle.name,
                identity,
                domainLabel(
                  'vehicleOperationStatus',
                  operationStatus,
                  VEHICLE_OPERATION_STATUS_META[operationStatus].label,
                ),
              ]
                .filter(Boolean)
                .join(LIST_SEPARATOR)}
            >
              {vehicle.mainImageUrl ? (
                <Image
                  source={{ uri: vehicle.mainImageUrl }}
                  style={styles.thumb}
                  cachePolicy="memory-disk"
                  accessible={false}
                />
              ) : (
                <YStack style={styles.thumb} ai="center" jc="center">
                  <Ionicons name="car-outline" size={iconSize.md} color={colors.textMuted} />
                </YStack>
              )}
              <YStack f={1} gap={2}>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {vehicle.name}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={2}>
                  {identity}
                </Text>
              </YStack>
              <StatusBadge
                label={domainLabel(
                  'vehicleOperationStatus',
                  operationStatus,
                  VEHICLE_OPERATION_STATUS_META[operationStatus].label,
                )}
                color={VEHICLE_OPERATION_STATUS_META[operationStatus].color}
                size="sm"
              />
            </XStack>
          </Card>

          <Card>
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                {t('checklistTitle')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('checklistBody')}
              </Text>
              {/*
                Mỗi mục là một LỐI ĐI, không phải một dòng chữ. Web gắn liên kết vào từng mục
                ("Tab Thông tin →", "Giá & chính sách →"…); bỏ chúng đi thì checklist nói ra việc
                phải làm rồi bắt người dùng tự dò menu để tìm chỗ làm nó — đúng lúc họ vừa xong
                một wizard bốn bước và ít kiên nhẫn nhất.
              */}
              {CHECKLIST.map((item) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="link"
                  accessibilityLabel={`${t(item.key)} — ${t(item.link)}`}
                  onPress={() => router.push(item.href(vehicle.id))}
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                >
                  <XStack ai="center" gap={space.xs} minHeight={sizing.touchTarget}>
                    <Ionicons
                      name="ellipse-outline"
                      size={iconSize.xs}
                      color={colors.textMuted}
                    />
                    <YStack f={1} gap={2}>
                      <Text col={colors.text} fos={fontSize.bodySm}>
                        {t(item.key)}
                      </Text>
                      <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.medium}>
                        {t(item.link)}
                      </Text>
                    </YStack>
                    <Ionicons
                      name="chevron-forward"
                      size={iconSize.sm}
                      color={colors.placeholder}
                    />
                  </XStack>
                </Pressable>
              ))}

              {/*
                Mục CHƯA mở — không có đích để đi, nên nó là chữ chứ không phải một hàng bấm được.
                Vẫn phải có mặt: nó trả lời trước câu "giấy tờ xe khai ở đâu" mà người vừa tạo xe
                chắc chắn sẽ hỏi.
              */}
              <XStack ai="center" gap={space.xs} opacity={0.6}>
                <Ionicons name="ellipse-outline" size={iconSize.xs} color={colors.textMuted} />
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('checkFuture')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('checkFutureNote')}
                </Text>
              </XStack>
            </YStack>
          </Card>
        </YStack>
      </Screen>
    </>
  );
}
