import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  isEstablishedPackageShop,
  missingShopProfileRequirements,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ShopProfileScreen } from '@/features/shop/ShopProfileScreen';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { useVehiclesPage } from '@/features/vehicles/hooks/use-vehicles';
import { useRouter } from 'expo-router';
import { goBackOr } from '@/navigation/go-back-or';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/** Xe đang trên đường lên chợ — mọi trạng thái TRỪ "đã lên chợ". */
const IN_FLIGHT: readonly VehiclePublicStatus[] = [
  VEHICLE_PUBLIC_STATUS.DRAFT,
  VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
  VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
  VEHICLE_PUBLIC_STATUS.REJECTED,
];

const VEHICLE_PAGE = { page: 1, limit: 20 };

/**
 * "Hồ sơ chủ xe" — tiến trình đăng ký, và về sau là chỗ sửa hồ sơ gian hàng.
 *
 * ## Vì sao màn này cần thiết trên app
 *
 * Chủ xe tuyến hoa hồng KHÔNG vào khu quản lý được (ADR 0038 điều 4), nên `/manage/shop` đóng với
 * họ. Thiếu màn này thì họ không có đường nào sửa hồ sơ gian hàng của chính mình — và cũng không
 * có chỗ nào trả lời câu hỏi duy nhất người mới đăng ký có trong đầu: "chiếc xe tôi vừa khai đang
 * ở đâu".
 *
 * ## Ba bước, và bước nào cũng KHÔNG chờ ai gật đầu trừ bước cuối
 *
 * Khai hồ sơ đủ là xong bước 1 — không có vòng duyệt hồ sơ nào. Đăng xe rồi gửi duyệt là bước 2.
 * XePrime duyệt XE là bước duyệt DUY NHẤT (ADR 0036). Vẽ sai chỗ này là dựng lại đúng cái bế tắc
 * "chờ duyệt hồ sơ rồi mới được đăng xe" mà ADR đó gỡ đi.
 *
 * Phần sửa hồ sơ dùng lại `ShopProfileScreen` với vỏ đầu trang của khu khách — không clone, vì
 * luật lưu và luật gửi duyệt phải có đúng một bản.
 */
