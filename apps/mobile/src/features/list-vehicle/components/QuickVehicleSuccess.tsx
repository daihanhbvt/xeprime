import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TENANT_STATUS, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { IconDisc } from '@/components/ui/IconDisc';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { ROUTES, vehicleListPathFor } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';
import type { VehicleRegistrationSource } from '@/navigation/vehicle-registration-source';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import type { QuickRegistrationResult } from '../hooks/use-quick-vehicle';

/**
 * Màn KẾT QUẢ của wizard đăng xe nhanh — bản native của `QuickVehicleSuccess`.
 *
 * Ba kết cục khác nhau và không được lẫn vào nhau:
 *
 *  1. **Đã gửi duyệt** — có phiếu duyệt thật, xe đang chờ nền tảng xem.
 *  2. **Đã lưu nháp** — người dùng chọn lưu nháp, hoặc gian hàng chưa được duyệt hoạt động nên
 *     chưa gửi xe lên chợ được.
 *  3. **Đã lưu nháp nhưng một phần cấu hình chưa lưu được** — xe TỒN TẠI; người dùng phải biết
 *     điều đó để không bấm tạo lại và đẻ ra chiếc xe thứ hai.
 *
 * Hồ sơ chủ xe chờ duyệt là một LỜI NHẮC RIÊNG chồng lên ba ca trên, không phải ca thứ tư thay
 * thế tiêu đề: xe vẫn vừa được lưu (hoặc vừa gửi duyệt), và nói "hồ sơ cần được duyệt" ở chỗ
 * đáng lẽ nói kết quả của chiếc xe là trả lời một câu hỏi khác câu vừa hỏi.
 */
export function QuickVehicleSuccess({
  result,
  source,
  onAddAnother,
  onDone,
}: {
  result: QuickRegistrationResult;
  source: VehicleRegistrationSource;
  onAddAnother: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('ListYourVehicle.success');
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();

  const tenantActive = user?.tenant?.status === TENANT_STATUS.ACTIVE;
  const pendingReview = result.vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW;
  const submitted = result.submitted || pendingReview;

  const title = result.partialError
    ? t('partialTitle')
    : submitted
      ? t('submittedTitle')
      : t('draftTitle');

  const manageHref =
    source === VEHICLE_REGISTRATION_SOURCE.MANAGE
      ? ROUTES.manage.vehicles()
      : ROUTES.account.vehicleManage(result.vehicle.id);

  return (
    <>
      <AppHeader title={title} onBack={onDone} />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.lg}>
          <Card>
            <YStack ai="center" gap={space.md}>
              <IconDisc
                icon={result.partialError ? 'alert-circle' : 'checkmark-circle'}
                tone={result.partialError ? colors.warning : colors.success}
                surface={result.partialError ? colors.warningSurface : colors.successSurface}
                size={64}
                filled
              />
              <YStack ai="center" gap={space.xs}>
                <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
                  {title}
                </Text>
                {/* Tên xe: bằng chứng cụ thể rằng chiếc xe VỪA LƯU là chiếc họ vừa khai. */}
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} ta="center">
                  {result.vehicle.name}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                  {result.partialError
                    ? t('partialBody')
                    : submitted
                      ? t('submittedBody')
                      : t('draftBody')}
                </Text>
              </YStack>
            </YStack>
          </Card>

          {/* Câu lỗi kỹ thuật đứng RIÊNG, không trộn vào đoạn giải thích ở trên. */}
          {result.partialError ? <Callout tone="warning">{result.partialError}</Callout> : null}

          {/*
            Gian hàng chưa được duyệt hoạt động thì backend KHÔNG cho gửi xe lên chợ. Nói đúng việc
            cần làm và dẫn tới đúng chỗ làm việc đó, thay vì để người dùng bấm gửi duyệt và ăn lỗi.
          */}
          {!tenantActive ? (
            <Callout tone="info" title={t('shopPendingTitle')}>
              <YStack gap={space.sm}>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('shopPendingBody')}
                </Text>
                <Button
                  label={t('shopPendingCta')}
                  variant="secondary"
                  size="sm"
                  onPress={() => navigateOnce(ROUTES.manage.shop())}
                />
              </YStack>
            </Callout>
          ) : null}

          <YStack gap={space.sm}>
            <Button label={t('manageCta')} onPress={() => navigateOnce(manageHref)} />
            <Button label={t('addAnotherCta')} variant="secondary" onPress={onAddAnother} />
            <Button
              label={t('listCta')}
              variant="ghost"
              onPress={() => navigateOnce(vehicleListPathFor(source))}
            />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
