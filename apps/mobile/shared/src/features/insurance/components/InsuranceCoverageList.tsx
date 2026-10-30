import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Linking, Platform, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  INSURANCE_COVERAGE_STATUS,
  INSURANCE_COVERAGE_STATUS_COLOR,
  STATUS_COLOR,
  type InsuranceCoverageStatus,
} from '@xeprime/types';
import type { InsuranceCertificate, InsuranceCoverage } from '@/api/insurance/api';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCopy } from '@/hooks/use-copy';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useLocalizedText } from '@/i18n/localized';
import { logger } from '@/lib/logger';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/** Số GCN in đơn cách như `.mono` của web — `monospace` chỉ là tên font của Android. */
const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Bảo hiểm của một chuyến theo TỪNG sản phẩm khách đã trả (ADR 0064) — bản native của
 * `InsuranceCoverageList` web. Dùng ở chi tiết chuyến của khách và chi tiết đơn của gian hàng.
 *
 * Khách đã trả `IV`/`IP` phải thấy tiền đó đang ở đâu kể cả khi GCN CHƯA có (chờ bàn giao, đang
 * phát hành, lỗi) hoặc không bao giờ có (đã hoàn, đã thu hồi). Dòng `issued` dùng lại thẻ GCN.
 * Danh sách rỗng ⇒ không render gì: chuyến không mua bảo hiểm.
 */
export function InsuranceCoverageList({ coverage }: { coverage: readonly InsuranceCoverage[] }) {
  const t = useTranslations('Insurance');
  if (coverage.length === 0) return null;

  return (
    <InsuranceBlock title={t('coverage.title')}>
      {coverage.map((item) =>
        item.status === INSURANCE_COVERAGE_STATUS.ISSUED && item.certificate ? (
          <InsuranceCertificateItem key={item.kind} cert={item.certificate} />
        ) : (
          <CoverageItem key={item.kind} item={item} />
        ),
      )}
    </InsuranceBlock>
  );
}

/**
 * Giấy chứng nhận ĐÃ CẤP của một đơn — bản native của `InsuranceCertificateList` web. Rỗng ⇒ không
 * render gì: chưa bàn giao xe thì chưa có giấy nào để nói tới.
 */
export function InsuranceCertificateList({
  certificates,
}: {
  certificates: readonly InsuranceCertificate[];
}) {
  const t = useTranslations('Insurance');
  if (certificates.length === 0) return null;

  return (
    <InsuranceBlock title={t('certificate.title')}>
      {certificates.map((cert) => (
        <InsuranceCertificateItem key={cert.id} cert={cert} />
      ))}
    </InsuranceBlock>
  );
}

function InsuranceBlock({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack gap={space.sm} minWidth={0}>
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="shield-checkmark-outline" size={iconSize.md} color={colors.text} />
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold} accessibilityRole="header">
          {title}
        </Text>
      </XStack>
      <YStack gap={space.sm}>{children}</YStack>
    </YStack>
  );
}

function ItemCard({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack
      gap={space.sm}
      p={space.md}
      bw={1}
      bc={colors.border}
      br={radius.md}
      bg={colors.surface}
      minWidth={0}
    >
      {children}
    </YStack>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <XStack jc="space-between" gap={space.xs} flexWrap="wrap">
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      {typeof children === 'string' ? (
        <Text col={colors.text} fos={fontSize.bodySm} ta="right" flexShrink={1}>
          {children}
        </Text>
      ) : (
        children
      )}
    </XStack>
  );
}

function CoverageItem({ item }: { item: InsuranceCoverage }) {
  const colors = useColors();
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const localized = useLocalizedText();
  const productName =
    localized(item.productNameVi, item.productNameEn) ??
    domainLabel('insuranceProductKind', item.kind);
  const status = item.status as InsuranceCoverageStatus;

  return (
    <ItemCard>
      <XStack ai="center" gap={space.xs} flexWrap="wrap">
        <Text col={colors.text} fow={fontWeight.semibold} flexShrink={1}>
          {productName}
        </Text>
        <StatusBadge
          label={t(`coverage.status.${status}`)}
          color={INSURANCE_COVERAGE_STATUS_COLOR[status]}
          size="sm"
        />
      </XStack>
      <Fact label={t('coverage.premium')}>{fmt.money(item.premiumAmount)}</Fact>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t(`coverage.note.${status}`)}
      </Text>
    </ItemCard>
  );
}

/** Một GCN đã cấp — dùng lại ở `InsuranceCoverageList` cho dòng `issued`. */
export function InsuranceCertificateItem({ cert }: { cert: InsuranceCertificate }) {
  const colors = useColors();
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const localized = useLocalizedText();
  const copy = useCopy();
  const productName =
    localized(cert.productNameVi, cert.productNameEn) ??
    domainLabel('insuranceProductKind', cert.productKind);

  const openCertificate = (url: string) => {
    Linking.openURL(url).catch((error: unknown) => {
      logger.error(`Không mở được giấy chứng nhận bảo hiểm: ${url}`, { error });
    });
  };

  return (
    <ItemCard>
      <XStack ai="center" gap={space.xs} flexWrap="wrap">
        <Text col={colors.text} fow={fontWeight.semibold} flexShrink={1}>
          {productName}
        </Text>
        {cert.isTest ? (
          <StatusBadge label={t('certificate.testTag')} color={STATUS_COLOR.WARNING} size="sm" />
        ) : null}
      </XStack>
      <YStack gap={space.xs}>
        <Fact label={t('certificate.number')}>
          <Pressable
            onPress={() => void copy(cert.certificateNumber)}
            accessibilityRole="button"
            accessibilityLabel={t('certificate.copyNumber')}
            hitSlop={space.xs}
          >
            <XStack ai="center" gap={space.xs}>
              <Text col={colors.text} fos={fontSize.bodySm} fontFamily={MONO_FONT}>
                {cert.certificateNumber}
              </Text>
              <Ionicons name="copy-outline" size={iconSize.xs} color={colors.textMuted} />
            </XStack>
          </Pressable>
        </Fact>
        {cert.coverageFrom && cert.coverageTo ? (
          <Fact label={t('certificate.coverage')}>
            {fmt.dateTimeRange(cert.coverageFrom, cert.coverageTo)}
          </Fact>
        ) : null}
        <Fact label={t('certificate.partner')}>{cert.partnerName}</Fact>
      </YStack>
      {cert.isTest ? (
        <Text col={colors.warning} fos={fontSize.bodySm}>
          {t('certificate.testNote')}
        </Text>
      ) : null}
      {cert.certificateUrl ? (
        <Button
          label={t('certificate.view')}
          icon="open-outline"
          variant="secondary"
          block={false}
          onPress={() => openCertificate(cert.certificateUrl as string)}
        />
      ) : null}
    </ItemCard>
  );
}
