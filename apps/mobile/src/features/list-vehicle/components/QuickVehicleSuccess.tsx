import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { VEHICLE_PUBLIC_STATUS } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { IconDisc } from '@/components/ui/IconDisc';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';
import type { VehicleRegistrationSource } from '@/navigation/vehicle-registration-source';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import type { QuickRegistrationResult } from '../hooks/use-quick-vehicle';

/**
 * Màn KẾT QUẢ của wizard đăng xe nhanh — bản native của `QuickVehicleSuccess`.
 *
 * BỐN kết cục khác nhau và không được lẫn vào nhau:
 *
 *  1. **Đã gửi duyệt** — phiếu duyệt XE có thật (`submitted` chỉ bật khi server trả về xe ở
 *     `pending_public_review`). Đây là toàn bộ vòng duyệt của tuyến hoa hồng: một cổng, không
 *     còn bước "chờ duyệt gian hàng" nào phía trước (ADR 0036).
 *  2. **Chưa gửi được vì còn thiếu điều kiện** — liệt kê TỪNG mục, xe nằm nháp và sửa được ngay.
 *     Đây là lý do màn này nhận `missingRequirements` dưới dạng MÃ: nó dựng nhãn theo ngôn ngữ
 *     đang dùng, thay vì hiện lại câu tiếng Việt của server (ADR 0012).
 *  3. **Đã lưu nháp** — người dùng chủ động chọn "Lưu nháp".
 *  4. **Lưu nháp nhưng một phần cấu hình chưa lưu được** — xe TỒN TẠI; người dùng phải biết điều
 *     đó để không bấm tạo lại và đẻ ra chiếc xe thứ hai.
 *
 * ## KHÔNG còn dải "gian hàng chưa được duyệt" (ADR 0036/0040 điều 5)
 *
 * Bản trước đọc `tenant.status !== active` và mời người dùng đi hoàn tất hồ sơ gian hàng. Hai chỗ
 * sai: trạng thái gian hàng KHÔNG còn là cổng đăng xe (xác minh là một trục riêng), và nút đó dẫn
 * tới `/manage/shop` — một cánh cửa mà chính chủ xe tuyến hoa hồng không mở được, nên `ScopeGuard`
 * đá họ ngược ra. Cổng thật khi gửi duyệt là `missingRequirements` ở ca 2, do SERVER trả về.
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
  const tRequirement = useTranslations('Vehicles.publish.requirements');
  const navigateOnce = useNavigateOnce();

  const pendingReview = result.vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW;
  const submitted = result.submitted || pendingReview;
  const incomplete = result.missingRequirements.length > 0;
  const warned = Boolean(result.partialError) || incomplete;

  const title = result.partialError
    ? t('partialTitle')
    : incomplete
      ? t('incompleteTitle')
      : submitted
        ? t('submittedTitle')
        : t('draftTitle');

  const manageHref =
    source === VEHICLE_REGISTRATION_SOURCE.MANAGE
      ? ROUTES.manage.vehicles()
      : ROUTES.account.vehicleManage(result.vehicle.id);

  /*
    KHÔNG dùng `vehicleListPathFor(source)` ở đây. Hàm đó trả landing "Trở thành chủ xe" cho
    `marketplace` vì nó phục vụ nút QUAY LẠI — lúc chưa đăng xe thì đúng là chưa có danh sách nào
    để về. Ở màn này thì ngược lại: xe VỪA được lưu, nên danh sách luôn tồn tại, và đẩy người dùng
    về trang mời-làm-chủ-xe là trả lời sai câu họ vừa hỏi ("xe tôi đâu?").
  */
  const listHref =
    source === VEHICLE_REGISTRATION_SOURCE.MANAGE
      ? ROUTES.manage.vehicles()
      : ROUTES.account.vehicles();

  return (
    <>
      <AppHeader title={title} onBack={onDone} />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.lg}>
          <Card>
            <YStack ai="center" gap={space.md}>
              <IconDisc
                icon={warned ? 'alert-circle' : 'checkmark-circle'}
                tone={warned ? colors.warning : colors.success}
                surface={warned ? colors.warningSurface : colors.successSurface}
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
                    : incomplete
                      ? t('incompleteBody')
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
            Danh sách VIỆC PHẢI LÀM, không phải một lỗi. Mỗi dòng là một mục CỤ THỂ — "Ảnh đại
            diện" chứ không phải "dữ liệu chưa hợp lệ" — vì chủ xe phải biết bấm vào đâu để sửa,
            và nút ngay dưới dẫn thẳng tới chỗ sửa.
          */}
          {incomplete ? (
            <Callout tone="warning">
              <YStack gap={space.sm}>
                <YStack gap={space.xs}>
                  {result.missingRequirements.map((key) => (
                    <XStack key={key} ai="center" gap={space.xs}>
                      <Ionicons
                        name="close-circle-outline"
                        size={iconSize.sm}
                        color={colors.warning}
                      />
                      <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                        {tRequirement(key as 'plateNumber')}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
                <Button
                  label={t('incompleteCta')}
                  variant="secondary"
                  size="sm"
                  onPress={() => navigateOnce(manageHref)}
                />
              </YStack>
            </Callout>
          ) : null}

          <YStack gap={space.sm}>
            <Button label={t('manageCta')} onPress={() => navigateOnce(manageHref)} />
            <Button label={t('addAnotherCta')} variant="secondary" onPress={onAddAnother} />
            <Button label={t('listCta')} variant="ghost" onPress={() => navigateOnce(listHref)} />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
