import { Image } from 'expo-image';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SELLER_ENTITY_TYPE } from '@xeprime/types';
import { images } from '@/assets';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { PublicShop } from '../api';
import { ShopCheckIcon, ShopTickIcon } from './shop-icons';

/** Ảnh minh hoạ của mỗi ô cam kết (web `.tileImage` 80×80). */
const TILE_IMAGE = 80;
/** Ô dấu tích vàng trước mỗi dòng xác thực (web `.checkIcon` 20×20). */
const CHECK_ICON = 20;

interface TrustTile {
  key: string;
  /** Ảnh tĩnh của app (`images.shopTile*`) — expo-image nhận thẳng module ảnh. */
  image: (typeof images)['shopTileLegal'];
  title: string;
  body: (string | null)[];
}

/**
 * Khối UY TÍN của trang gian hàng — bản native của web `ShopTrust` (#222, Figma `21621:69873`
 * thẻ "Xác thực XePrime" và `20063:59213` hàng ô cam kết). Chỉ vẽ cho mặt tiền GIAN HÀNG.
 *
 * Mỗi dòng là một sự thật có người chịu trách nhiệm (`shop.trust`): hồ sơ người bán + giấy phép đã
 * được nền tảng duyệt, phiếu duyệt gian hàng, OTP của chủ, cam kết VAT, sổ bảo dưỡng. Dòng nào
 * chưa có nguồn thì KHÔNG vẽ (ADR 0028).
 */
export function ShopTrust({
  trust,
  vehicleCount,
  noCollateralCount,
}: {
  trust: PublicShop['trust'];
  vehicleCount: number;
  noCollateralCount: number;
}) {
  const colors = useColors();
  const t = useTranslations('Shops.trust');

  const legalEntityKey =
    trust.legalEntityType === SELLER_ENTITY_TYPE.COMPANY
      ? 'company'
      : trust.legalEntityType === SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS
        ? 'household_business'
        : null;

  const checks = [
    legalEntityKey ? t(`legalEntity.${legalEntityKey}`) : null,
    trust.shopVerified ? t('shopVerified') : null,
    trust.contactVerified ? t('contactVerified') : null,
  ].filter((line): line is string => line !== null);

  const tiles: TrustTile[] = [];
  if (trust.vatInvoiceSupported) {
    tiles.push({
      key: 'legal',
      image: images.shopTileLegal,
      title: t('tiles.legal.title'),
      body: [t('tiles.legal.vat'), legalEntityKey ? t('tiles.legal.verified') : null],
    });
  }
  if (trust.maintenanceOnScheduleCount > 0 && vehicleCount > 0) {
    tiles.push({
      key: 'maintenance',
      image: images.shopTileMaintenance,
      title: t('tiles.maintenance.title'),
      body: [
        t('tiles.maintenance.body', {
          onSchedule: trust.maintenanceOnScheduleCount,
          total: vehicleCount,
        }),
      ],
    });
  }
  tiles.push({
    key: 'deposit',
    image: images.shopTileWallet,
    title: t('tiles.deposit.title'),
    body: [
      t('tiles.deposit.body'),
      noCollateralCount > 0
        ? t('tiles.deposit.noCollateral', { count: noCollateralCount, total: vehicleCount })
        : null,
    ],
  });

  return (
    <YStack gap={space.lg} accessibilityLabel={t('sectionLabel')}>
      {checks.length > 0 ? (
        <YStack
          gap={20}
          p={space.md}
          bw={1}
          bc={colors.border}
          br={radius.card}
          bg={colors.surface}
        >
          <XStack ai="center" flexWrap="wrap" gap={space.sm}>
            <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} accessibilityRole="header">
              {t('title')}
            </Text>
            {trust.shopVerified ? (
              <XStack ai="center" gap={6} px={space.sm} py={2} br={radius.card} bg={colors.infoSurface}>
                <ShopTickIcon color={colors.info} />
                <Text col={colors.info} fos={fontSize.body} fow={fontWeight.medium}>
                  {t('badge')}
                </Text>
              </XStack>
            ) : null}
          </XStack>
          <YStack gap={space.sm + space.xs}>
            {checks.map((line) => (
              <XStack key={line} ai="flex-start" gap={space.sm}>
                <YStack
                  w={CHECK_ICON}
                  h={CHECK_ICON}
                  mt={1}
                  br={radius.pill}
                  bg={colors.primaryLight}
                  ai="center"
                  jc="center"
                >
                  <ShopCheckIcon color={colors.primary} />
                </YStack>
                <Text f={1} col={colors.textMuted} fos={fontSize.body}>
                  {line}
                </Text>
              </XStack>
            ))}
          </YStack>
        </YStack>
      ) : null}

      {/* Bề ngang điện thoại: các ô xếp một cột (web `auto-fit, minmax(240px, 1fr)`), khoảng cách `md`. */}
      <YStack gap={space.md}>
        {tiles.map((tile) => (
          <YStack
            key={tile.key}
            ai="center"
            gap={20}
            p={space.md}
            bw={1}
            bc={colors.border}
            br={radius.card}
            bg={colors.surface}
          >
            <Image
              source={tile.image}
              style={{ width: TILE_IMAGE, height: TILE_IMAGE }}
              contentFit="contain"
              accessible={false}
            />
            <YStack gap={6} ai="center">
              <Text
                col={colors.text}
                fos={fontSize.h3}
                fow={fontWeight.semibold}
                ta="center"
                accessibilityRole="header"
              >
                {tile.title}
              </Text>
              {tile.body
                .filter((line): line is string => line !== null)
                .map((line) => (
                  <Text key={line} col={colors.textMuted} fos={fontSize.body} ta="center">
                    {line}
                  </Text>
                ))}
            </YStack>
          </YStack>
        ))}
      </YStack>
    </YStack>
  );
}
