import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  COLLATERAL_ASSET_TYPE_LABEL,
  COLLATERAL_MODE,
  CUSTOMER_DOCUMENT_TYPE_LABEL,
  DRIVER_DEPOSIT_MODE,
  HOLD_DYNAMIC_WINDOW,
  HOLD_FREE_CANCEL_HOURS,
  HOLD_PAYMENT_WINDOW_MINUTES,
  IDENTITY_VERIFY_METHOD,
  SERVICE_TYPE,
  appliesExcessMileage,
  requiredIdentityDocuments,
  serviceRequiresDriverLicence,
  type CollateralAssetType,
  type CustomerDocumentType,
  type PublicListingDetail,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import { useDriverSurchargeLine } from '../hooks/use-driver-surcharge-line';

const TABS = ['general', 'documents', 'collateral', 'cancellation'] as const;
type PolicyTab = (typeof TABS)[number];

/**
 * "Quy định & Chính sách" — bản native của `ListingPoliciesTabs` bên web (#212): bốn tab Quy định
 * chung · Giấy tờ thuê xe · Tài sản thế chấp · Điều khoản huỷ, CÙNG khoá với web
 * (`Listings.detail.policies.general/documents/collateral/cancellation.*`), phụ phí tài xế qua
 * `useDriverSurchargeLine`. Cùng điều kiện hiện từng khối với web.
 *
 * Hai mốc giữ chỗ đọc từ hằng số dùng chung với server như web — đây là mức TRẦN của chính sách
 * (cửa sổ thật của từng chuyến co lại khi đặt sát giờ, `holdWindowsFor`, và hiện ở màn chuyến).
 */
