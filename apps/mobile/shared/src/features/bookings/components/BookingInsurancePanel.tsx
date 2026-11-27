import { useTranslations } from 'use-intl';
import { Text, XStack, YStack } from 'tamagui';
import {
  INSURANCE_COVERAGE_STATUS,
  INSURANCE_COVERAGE_STATUS_COLOR,
  type InsuranceCoverageStatus,
} from '@xeprime/types';
import type { InsuranceCoverage } from '@/api/insurance/api';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { InsuranceCertificateItem } from '@/features/insurance/components/InsuranceCoverageList';
import { useBookingInsuranceCoverage } from '@/features/insurance/hooks';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useLocalizedText } from '@/i18n/localized';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';

/**
 * Bảo hiểm của một đơn theo từng sản phẩm khách đã trả — phía gian hàng/chủ xe, CHỈ ĐỌC (ADR 0064).
 * Bản native của `BookingInsuranceCertificatesPanel` web.
 *
 * Gọi ngay khi đơn tồn tại, không chờ bàn giao: chủ xe cần biết TRƯỚC lúc giao xe rằng khách đã
 * mua bảo hiểm (chờ phát hành), và sau đó biết GCN đã cấp hay đang lỗi. Không mua ⇒ không vẽ gì.
 *
 * Figma "Bảo hiểm chuyến đi" `24512:131179` (người dùng chốt 20/11/2026): mỗi sản phẩm một thẻ nền
 * xanh nhạt viền xanh - tên + viên trạng thái, rồi "Phí đã trả" (dòng phụ = ghi chú trạng thái) và
 * số tiền. GCN đã cấp giữ thẻ giấy chứng nhận (số GCN, tải PDF).
 */
export function BookingInsurancePanel({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Insurance');
  const tCommon = useTranslations('Common');
  const { data, isError, refetch, isFetching } = useBookingInsuranceCoverage(bookingId, true);

  if (isError && !data) {
    return (
      <Callout tone="warning" title={t('coverage.loadError')}>
        <YStack ai="flex-start" pt={space.xs}>
          <Button
            label={tCommon('actions.retry')}
            size="sm"
            variant="secondary"
            block={false}
            loading={isFetching}
            onPress={() => void refetch()}
          />
        </YStack>
      </Callout>
    );
  }
  if (!data || data.length === 0) return null;
  return (
    <YStack gap={space.md}>
      {data.map((item) =>
        item.status === INSURANCE_COVERAGE_STATUS.ISSUED && item.certificate ? (
          <InsuranceCertificateItem key={item.kind} cert={item.certificate} />
        ) : (
          <CoverageCard key={item.kind} item={item} />
        ),
      )}
    </YStack>
  );
}

function CoverageCard({ item }: { item: InsuranceCoverage }) {
  const colors = useColors();
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const localized = useLocalizedText();
  const status = item.status as InsuranceCoverageStatus;
  const productName =
    localized(item.productNameVi, item.productNameEn) ?? domainLabel('insuranceProductKind', item.kind);
  const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;

  return (
    <YStack p={space.lg} gap={GAP} br={radius.card} bw={1} bc={colors.infoBorder} bg={colors.infoSurface}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text
          f={1}
          col={colors.text}
          // Cùng kiểu tiêu đề thẻ chung (`SectionCard`) như "Thanh toán", "Lợi nhuận chuyến".
          fos={fontSize.h4}
          lh={Math.round(fontSize.h4 * 1.4)}
          fow={fontWeight.bold}
        >
          {productName}
        </Text>
        {/* Viên KHÔNG chấm như Figma (người dùng 20/11/2026). */}
        <Pill
          label={t(`coverage.status.${status}`)}
          tone={pillToneOfStatusColor(INSURANCE_COVERAGE_STATUS_COLOR[status])}
        />
      </XStack>
      <XStack ai="flex-start" jc="space-between" gap={space.md}>
        <YStack f={1} minWidth={0}>
          <Text col={colors.textMuted} {...body}>
            {t('coverage.premium')}
          </Text>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {t(`coverage.note.${status}`)}
          </Text>
        </YStack>
        <Text col={colors.text} {...body} fow={fontWeight.medium}>
          {fmt.money(item.premiumAmount)}
        </Text>
      </XStack>
    </YStack>
  );
}

/** Figma: tên ↔ dòng phí cách 12. */
const GAP = 12;
