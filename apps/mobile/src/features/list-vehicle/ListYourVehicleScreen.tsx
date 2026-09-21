import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet, type ImageSourcePropType } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LEGAL_DOC } from '@xeprime/domain';
import { REGISTRATION_TRACK } from '@xeprime/types';
import { OWNER_PERSONAL_CAR_RATIO, OWNER_SHOP_SHOWROOM_RATIO, images } from '@/assets';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { InlineAction } from '@/components/ui/InlineAction';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * Số xe tối đa của chủ xe tuyến hoa hồng và mức phí dịch vụ thí điểm (ADR 0028).
 *
 * Để ở ĐÂY, không rải vào câu dịch: hai con số này xuất hiện ở cả `vi` lẫn `en`, và một ngày nào
 * đó chúng đổi theo `fee_policies`/gói — lúc đó phải chỉ có MỘT chỗ để sửa. Cùng hằng số, cùng giá
 * trị với `ListYourVehicleLanding` bên web; đổi một bên là đổi cả hai.
 */
const BASIC_OWNER_VEHICLE_CAP = 3;
const PLATFORM_SERVICE_FEE_PILOT_PERCENT = 10;

/** Bề ngang do thẻ quyết định; chiều cao suy từ `aspectRatio` của từng ảnh. */
const styles = StyleSheet.create({ art: { width: '100%' } });

/**
 * Phần NHẤN trong câu ICU (`<strong>`).
 *
 * React Native lồng `Text` trong `Text` để đổi kiểu chữ giữa câu — đó là cách duy nhất có phần
 * nhấn inline. Bỏ thẻ đi cũng chạy, nhưng hai con số quan trọng nhất của trang (mức phí và "0%")
 * sẽ chìm vào câu.
 */
function strong(chunks: ReactNode): ReactNode {
  return <Text fow={fontWeight.semibold}>{chunks}</Text>;
}

/**
 * Landing "Đăng xe cho thuê" — cửa vào CÔNG KHAI của chủ xe mới, HAI TUYẾN song song.
 * Bản native của `ListYourVehicleLanding`, cùng địa chỉ với web (`/list-your-vehicle`).
 *
 * Đọc được khi CHƯA đăng nhập: người ta cần biết mình sẽ được gì trước khi giao email. Trang
 * trình bày hai lựa chọn ĐỘC LẬP của ADR 0028 và không tự chuyển lựa chọn này thành lựa chọn kia:
 *
 *  - "Đăng xe cá nhân" → màn đăng xe (tuyến hoa hồng);
 *  - "Mở gian hàng cho thuê" → tạo hồ sơ gian hàng (tuyến gói).
 *
 * Chưa đăng nhập thì cả hai nút dẫn về màn đăng nhập trước — không đẩy người chọn tuyến cá nhân
 * sang form tạo gian hàng.
 *
 * Không tự tạo gian hàng cho ai: chỉ người bấm đúng nút gian hàng mới thể hiện ý định đó.
 */
export function ListYourVehicleScreen() {
  const t = useTranslations('ListYourVehicle.landing');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const openLegalDoc = useOpenLegalDoc();
  const { data: user, isLoading } = useCurrentUser();

  /** Chưa đăng nhập thì dừng ở màn đăng nhập; đăng nhập xong họ bấm lại đúng tuyến đã chọn. */
  const go = (destination: Parameters<typeof navigateOnce>[0]) => () => {
    navigateOnce(user ? destination : ROUTES.account.login());
  };

  return (
    <>
      <AppHeader onBack={() => goBackOr(router, ROUTES.explore.home())} title={t('back')} />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.lg}>
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
              {t('title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('subtitle')}
            </Text>
          </YStack>

          <TrackCard
            featured
            badge={t('personal.badge')}
            title={t('personal.title')}
            tagline={t('personal.tagline')}
            body={t('personal.body', { maxVehicles: BASIC_OWNER_VEHICLE_CAP })}
            features={[
              { key: 'noFee', icon: 'document-text-outline', label: t('personal.features.noFee') },
              {
                key: 'vehicleCap',
                icon: 'car-outline',
                label: t('personal.features.vehicleCap', { maxVehicles: BASIC_OWNER_VEHICLE_CAP }),
              },
              { key: 'simple', icon: 'settings-outline', label: t('personal.features.simple') },
            ]}
            offerIcon="pricetag-outline"
            art={images.ownerPersonalCar}
            artRatio={OWNER_PERSONAL_CAR_RATIO}
            artNote={t('personal.art')}
            offerTitle={t('personal.offerTitle')}
            offerBody={t.rich('personal.offerBody', {
              percent: PLATFORM_SERVICE_FEE_PILOT_PERCENT,
              strong,
            })}
            cta={
              <Button
                label={t('personal.cta')}
                icon="car-sport-outline"
                loading={isLoading}
                onPress={go(
                  ROUTES.listYourVehicle.register(VEHICLE_REGISTRATION_SOURCE.MARKETPLACE),
                )}
              />
            }
          />

          <TrackCard
            badge={t('shop.badge')}
            title={t('shop.title')}
            tagline={t('shop.tagline')}
            body={t.rich('shop.body', { strong })}
            features={[
              { key: 'fleet', icon: 'git-network-outline', label: t('shop.features.fleet') },
              {
                key: 'operations',
                icon: 'calendar-outline',
                label: t('shop.features.operations'),
              },
              { key: 'reports', icon: 'bar-chart-outline', label: t('shop.features.reports') },
            ]}
            offerIcon="ribbon-outline"
            art={images.ownerShopShowroom}
            artRatio={OWNER_SHOP_SHOWROOM_RATIO}
            offerTitle={t('shop.offerTitle')}
            offerBody={t('shop.offerBody')}
            cta={
              <Button
                label={t('shop.cta')}
                icon="storefront-outline"
                variant="secondary"
                loading={isLoading}
                onPress={go(ROUTES.manage.onboarding(REGISTRATION_TRACK.PACKAGE))}
              />
            }
          />

          <Card tone="muted" lift="flat">
            <XStack ai="flex-start" gap={space.sm}>
              <Ionicons name="sync-outline" size={iconSize.md} color={colors.primaryActive} />
              <YStack f={1} minWidth={0} gap={2}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t('upgrade.title')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('upgrade.body')}
                </Text>
              </YStack>
            </XStack>
          </Card>

          {/*
            Liên kết chính sách trỏ tới TÀI LIỆU CÓ THẬT (quy chế sàn). Nền tảng chưa có văn bản
            "hỗ trợ phạt nguội", nên ở đây không hứa điều đó — một liên kết chết hoặc một cam kết
            pháp lý tự viết còn tệ hơn không có liên kết.
          */}
          <XStack ai="center" jc="center" gap={space.xs}>
            <Ionicons
              name="shield-checkmark-outline"
              size={iconSize.sm}
              color={colors.primaryActive}
            />
            <InlineAction
              label={t('policyLink')}
              onPress={() => openLegalDoc(LEGAL_DOC.MARKETPLACE_RULES)}
            />
          </XStack>
        </YStack>
      </Screen>
    </>
  );
}

