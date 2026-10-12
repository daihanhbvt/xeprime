import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CUSTOMER_DOCUMENT_TYPE_LABEL,
  DRIVER_DEPOSIT_MODE,
  DRIVER_SURCHARGE_KIND_SPEC,
  SERVICE_TYPE,
  type CustomerDocumentType,
  type DriverSurchargeKind,
  type ServiceType,
} from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { PublicListingDetail } from '../api';

/**
 * Ba khối điều kiện của trang xe — bản native của `ListingDetailView` (web), cùng điều kiện hiện,
 * cùng khoá chữ `Listings.detail.{terms,handover,surcharges}`:
 *
 *  1. **Thủ tục & điều kiện thuê** — khi chủ xe có điều khoản cho ĐÚNG dịch vụ đang chọn. Server
 *     đã tính `requiredDocuments` hiệu lực; client chỉ hiển thị.
 *  2. **Khung giờ giao nhận** — khi có ít nhất một khung nhận hoặc trả.
 *  3. **Phụ phí có thể phát sinh** — chỉ dịch vụ CÓ TÀI XẾ và xe có quy tắc phụ phí.
 *
 * Xe không cấu hình gì thì không dựng khối nào. Payload thiếu trường (API cũ) cũng chỉ mất khối
 * đó, phần còn lại của trang vẫn dựng — đúng ghi chú của web.
 */
export function ListingConditionCards({
  listing,
  activeService,
}: {
  listing: PublicListingDetail;
  activeService: ServiceType;
}) {
  const t = useTranslations('Listings.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const activeTerms =
    listing.rentalTerms?.find((term) => term.serviceType === activeService) ?? null;
  /** Ngưỡng của một loại phụ phí là tri thức miền (`DRIVER_SURCHARGE_KIND_SPEC`), không đi trên dây. */
  const thresholdKindOf = (kind: string) =>
    DRIVER_SURCHARGE_KIND_SPEC[kind as DriverSurchargeKind]?.threshold ?? null;
  const windowLabels = (windows: ReadonlyArray<{ start: string; end: string }>) =>
    windows.map((window) => `${window.start}–${window.end}`);
  const pickupWindows = windowLabels(listing.handover?.pickupWindows ?? []);
  const returnWindows = windowLabels(listing.handover?.returnWindows ?? []);
  const surchargeRules =
    activeService === SERVICE_TYPE.WITH_DRIVER ? (listing.driverSurchargeRules ?? []) : [];

  return (
    <>
      {activeTerms ? (
        <ConditionCard icon="shield-checkmark-outline" title={t('terms.title')}>
          {activeTerms.instantBookEnabled ? (
            <XStack ai="center" gap={space.xs} flexWrap="wrap">
              <XStack
                bg={colors.primaryLight}
                bw={1}
                bc={colors.primary}
                br={radius.pill}
                px={space.sm}
                py={2}
              >
                <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.semibold}>
                  {t('terms.instantBook')}
                </Text>
              </XStack>
              <Line text={t('terms.instantBookHint')} />
            </XStack>
          ) : null}
          <Line
            text={t('terms.documents', {
              documents: activeTerms.requiredDocuments
                .map((doc) =>
                  domainLabel(
                    'customerDocumentType',
                    doc,
                    CUSTOMER_DOCUMENT_TYPE_LABEL[doc as CustomerDocumentType],
                  ),
                )
                .join(', '),
            })}
          />
          <Line
            text={t('terms.verify', {
              method: domainLabel('identityVerifyMethod', activeTerms.identityVerifyMethod),
            })}
          />
          {activeService === SERVICE_TYPE.WITH_DRIVER ? (
            <Line
              text={
                !activeTerms.depositMode || activeTerms.depositMode === DRIVER_DEPOSIT_MODE.NONE
                  ? t('terms.driverDepositNone')
                  : t('terms.driverDeposit', {
                      mode: domainLabel('driverDepositMode', activeTerms.depositMode),
                    })
              }
            />
          ) : null}
          {activeTerms.termsText ? (
            <Text col={colors.text} fos={fontSize.bodySm}>
              {activeTerms.termsText}
            </Text>
          ) : null}
          {activeTerms.requireTermsAcceptance ? (
            <Line text={t('terms.acceptanceRequired')} />
          ) : null}
        </ConditionCard>
      ) : null}

      {pickupWindows.length > 0 || returnWindows.length > 0 ? (
        <ConditionCard icon="time-outline" title={t('handover.title')}>
          {pickupWindows.length > 0 ? (
            <Line text={t('handover.pickup', { windows: pickupWindows.join(', ') })} />
          ) : null}
          {returnWindows.length > 0 ? (
            <Line text={t('handover.return', { windows: returnWindows.join(', ') })} />
          ) : null}
        </ConditionCard>
      ) : null}

      {surchargeRules.length > 0 ? (
        <ConditionCard icon="cash-outline" title={t('surcharges.title')}>
          {surchargeRules.map((rule) => {
            const thresholdKind = thresholdKindOf(rule.kind);
            return (
              <Line
                key={rule.kind}
                text={`${t('surcharges.rule', {
                  kind: domainLabel('driverSurchargeKind', rule.kind),
                  amount: fmt.money(rule.amount),
                  unit: domainLabel('driverSurchargeUnit', rule.unit),
                })}${
                  rule.thresholdValue != null && thresholdKind
                    ? ` · ${t('surcharges.threshold', {
                        kind: domainLabel('driverSurchargeThresholdKind', thresholdKind),
                        value: rule.thresholdValue,
                      })}`
                    : ''
                }`}
              />
            );
          })}
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('surcharges.note')}
          </Text>
        </ConditionCard>
      ) : null}
    </>
  );
}

/** Cùng khuôn thẻ với "Điều kiện bảo đảm" và "Hạn mức quãng đường" của trang xe. */
function ConditionCard({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card lift="flat">
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.xs}>
          <Ionicons name={icon} size={17} color={colors.primaryActive} />
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {title}
          </Text>
        </XStack>
        <YStack gap={space.xs}>{children}</YStack>
      </YStack>
    </Card>
  );
}

function Line({ text }: { text: string }) {
  const lineHeight = Math.round(fontSize.bodySm * 1.5);
  return (
    <XStack ai="flex-start" gap={space.xs}>
      <YStack h={lineHeight} jc="center">
        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
      </YStack>
      <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} lineHeight={lineHeight}>
        {text}
      </Text>
    </XStack>
  );
}
