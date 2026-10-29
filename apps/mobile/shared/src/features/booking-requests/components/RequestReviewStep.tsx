import { useState, type ReactNode, type RefObject } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, type View } from 'react-native';
import { Controller, useFormState, useWatch, type Control } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  COLLATERAL_MODE,
  HOLD_PAYMENT_WINDOW_MINUTES,
  isSameVnPhone,
  type PublicListingDetail,
} from '@xeprime/types';
import { type RentalMode, LIST_SEPARATOR } from '@xeprime/domain';
import type { DriverLicence } from '@/api/driver-licence/api';
import { CheckMark } from '@/components/ui/CheckMark';
import { FormSection } from '@/components/ui/FormSection';
import { TextField } from '@/components/ui/TextField';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { BookingRequestFormValues } from '../booking-schema';
import { CUSTOMER_NAME_MAX, NOTE_MAX } from '../booking-schema';
import type { RequestForm } from '../RequestBookingScreen';
import { DeliveryEstimate } from './RequestTripStep';
import { BookingTripCard } from './BookingTripCard';
import {
  useCustomerCostView,
  type CustomerCostBreakdown,
} from '../hooks/use-customer-cost-view';

/** Chuyện xảy ra sau khi gửi — cùng bốn nhánh `BookingReviewNextStep` của web. */
export type BookingReviewNextStep = 'instantHold' | 'instantConfirmed' | 'hold' | 'general';

interface RequestReviewStepProps {
  values: BookingRequestFormValues;
  /** Cùng form của bước Chuyến đi — ô lời nhắn và ô đồng ý ghi vào đây. */
  form: RequestForm;
  listing: PublicListingDetail;
  /** Cách tính thời gian đang chọn — vào dòng "Hình thức", đúng như web. */
  rentalMode: RentalMode;
  /**
   * Người thuê = TÀI KHOẢN đang đăng nhập (ADR 0060) — server đọc đúng họ tên + SĐT đó để ghi vào
   * yêu cầu. Chỉ đọc: đổi số là việc của màn tài khoản, không phải của một lượt đặt xe.
   */
  renter: { name: string; phone: string | null; email: string | null; verified: boolean } | null;
  /** Chuyến cần bằng lái (tự lái/dài hạn — ADR 0057) và bằng ĐÃ XÁC THỰC của tài khoản. */
  licence: { required: boolean; current: DriverLicence | null };
  /** Ô đồng ý có phủ điều khoản của CHỦ XE không — đổi câu đồng ý (`bookingCheckHost`). */
  agreementCoversHostTerms: boolean;
  nextStep: BookingReviewNextStep;
  /** Khách bấm gửi khi chưa tick ô đồng ý. */
  agreementMissing: boolean;
  /** Gắn vào khối ô đồng ý — màn cha cuộn tới đó khi khách bấm Gửi mà chưa tick. */
  consentRef?: RefObject<View | null>;
  /** Báo giá đã áp mã — để đọc CỌC THẾ CHẤP khi nhận xe (vẽ ở thẻ giấy tờ, như web #230). */
  breakdown: CustomerCostBreakdown | null;
  isDelivery: boolean;
  disabled?: boolean;
  /** Hai thẻ tiền (`BookingPriceSummary variant="review"`) — kèm ô áp mã khuyến mãi. */
  costs?: ReactNode;
}

/**
 * Màn "Xem lại yêu cầu thuê xe" — bản native của `BookingReviewStep` bên web (#205): chuyến ·
 * người thuê + lời nhắn · giấy tờ & điều kiện · ô đồng ý BẮT BUỘC · chuyện xảy ra sau khi gửi.
 *
 * Tiền là **báo giá của SERVER** (slot `costs` do màn cha truyền, đặt trước ô đồng ý như web) — không có
 * phép nhân nào ở đây. Nút gửi nằm ở khối dính đáy của màn cha (bản native của nút trong thẻ đồng
 * ý bên web: trên điện thoại nút chính luôn ở tầm ngón cái).
 */