interface TrackFeature {
  key: string;
  icon: IconName;
  label: string;
}

/**
 * Một TUYẾN — nhãn, tên, ba gạch đầu dòng, khối ưu đãi, rồi nút.
 *
 * `featured` là tuyến nền tảng gợi ý trước (viền gold, nền kem, nút chính).
 *
 * MINH HOẠ (15/09/2026): đợt port đầu bỏ hẳn hai ảnh, lý do ghi lại là "chúng đẩy nút của tuyến
 * thứ hai xuống dưới hai màn cuộn và không mang thông tin nào mà ba gạch đầu dòng chưa nói".
 * Quyết định đã đổi — app và web phải là MỘT sản phẩm, và người dùng so hai màn cạnh nhau thấy
 * ngay app trông sơ sài hơn. Ảnh dựng theo `aspectRatio` thật của SVG, đúng như web ở mốc hẹp
 * (`max-width: 320px`, `height: auto`), nên chiều cao ~0,66× bề ngang thẻ chứ không phải toàn
 * khung như bản dựng cũ.
 *
 * `artNote` là CHỮ THẬT của giao diện, không vẽ vào ảnh — cùng lý do với web: nó phải dịch được.
 * Web neo nó nổi lên góc hình ở màn rộng rồi thả xuống dưới ảnh ở mốc hẹp; app chỉ có mốc hẹp
 * nên luôn nằm dưới.
 */
function TrackCard({
  featured = false,
  badge,
  title,
  tagline,
  body,
  features,
  art,
  artRatio,
  artNote,
  offerIcon,
  offerTitle,
  offerBody,
  cta,
}: {
  featured?: boolean;
  badge: string;
  title: string;
  tagline: string;
  body: ReactNode;
  features: TrackFeature[];
  art: ImageSourcePropType;
  /** Rộng ÷ cao của chính file SVG — giữ khung trước khi ảnh tải xong, không để thẻ nhảy. */
  artRatio: number;
  artNote?: string;
  offerIcon: IconName;
  offerTitle: string;
  offerBody: ReactNode;
  cta: ReactNode;
}) {
  return (
    <Card tone={featured ? 'accent' : 'surface'}>
      <YStack gap={space.sm}>
        <XStack
          alignSelf="flex-start"
          px={space.sm}
          py={2}
          br={radius.pill}
          bg={featured ? colors.primary : colors.surfaceMuted}
        >
          <Text
            col={featured ? colors.onPrimary : colors.textMuted}
            fos={fontSize.meta}
            fow={fontWeight.semibold}
          >
            {badge}
          </Text>
        </XStack>

        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
            {title}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {tagline}
          </Text>
        </YStack>

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {body}
        </Text>

        <YStack gap={space.xs}>
          {features.map((feature) => (
            <XStack key={feature.key} ai="center" gap={space.xs}>
              <Ionicons name={feature.icon} size={iconSize.sm} color={colors.primaryActive} />
              <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                {feature.label}
              </Text>
            </XStack>
          ))}
        </YStack>

        <YStack gap={space.xs}>
          <Image
            source={art}
            style={[styles.art, { aspectRatio: artRatio }]}
            contentFit="contain"
            // Ảnh TRANG TRÍ: mọi thứ nó nói đã có trong chữ ngay trên. Để trình đọc màn hình đọc
            // nó là bắt người dùng nghe một mô tả thừa giữa hai đoạn văn có nghĩa.
            accessible={false}
          />
          {artNote ? (
            <Text col={colors.textMuted} fos={fontSize.meta} ta="center">
              {artNote}
            </Text>
          ) : null}
        </YStack>

        <XStack
          ai="flex-start"
          gap={space.sm}
          p={space.sm}
          br={radius.md}
          bg={featured ? colors.surface : colors.surfaceMuted}
        >
          <Ionicons name={offerIcon} size={iconSize.sm} color={colors.primaryActive} />
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {offerTitle}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {offerBody}
            </Text>
          </YStack>
        </XStack>

        {cta}
      </YStack>
    </Card>
  );
}