export function OwnerRegistrationScreen() {
  const t = useTranslations('Account.registration');
  const domainLabel = useDomainLabel();
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();

  /*
   * GIAN HÀNG TRẢ PHÍ KHÔNG BAO GIỜ THẤY MÀN NÀY (ADR 0040 điều 4).
   *
   * Một gian hàng vừa hết gói thì `resolveOwnerStage` chấm là `registering` ngay khi chiếc xe cuối
   * rời chợ, nên `OwnerGate` cho họ qua. Màn này kể một câu chuyện ba bước dành cho người CHƯA bắt
   * đầu ("Hồ sơ chủ xe → Đăng xe đầu tiên → Lên chợ"); với một gian hàng 10 xe vừa cần gia hạn thì
   * đó là câu chuyện sai hoàn toàn.
   *
   * Điều hướng, không render một màn lỗi: họ có một khu làm việc hợp lệ, chỉ là không phải khu này.
   * `replace` để nút lui không rơi lại đúng màn vừa bị đẩy ra.
   */
  const wrongWorkspace = isEstablishedPackageShop(user?.tenant);
  useEffect(() => {
    if (wrongWorkspace) router.replace(ROUTES.account.vehicles());
  }, [router, wrongWorkspace]);

  const vehicles = useVehiclesPage(VEHICLE_PAGE);
  /*
   * Cùng query mà `ShopProfileScreen` bên dưới đang dùng — TanStack trả từ cache, không phải một
   * lượt gọi thứ hai.
   */
  const shop = useMyShop(true);

  const items = vehicles.data?.items ?? [];
  const publicCount = items.filter(
    (v) => v.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  ).length;
  const inFlight = items.filter((v) => IN_FLIGHT.includes(v.publicStatus as VehiclePublicStatus));
  const hasVehicle = items.length > 0;

  const addVehicle = () =>
    navigateOnce(ROUTES.listYourVehicle.register(VEHICLE_REGISTRATION_SOURCE.ACCOUNT));

  /*
   * Bước đang đứng suy từ DỮ LIỆU THẬT, không từ một cờ lưu riêng — một cờ riêng là một thứ nữa
   * có thể lệch với sự thật.
   *
   * Chấm hồ sơ bằng `missingShopProfileRequirements` của `@xeprime/types` — CÙNG hàm backend dùng,
   * nên màn không bao giờ nói "xong" về một hồ sơ mà server sẽ từ chối.
   */
  const profileDone =
    shop.data != null &&
    missingShopProfileRequirements({
      displayName: shop.data.profile.displayName,
      provinceCode: shop.data.defaultBranch?.provinceCode ?? shop.data.profile.provinceCode,
      // Chủ gian hàng đọc từ TÀI KHOẢN (16/09/2026) — cùng nguồn mà cổng gửi duyệt ở backend
      // dùng. Ba cột sao chép trên hồ sơ đã bị gỡ.
      ownerFullName: shop.data.ownerAccount.displayName,
      ownerPhone: shop.data.ownerAccount.phone,
    }).length === 0;

  const current = !profileDone ? 0 : publicCount > 0 ? 2 : 1;

  return (
    <ShopProfileScreen
      header={
        <AppHeader
          /*
            Màn chen ngang mở từ menu tài khoản ⇒ phải lui được. `goBackOr` chứ không `router.back`
            trần: vào thẳng bằng deep link thì ngăn xếp rỗng, và một nút lui không làm gì cả đọc
            như app treo.
          */
          onBack={() => goBackOr(router, ROUTES.account.home())}
          title={t('title')}
          subtitle={t('subtitle')}
          right={
            hasVehicle ? (
              <Button
                label={t('steps.vehicle.addMore')}
                variant="ghost"
                size="sm"
                block={false}
                onPress={addVehicle}
              />
            ) : undefined
          }
        />
      }
      intro={
        <YStack gap={space.sm}>
          <Card>
            <YStack gap={space.sm}>
              <Step
                index={0}
                current={current}
                icon="storefront-outline"
                title={t('steps.profile.title')}
                description={t('steps.profile.description')}
              />
              <Step
                index={1}
                current={current}
                icon="car-outline"
                title={t('steps.vehicle.title')}
                description={t('steps.vehicle.description')}
              />
              <Step
                index={2}
                current={current}
                icon="bag-check-outline"
                title={t('steps.live.title')}
                description={t('steps.live.description')}
              />
            </YStack>
          </Card>

          {/*
            Chưa có xe nào: nói thẳng việc còn lại và dẫn tới wizard. KHÔNG phụ thuộc hồ sơ đã
            "duyệt" hay chưa — chủ xe đăng được xe ngay, và bắt họ chờ một cái gật đầu không tồn
            tại là đúng bế tắc mà ADR 0036 gỡ.
          */}
          {!hasVehicle && !vehicles.isPending ? (
            <Callout tone="info" title={t('noVehicle.title')}>
              <CalloutBody>{t('noVehicle.body')}</CalloutBody>
              <Button label={t('noVehicle.cta')} size="sm" onPress={addVehicle} />
            </Callout>
          ) : null}

          {vehicles.isPending ? <MiniRowsSkeleton rows={2} /> : null}

          {/*
            Xe đang trên đường lên chợ — danh sách NGẮN, chỉ trạng thái và lối vào sửa. Đây không
            phải bản thứ hai của "Danh sách xe": nó chỉ trả lời "chiếc xe tôi vừa khai đang ở đâu".

            Lý do người duyệt trả xe về đi kèm NGAY tại dòng đó: bắt chủ xe mở từng chiếc để tìm
            xem mình sai chỗ nào là biến một câu trả lời thành một cuộc đi tìm.
          */}
          {inFlight.length > 0 ? (
            <Card>
              <YStack gap={space.sm} accessibilityLabel={t('queue.title')}>
                <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                  {t('queue.title')}
                </Text>
                {inFlight.map((vehicle) => (
                  <Pressable
                    key={vehicle.id}
                    accessibilityRole="button"
                    accessibilityLabel={vehicle.name}
                    onPress={() => navigateOnce(ROUTES.account.vehicleDetail(vehicle.id))}
                  >
                    <YStack gap={space.xs}>
                      <XStack ai="center" jc="space-between" gap={space.sm}>
                        <Text
                          f={1}
                          col={colors.text}
                          fos={fontSize.bodySm}
                          fow={fontWeight.semibold}
                          numberOfLines={1}
                        >
                          {vehicle.name}
                        </Text>
                        <StatusBadge
                          label={domainLabel(
                            'vehiclePublicStatus',
                            vehicle.publicStatus,
                            VEHICLE_PUBLIC_STATUS_META[vehicle.publicStatus as VehiclePublicStatus]
                              ?.label,
                          )}
                          color={
                            VEHICLE_PUBLIC_STATUS_META[vehicle.publicStatus as VehiclePublicStatus]
                              ?.color ?? 'default'
                          }
                          size="sm"
                        />
                      </XStack>
                      {vehicle.latestPublicReview?.reason ? (
                        <Text col={colors.textMuted} fos={fontSize.label}>
                          {vehicle.latestPublicReview.reason}
                        </Text>
                      ) : null}
                    </YStack>
                  </Pressable>
                ))}
              </YStack>
            </Card>
          ) : null}
        </YStack>
      }
    />
  );
}

function Step({
  index,
  current,
  icon,
  title,
  description,
}: {
  index: number;
  current: number;
  icon: 'storefront-outline' | 'car-outline' | 'bag-check-outline';
  title: string;
  description: string;
}) {
  const done = index < current;
  const active = index === current;
  const tone = done ? colors.success : active ? colors.primary : colors.placeholder;

  return (
    <XStack ai="flex-start" gap={space.sm}>
      <Ionicons name={done ? 'checkmark-circle' : icon} size={iconSize.lg} color={tone} />
      <YStack f={1} minWidth={0} gap={2}>
        <Text col={active ? colors.text : colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {title}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {description}
        </Text>
      </YStack>
    </XStack>
  );
}