export function RequestReviewStep({
  values,
  form,
  listing,
  rentalMode,
  renter,
  licence,
  agreementCoversHostTerms,
  nextStep,
  agreementMissing,
  consentRef,
  breakdown,
  isDelivery,
  costs,
}: RequestReviewStepProps) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const tLegal = useTranslations('Legal');
  const tPrice = useTranslations('Common.components.price');
  // Cọc thế chấp khi nhận xe — điều kiện NHẬN XE, trao tay chủ xe, nên nằm ở thẻ giấy tờ (web #230).
  const { deposit } = useCustomerCostView({ listing, breakdown, isDelivery });
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  /** Điều khoản chủ xe cho ĐÚNG dịch vụ đang chọn — cùng phép chọn với web và với lượt gửi. */
  const activeTerms =
    listing.rentalTerms?.find((term) => term.serviceType === values.serviceType) ?? null;

  const verifiedLicence = licence.required ? licence.current : null;
  const licenceMeta = verifiedLicence
    ? [
        verifiedLicence.classes.length
          ? t('reviewPage.requirements.licenceClasses', {
              classes: verifiedLicence.classes.join(', '),
            })
          : null,
        verifiedLicence.noExpiry
          ? t('reviewPage.requirements.licenceNoExpiry')
          : verifiedLicence.expiresOn
            ? t('reviewPage.requirements.licenceExpires', {
                date: fmt.dateKey(verifiedLicence.expiresOn),
              })
            : null,
      ]
        .filter(Boolean)
        .join(LIST_SEPARATOR)
    : '';
  const hostDocuments = activeTerms?.requiredDocuments ?? [];
  return (
    <YStack gap={space.lg}>
      <YStack gap={space.xs}>
        <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} accessibilityRole="header">
          {t('reviewPage.title')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('reviewPage.description')}
        </Text>
      </YStack>

      {/*
        Thẻ chuyến biến thể `review` — Figma `21850:69704` + web `BookingTripCard variant="review"`:
        ảnh lớn, tên + thông số căn giữa, khung lịch có icon tròn, nơi nhận xe, chủ xe + tóm tắt
        "dịch vụ · thời lượng" vàng. Ước tính giao xe (không nằm trong tổng — ADR 0018) chen giữa.
      */}
      <BookingTripCard
        listing={listing}
        values={values}
        rentalMode={rentalMode}
        variant="review"
        showMileage
      >
        {values.deliveryRequested ? <DeliveryEstimate form={form} vehicleId={listing.id} /> : null}
      </BookingTripCard>

      {/* ── Thông tin người thuê + lời nhắn ──────────────────────────────────── */}
      <FormSection title={t('reviewPage.renter.title')} icon="person-outline">
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {/* Chưa có tài khoản để điền thì chưa có ô nào để sửa — câu chỉ-đọc, như web. */}
          {renter ? t('reviewPage.renter.description') : t('reviewPage.renter.readonlyDescription')}
        </Text>
        {/*
          Màn này chỉ tới được khi đã có phiên; phiên mất giữa chừng thì lượt gửi trả 401 và luồng
          mời đăng nhập lại — không dựng một khung chờ không bao giờ xong.
        */}
        {/*
          LIÊN HỆ của chuyến (ADR 0063) — mặc định là của tài khoản, khách sửa được; SĐT khác số tài
          khoản không cần OTP. Danh tính vẫn là TÀI KHOẢN ở server. Cùng `BookingRenterCard` web.
        */}
        {renter ? <RenterContactFields control={form.control} renter={renter} /> : null}
        <TextField
          control={form.control}
          name="note"
          label={t('reviewPage.renter.noteLabel')}
          placeholder={t('reviewPage.renter.notePlaceholder')}
          multiline
          rows={3}
          maxLength={NOTE_MAX}
        />
      </FormSection>

      {/* ── Giấy tờ & điều kiện nhận xe ──────────────────────────────────────── */}
      <FormSection title={t('reviewPage.requirements.title')} icon="shield-checkmark-outline">
        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {licence.required
              ? t('reviewPage.requirements.licenceTitle')
              : t('reviewPage.requirements.driverTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {licence.required
              ? t('reviewPage.requirements.licenceBody')
              : t('reviewPage.requirements.driverBody')}
          </Text>
        </YStack>
        {verifiedLicence ? (
          <XStack
            ai="flex-start"
            gap={space.xs}
            p={space.sm}
            br={radius.md}
            bg={colors.successSurface}
            bw={1}
            bc={colors.successBorder}
          >
            <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.success} />
            <Text f={1} col={colors.text} fos={fontSize.bodySm}>
              <Text fow={fontWeight.semibold}>{t('reviewPage.requirements.licenceVerified')}</Text>
              {licenceMeta ? `${LIST_SEPARATOR}${licenceMeta}` : ''}
            </Text>
          </XStack>
        ) : null}
        {hostDocuments.length > 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('reviewPage.requirements.documents', {
              documents: hostDocuments
                .map((doc) => domainLabel('customerDocumentType', doc))
                .join(', '),
            })}
          </Text>
        ) : null}
        {deposit ? (
          // `.depositHead` web: nhãn cọc + số (đậm) cùng hàng, câu giải thích bên dưới.
          <YStack gap={2}>
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {tPrice('deposit')}
              </Text>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                {deposit.mode === COLLATERAL_MODE.CASH && deposit.amount
                  ? fmt.money(deposit.amount)
                  : domainLabel('collateralMode', deposit.mode)}
              </Text>
            </XStack>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {deposit.note}
            </Text>
          </YStack>
        ) : null}
        {activeTerms?.termsText ? (
          <YStack gap={2} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('reviewPage.requirements.hostTerms')}
            </Text>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {activeTerms.termsText}
            </Text>
          </YStack>
        ) : null}
        {/* Figma: hộp nhắc nền cam nhạt, chữ cam — việc xác minh giấy tờ cụ thể theo chính sách. */}
        <YStack p={space.sm} br={radius.md} bg={colors.warningSurface} bw={1} bc={colors.warningBorder}>
          <Text col={colors.warning} fos={fontSize.bodySm}>
            {t('reviewPage.requirements.reminder')}
          </Text>
        </YStack>
      </FormSection>

      {/* Hai thẻ tiền "Chi phí thuê xe" + "Các khoản khác" (gồm cọc) — đầu cột phải bên web. */}
      {costs}

      {/*
        Ô ĐỒNG Ý — BẮT BUỘC cho mọi chuyến (web #205). Khi chủ xe có điều khoản riêng, CÙNG ô đó phủ
        luôn điều khoản ấy (`bookingCheckHost`) và server kiểm lại khi xe bắt buộc
        (`RENTAL_TERMS_ACCEPTANCE_REQUIRED`). Liên kết trong câu mở webview trong app, nên biểu mẫu
        đang điền không mất.
      */}
      {/* Chưa tick mà bấm Gửi: khối viền đỏ + cuộn tới đây (người dùng chốt 28/10/2026). */}
      <YStack
        ref={consentRef}
        gap={space.xs}
        {...(agreementMissing
          ? { p: space.sm, bw: 1, bc: colors.danger, br: radius.control, bg: colors.dangerSurface }
          : {})}
      >
        <Controller
          control={form.control}
          name="acceptedTerms"
          render={({ field }) => (
            <Pressable
              onPress={() => field.onChange(!field.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: Boolean(field.value) }}
              accessibilityLabel={tLegal(
                agreementCoversHostTerms
                  ? 'consent.bookingCheckHostPlain'
                  : 'consent.bookingCheckPlain',
              )}
            >
              <XStack ai="flex-start" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
                <YStack pt={2}>
                  <CheckMark checked={Boolean(field.value)} />
                </YStack>
                <YStack f={1}>
                  <LegalConsentNote
                    place={agreementCoversHostTerms ? 'bookingCheckHost' : 'bookingCheck'}
                  />
                </YStack>
              </XStack>
            </Pressable>
          )}
        />
        {agreementMissing ? (
          <Text col={colors.danger} fos={fontSize.label} accessibilityRole="alert">
            {t('reviewPage.submit.agreementRequired')}
          </Text>
        ) : null}
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('reviewPage.submit.hint')}
        </Text>
      </YStack>

      {/* ── Sau khi gửi yêu cầu — "Đặt ngay" do SERVER xem trước, không suy theo dịch vụ ── */}
      <YStack gap={space.xs} p={space.md} br={radius.lg} bg={colors.infoSurface}>
        <XStack ai="center" gap={space.xs}>
          <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.info} />
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('reviewPage.next.title')}
          </Text>
        </XStack>
        <Text col={colors.text} fos={fontSize.bodySm}>
          {nextStep === 'instantHold'
            ? t('reviewPage.next.instant')
            : nextStep === 'instantConfirmed'
              ? t('reviewPage.next.instantConfirmed')
              : nextStep === 'hold'
                ? t('reviewPage.next.hold', { minutes: HOLD_PAYMENT_WINDOW_MINUTES })
                : t('reviewPage.next.general')}
        </Text>
      </YStack>
    </YStack>
  );
}

