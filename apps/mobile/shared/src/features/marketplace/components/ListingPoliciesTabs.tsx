import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  HOLD_DYNAMIC_WINDOW,
  HOLD_FREE_CANCEL_HOURS,
  HOLD_PAYMENT_WINDOW_MINUTES,
  SERVICE_TYPE,
  appliesExcessMileage,
  serviceRequiresDriverLicence,
  type PublicListingDetail,
} from '@xeprime/types';
import { useDescribeCollateral } from '@/features/rental-policies/collateral-text';
import { useRentalConditionsText } from '@/features/rental-policies/rental-conditions';
import { Card } from '@/components/ui/Card';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import { LEGAL_DOC } from '@xeprime/domain';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';


const TABS = ['general', 'documents', 'collateral', 'cancellation'] as const;
type PolicyTab = (typeof TABS)[number];

/**
 * "Quy định & Chính sách" - bản native của `ListingPoliciesTabs` bên web (#212): bốn tab Quy định
 * chung · Giấy tờ thuê xe · Tài sản thế chấp · Điều khoản huỷ, CÙNG khoá với web
 * (`Listings.detail.policies.general/documents/collateral/cancellation.*`). Dịch vụ có tài xế hiện
 * ghi chú "giá trọn gói" (ADR 0075 - không còn phụ phí tài xế). Cùng điều kiện hiện từng khối với web.
 *
 * Hai mốc giữ chỗ đọc từ hằng số dùng chung với server như web - đây là mức TRẦN của chính sách
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
  const openLegalDoc = useOpenLegalDoc();
  const fmt = useAppFormat();
  const describeCollateral = useDescribeCollateral();
  const [tab, setTab] = useState<PolicyTab>('general');

  const activeTerms =
    listing.rentalTerms?.find((term) => term.serviceType === activeService) ?? null;
  // Giấy tờ + cách đối chiếu: luật chuẩn nền tảng (ADR 0112 điều 3), listing trả kèm (như web).
  const rules = useRentalConditionsText(listing.rentalConditions);

  // "Cọc tiền X hoặc Cọc tài sản (…)" - một câu chung mọi bề mặt (ADR 0112 điều 2).
  const collateralMode = listing.collateral
    ? describeCollateral({
        mode: listing.collateral.mode,
        cashEnabled: listing.collateral.cashEnabled,
        assetEnabled: listing.collateral.assetEnabled,
        combination: listing.collateral.combination,
        assetTypes: listing.collateral.assetTypes,
        depositAmount: listing.collateral.depositAmount,
      })
    : null;

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
        Tab TRƯỢT NGANG như web ≤640px (`.tabList` cuộn ngang, đệm 10 × 12, chữ 14) - người dùng chốt
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
                  col={active ? colors.primary : colors.placeholder}
                  fos={fontSize.body}
                  numberOfLines={1}
                  fow={fontWeight.semibold}
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

              {/* Khung giờ giao nhận đã gỡ (ADR 0078) - xe nhận và trả mọi giờ, không có gì để công bố. */}

              {activeService === SERVICE_TYPE.WITH_DRIVER ? (
                // Giá có tài xế là giá TRỌN GÓI (ADR 0075) - khách chỉ trả thêm phí cầu đường.
                // Chưa niêm yết giá có tài xế ⇒ giá đang hiện là giá thuê xe, chưa gồm tài xế (20/11/2026).
                listing.withDriverDailyPrice ? (
                  <Sub title={tDetail('withDriverPrice.title')}>
                    <Rule>{tDetail('withDriverPrice.included')}</Rule>
                    <Rule>{tDetail('withDriverPrice.excluded')}</Rule>
                  </Sub>
                ) : (
                  <Sub title={tDetail('withDriverPrice.pendingTitle')}>
                    <Rule>{tDetail('withDriverPrice.pendingPrice')}</Rule>
                    <Rule>{tDetail('withDriverPrice.pendingNegotiate')}</Rule>
                  </Sub>
                )
              ) : null}

              {/* Hoá đơn VAT (ADR 0059) - chỉ khi chủ xe đã công bố. */}
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
                <Rule>{tDetail('terms.documents', { documents: rules.documents })}</Rule>
                <Rule>{rules.verify}</Rule>
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
                <Rule>{t.rich('collateral.mode', { strong, mode: collateralMode ?? '' })}</Rule>
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
                {/* Hai cửa sổ của khoản giữ chỗ theo tỉ lệ ΔT, sàn, trần (ADR 0066) - đọc hằng dùng chung. */}
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
              {/* Hậu quả khi huỷ muộn phải nằm NGAY ở đây, trước khi khách gửi yêu cầu (web #347). */}
              <Rule>{t.rich('cancellation.late', { strong })}</Rule>
              <Tip>{`🛡️ ${t('cancellation.protection')}`}</Tip>
              {/* Toàn văn mở trong lớp xem văn bản của app (web: hộp xem nhanh) - khách vẫn ở trang xe. */}
              <LinkArrow label={t('cancellation.viewFull')} onPress={() => openLegalDoc(LEGAL_DOC.CANCELLATION)} />
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
