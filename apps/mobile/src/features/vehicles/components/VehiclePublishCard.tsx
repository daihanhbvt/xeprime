import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_SUBMITTABLE,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { applicablePublishRequirements, publicStatusPresentation } from '../publication';
import { useSubmitVehiclePublic } from '../hooks/use-vehicle';
import type { VehicleDetail } from '../api';

const BANNER_TONE = {
  success: { fg: colors.success, bg: colors.successSurface },
  info: { fg: colors.info, bg: colors.infoSurface },
  warning: { fg: colors.warning, bg: colors.warningSurface },
  error: { fg: colors.danger, bg: colors.dangerSurface },
} as const;

/**
 * Tiến trình gửi xe lên chợ (VEH-12).
 *
 * Hiện **toàn bộ** danh sách điều kiện kèm trạng thái đạt/chưa đạt, không chỉ phần còn thiếu:
 * chủ xe cần thấy mình còn cách bao xa, không chỉ thấy lỗi.
 *
 * Điều kiện lấy từ `publication.ts` — cùng bảng mà mục "Việc cần làm" đọc, nên hai chỗ không thể
 * nói một cái "đủ rồi" còn cái kia "còn thiếu". Gửi duyệt đi qua luồng nền tảng (ADR 0008):
 * client KHÔNG bao giờ tự đặt `approved_public`.
 */
export function VehiclePublishCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.publish');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const submit = useSubmitVehiclePublic(vehicle.id);

  const status = vehicle.publicStatus as VehiclePublicStatus;
  const canSubmit =
    has(PERMISSION.VEHICLE_SUBMIT_PUBLIC) &&
    (VEHICLE_PUBLIC_STATUS_SUBMITTABLE as readonly string[]).includes(status);

  // Checklist chỉ gồm điều kiện ÁP DỤNG với xe này — giá kiểm theo dịch vụ xe đăng.
  const checklist = applicablePublishRequirements(vehicle).map((item) => ({
    key: item.key,
    label: t(`requirements.${item.key}`),
    met: item.present(vehicle),
  }));
  const missingCount = checklist.filter((item) => !item.met).length;
  const isResubmit = status !== VEHICLE_PUBLIC_STATUS.DRAFT;

  const presentation = publicStatusPresentation(status);
  const tone = BANNER_TONE[presentation.type];
  const reason = vehicle.latestPublicReview?.reason;

  function onSubmit() {
    submit.mutate(undefined, {
      onSuccess: () => toast.showSuccess(t('panel.submitted')),
      onError: (error) => toast.showError(errorMessage(error)),
    });
  }

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('panel.title')}</BlockTitle>

        <YStack bg={tone.bg} br={radius.sm} p={space.sm} gap={2}>
          <Text col={tone.fg} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t(`status.${presentation.key}.message`)}
          </Text>
          {/* `reason` là câu do người duyệt viết — đi qua nguyên văn, không dịch được. */}
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {presentation.useReason && reason ? reason : t(`status.${presentation.key}.description`)}
          </Text>
        </YStack>

        {canSubmit ? (
          <>
            <YStack gap={space.xs}>
              {checklist.map((item) => (
                <XStack key={item.key} ai="center" gap={space.xs}>
                  <Ionicons
                    name={item.met ? 'checkmark-circle' : 'close-circle-outline'}
                    size={iconSize.sm}
                    color={item.met ? colors.success : colors.textMuted}
                  />
                  <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                    {item.label}
                  </Text>
                  {/* Chữ mang nghĩa, không phải icon — icon là trang trí nên trình đọc bỏ qua. */}
                  <Text
                    col={item.met ? colors.success : colors.textMuted}
                    fos={fontSize.label}
                    fow={fontWeight.medium}
                  >
                    {item.met ? t('panel.met') : t('panel.unmet')}
                  </Text>
                </XStack>
              ))}
            </YStack>

            <Button
              label={isResubmit ? t('panel.resubmit') : t('panel.submit')}
              onPress={onSubmit}
              loading={submit.isPending}
              disabled={missingCount > 0}
            />
          </>
        ) : null}
      </YStack>
    </Card>
  );
}