/**
 * Dòng dưới ô SĐT: số TRÙNG số tài khoản đã xác minh ⇒ dấu "đã xác thực"; KHÁC ⇒ nhắc chủ xe sẽ thấy
 * cả số tài khoản. Tài khoản chưa có số (vào bằng Google/Facebook) thì chưa có "số thứ hai" nào để
 * nói tới. Cùng `usePhoneNote` của web.
 */
type ContactField = 'customerName' | 'customerPhone';

/**
 * Hai ô liên hệ của màn Xem lại — bản native của `RenterContactFields` web (#222). Luật nằm ở
 * schema, server kiểm lại.
 *
 * Ô nào tài khoản ĐÃ CÓ giá trị thì mở ra ở trạng thái khoá (điền sẵn), bút ở mép phải mới mở cho
 * sửa — đa số khách thuê cho chính mình, khỏi phải để ý hai ô đã đúng. Ô tài khoản còn trống (vào
 * bằng Google chưa có SĐT) thì nhập được ngay. Ô đang lỗi validate không bao giờ bị khoá: khoá một
 * ô lỗi là chặn khách sửa đúng chỗ cần sửa.
 *
 * Không có dòng email: chủ xe liên hệ qua SĐT, email tài khoản không đi theo yêu cầu thuê.
 */