export function ListingPoliciesTabs({
  listing,
  activeService,
}: {
  listing: PublicListingDetail;
  activeService: string;
}) {
  const colors = useColors();
  const t = useTranslations('Listings.detail.policies');
  const tDetail = useTranslations('Listings.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const surchargeLine = useDriverSurchargeLine();
  const [tab, setTab] = useState<PolicyTab>('general');

  const activeTerms =
    listing.rentalTerms?.find((term) => term.serviceType === activeService) ?? null;
  const windowLabels = (windows: ReadonlyArray<{ start: string; end: string }>) =>
    windows.map((window) => `${window.start}–${window.end}`).join(', ');
  const pickupWindows = windowLabels(listing.handover?.pickupWindows ?? []);
  const returnWindows = windowLabels(listing.handover?.returnWindows ?? []);
  const requiredDocs =
    activeTerms?.requiredDocuments && activeTerms.requiredDocuments.length > 0
      ? activeTerms.requiredDocuments
      : requiredIdentityDocuments(activeService);
  const docLabel = (doc: string) =>
    domainLabel(
      'customerDocumentType',
      doc,
      CUSTOMER_DOCUMENT_TYPE_LABEL[doc as CustomerDocumentType] ?? doc,
    );

  const collateralMode = (() => {
    const collateral = listing.collateral;
    if (!collateral) return null;
    if (collateral.mode === COLLATERAL_MODE.CASH) return t('collateral.modeCash');
    const types = (collateral.assetTypes ?? []).map((type) =>
      domainLabel(
        'collateralAssetType',
        type,
        COLLATERAL_ASSET_TYPE_LABEL[type as CollateralAssetType] ?? type,
      ),
    );
    return types.length > 0
      ? t('collateral.modeAssetTypes', { types: types.join(', ') })
      : t('collateral.modeAsset');
  })();

  const strong = (chunks: ReactNode) => (
    <Text col={colors.text} fow={fontWeight.semibold}>
      {chunks}
    </Text>
  );

  return (
    <YStack gap={space.md} accessibilityLabel={t('label')}>
      <Text
        col={colors.text}
        fos={fontSize.h4}
        fow={fontWeight.semibold}
        accessibilityRole="header"
      >
        {t('title')}
      </Text>

      {/*
        Tab TRƯỢT NGANG như web ≤640px (`.tabList` cuộn ngang, đệm 10 × 12, chữ 14) — người dùng chốt
        27/10/2026: xuống dòng làm "Điều khoản huỷ" rơi một mình xuống hàng dưới.
      */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <XStack accessibilityRole="tablist" borderBottomWidth={1} bc={colors.borderSubtle}>
        {TABS.map((key) => {
          const active = key === tab;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <YStack
                px={12}
                minHeight={sizing.touchTarget}
                jc="center"
                // Tab GẠCH CHÂN như web (ListingPoliciesTabs.module.css `.tab`/`.tabActive`).
                borderBottomWidth={2}
                borderBottomColor={active ? colors.primary : 'transparent'}
              >
                <Text
                  col={active ? colors.primary : colors.textMuted}
                  fos={fontSize.body}
                  numberOfLines={1}
                  fow={active ? fontWeight.semibold : fontWeight.medium}
                >
                  {t(`tabs.${key}`)}
                </Text>
              </YStack>
            </Pressable>
          );
        })}
      </XStack>
      </ScrollView>

      <Card lift="flat">
        <YStack gap={space.sm}>
          {tab === 'general' ? (
            <>
              {(['purpose', 'noSmoking', 'handover'] as const).map((key) => (
                <Rule key={key}>{t(`general.${key}`)}</Rule>
              ))}

              {appliesExcessMileage(activeService) && listing.mileagePolicy ? (
                <Sub title={tDetail('mileage.title')}>
                  <Rule>
                    {tDetail('mileage.included', {
                      km: fmt.km(listing.mileagePolicy.includedKmPerDay),
                      fee: fmt.money(listing.mileagePolicy.excessFeePerKm),
                    })}
                  </Rule>
                  <Rule>{tDetail('mileage.note')}</Rule>
                </Sub>
              ) : null}

              {pickupWindows || returnWindows ? (
                <Sub title={tDetail('handover.title')}>
                  {pickupWindows ? (
                    <Rule>{tDetail('handover.pickup', { windows: pickupWindows })}</Rule>
                  ) : null}
                  {returnWindows ? (
                    <Rule>{tDetail('handover.return', { windows: returnWindows })}</Rule>
                  ) : null}
                </Sub>
              ) : null}

              {activeService === SERVICE_TYPE.WITH_DRIVER ? (
                <Sub title={tDetail('surcharges.title')}>
                  {(listing.driverSurchargeRules ?? []).map((rule) => (
                    <Rule key={rule.kind}>{surchargeLine(rule)}</Rule>
                  ))}
                  {activeTerms?.depositMode ? (
                    <Rule>
                      {activeTerms.depositMode === DRIVER_DEPOSIT_MODE.NONE
                        ? tDetail('terms.driverDepositNone')
                        : tDetail('terms.driverDeposit', {
                            mode: domainLabel('driverDepositMode', activeTerms.depositMode),
                          })}
                    </Rule>
                  ) : null}
                </Sub>
              ) : null}

              {/* Hoá đơn VAT (ADR 0059) — chỉ khi chủ xe đã công bố. */}
              {listing.vatInvoiceSupported ? (
                <Sub title={tDetail('vatInvoice.title')}>
                  <Rule>{tDetail('vatInvoice.body')}</Rule>
                  <Rule>{tDetail('vatInvoice.disclaimer')}</Rule>
                </Sub>
              ) : null}

              <Tip>{`💡 ${t('general.tip')}`}</Tip>
            </>
          ) : null}

          {tab === 'documents' ? (
            activeTerms ? (
              <>
                <SubTitle text={tDetail('terms.title')} />
                {activeTerms.instantBookEnabled ? (
                  <Rule>{`${tDetail('terms.instantBook')} · ${tDetail('terms.instantBookHint')}`}</Rule>
                ) : null}
                <Rule>
                  {tDetail('terms.documents', {
                    documents: requiredDocs.map(docLabel).join(', '),
                  })}
                </Rule>
                {/* Nhãn `identityVerifyMethod` đã là cả câu; chưa khai ⇒ đối chiếu bản gốc tại chỗ. */}
                <Rule>
                  {domainLabel(
                    'identityVerifyMethod',
                    activeTerms.identityVerifyMethod ?? IDENTITY_VERIFY_METHOD.IN_PERSON,
                  )}
                </Rule>
                {activeTerms.termsText ? <Rule>{activeTerms.termsText}</Rule> : null}
                {activeTerms.requireTermsAcceptance ? (
                  <Rule>{tDetail('terms.acceptanceRequired')}</Rule>
                ) : null}
                {serviceRequiresDriverLicence(activeService) ? (
                  <Tip>{`📌 ${t('documents.licenceRequired')}`}</Tip>
                ) : null}
              </>
            ) : (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('documents.empty')}
              </Text>
            )
          ) : null}

          {tab === 'collateral' ? (
            <>
              <SubTitle text={tDetail('collateralTitle')} />
              {listing.noCollateral ? (
                <Rule>{t.rich('collateral.none', { strong })}</Rule>
              ) : listing.collateral ? (
                <>
                  <Rule>{t.rich('collateral.mode', { strong, mode: collateralMode ?? '' })}</Rule>
                  {listing.collateral.depositAmount &&
                  !isZeroMoney(listing.collateral.depositAmount) ? (
                    <Rule>
                      {t.rich('collateral.amount', {
                        strong,
                        amount: fmt.money(listing.collateral.depositAmount),
                      })}
                    </Rule>
                  ) : null}
                </>
              ) : (
                <Rule>{t('collateral.unknown')}</Rule>
              )}
              <Tip>{`⚠️ ${t('collateral.note')}`}</Tip>
            </>
          ) : null}

          {tab === 'cancellation' ? (
            <>
              <SubTitle text={t('cancellation.title')} />
              {/* Huỷ miễn phí tính XUÔI từ lúc chủ xe nhận chuyến (ADR 0032 điều 2 · ADR 0044 điều 3). */}
              <Rule>
                {/* Hai cửa sổ của khoản giữ chỗ theo tỉ lệ ΔT, sàn, trần (ADR 0066) — đọc hằng dùng chung. */}
                {t.rich('cancellation.free', {
                  strong,
                  percent: Math.round(HOLD_DYNAMIC_WINDOW.FREE_CANCEL_SHARE * 100),
                  minMinutes: HOLD_DYNAMIC_WINDOW.MIN_MINUTES,
                  hours: HOLD_FREE_CANCEL_HOURS,
                })}
              </Rule>
              <Rule>
                {t.rich('cancellation.hold', {
                  strong,
                  percent: Math.round(HOLD_DYNAMIC_WINDOW.PAYMENT_SHARE * 100),
                  minMinutes: HOLD_DYNAMIC_WINDOW.MIN_MINUTES,
                  minutes: HOLD_PAYMENT_WINDOW_MINUTES,
                })}
              </Rule>
              <Rule>{t('cancellation.release')}</Rule>
              <Tip>{`🛡️ ${t('cancellation.protection')}`}</Tip>
            </>
          ) : null}
        </YStack>
      </Card>
    </YStack>
  );
}

function SubTitle({ text }: { text: string }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
      {text}
    </Text>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap={space.xs} pt={space.xs}>
      <SubTitle text={title} />
      {children}
    </YStack>
  );
}

function Rule({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <XStack ai="flex-start" gap={space.sm}>
      <YStack w={5} h={5} mt={7} br={radius.pill} bg={colors.primary} />
      <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
        {children}
      </Text>
    </XStack>
  );
}

function Tip({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack mt={space.xs} p={space.sm} br={radius.md} bg={colors.primaryLight}>
      <Text col={colors.text} fos={fontSize.label}>
        {children}
      </Text>
    </YStack>
  );
}