function RenterContactFields({
  control,
  renter,
}: {
  control: Control<BookingRequestFormValues>;
  renter: NonNullable<RequestReviewStepProps['renter']>;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const { errors } = useFormState({ control, name: ['customerName', 'customerPhone'] });
  const [unlocked, setUnlocked] = useState<Record<ContactField, boolean>>(() => ({
    customerName: !renter.name?.trim(),
    customerPhone: !renter.phone?.trim(),
  }));
  /** Ô vừa được KHÁCH mở khoá bằng bút — dựng lại với `autoFocus` để con trỏ vào ngay, như web. */
  const [justUnlocked, setJustUnlocked] = useState<ContactField | null>(null);

  const locked = (field: ContactField) => !unlocked[field] && !errors[field];
  const unlock = (field: ContactField) => {
    setUnlocked((prev) => ({ ...prev, [field]: true }));
    setJustUnlocked(field);
  };
  const editButton = (field: ContactField, label: string) =>
    locked(field) ? (
      <Pressable
        onPress={() => unlock(field)}
        accessibilityRole="button"
        accessibilityLabel={t('reviewPage.renter.edit', { field: label })}
        hitSlop={space.sm}
      >
        <Ionicons name="create-outline" size={iconSize.sm} color={colors.primary} />
      </Pressable>
    ) : undefined;

  return (
    <YStack gap={space.sm}>
      <TextField
        key={`customerName:${justUnlocked === 'customerName'}`}
        control={control}
        name="customerName"
        label={t('reviewPage.renter.name')}
        placeholder={t('reviewPage.renter.namePlaceholder')}
        autoComplete="name"
        maxLength={CUSTOMER_NAME_MAX}
        required
        editable={!locked('customerName')}
        autoFocus={justUnlocked === 'customerName'}
        suffix={editButton('customerName', t('reviewPage.renter.name'))}
      />
      <TextField
        key={`customerPhone:${justUnlocked === 'customerPhone'}`}
        control={control}
        name="customerPhone"
        label={t('reviewPage.renter.phone')}
        placeholder={t('reviewPage.renter.phonePlaceholder')}
        autoComplete="tel"
        keyboardType="phone-pad"
        required
        editable={!locked('customerPhone')}
        autoFocus={justUnlocked === 'customerPhone'}
        suffix={editButton('customerPhone', t('reviewPage.renter.phone'))}
      />
      <PhoneNote control={control} renter={renter} />
    </YStack>
  );
}

function PhoneNote({
  control,
  renter,
}: {
  control: Control<BookingRequestFormValues>;
  renter: { phone: string | null; verified: boolean };
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const phone = useWatch({ control, name: 'customerPhone' });
  if (!phone?.trim()) return null;
  if (isSameVnPhone(phone, renter.phone)) {
    return renter.verified ? (
      <XStack ai="center" gap={2}>
        <Ionicons name="checkmark-circle" size={iconSize.xs} color={colors.success} />
        <Text col={colors.success} fos={fontSize.label}>
          {t('contact.verified')}
        </Text>
      </XStack>
    ) : null;
  }
  return renter.phone ? (
    <Text col={colors.textMuted} fos={fontSize.label}>
      {t('reviewPage.renter.phoneDifferent', { accountPhone: renter.phone })}
    </Text>
  ) : null;
}
