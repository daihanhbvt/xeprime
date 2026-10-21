import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RENTAL_MODE,
  appliesExcessMileage,
  HOLD_PAYMENT_WINDOW_MINUTES,
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  isSameVnPhone,
  type PublicListingDetail,
} from '@xeprime/types';
import {
  dayjs,
  DAY_PARAM_FORMAT,
  nowInAppTz,
  type RentalMode,
  LIST_SEPARATOR,
  longTermReturnFromWallClock,
} from '@xeprime/domain';
import type { DriverLicence } from '@/api/driver-licence/api';
import { CheckMark } from '@/components/ui/CheckMark';
import { FormSection } from '@/components/ui/FormSection';
import { DataRow } from '@/components/ui/DataRow';
import { TextField } from '@/components/ui/TextField';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useAddressPreview } from '@/features/locations/hooks/use-address-preview';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { BookingRequestFormValues } from '../booking-schema';
import { CUSTOMER_NAME_MAX, NOTE_MAX } from '../booking-schema';
import type { RequestForm } from '../RequestBookingScreen';
import { DeliveryEstimate } from './RequestTripStep';

/**
 * Nguyện vọng nhận xe linh hoạt được diễn giải thành một KHOẢNG gợi ý, không phải ngày cụ thể
 * của đơn — cùng hai mốc với web.
 */
const PICKUP_WINDOW_START_DAYS = 1;
const PICKUP_WINDOW_END_DAYS = 7;

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
  /** Lui về bước Chuyến đi — nút "Chỉnh sửa" của thẻ chuyến. */
  onEdit: () => void;
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
  onEdit,
  disabled = false,
  costs,
}: RequestReviewStepProps) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const tLegal = useTranslations('Legal');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const longTerm = values.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = values.serviceType === SERVICE_TYPE.WITH_DRIVER;

  /** Điều khoản chủ xe cho ĐÚNG dịch vụ đang chọn — cùng phép chọn với web và với lượt gửi. */
  const activeTerms =
    listing.rentalTerms?.find((term) => term.serviceType === values.serviceType) ?? null;

  /*
   * Hai chuỗi địa chỉ để soát lại. Ghép bằng CHÍNH hàm server dùng (`formatAddress`), nên thứ
   * khách đọc ở đây là đúng thứ sẽ được lưu (ADR 0035 điều 3).
   */
  const pickupAddress = useAddressPreview(
    values.pickupProvinceCode,
    values.pickupWardCode,
    values.pickupAddressLine,
  );
  const deliveryAddress = useAddressPreview(
    values.deliveryProvinceCode,
    values.deliveryWardCode,
    values.deliveryAddressLine,
  );

  /**
   * Ngày trả DỰ KIẾN của gói dài hạn = ngày nhận + N THÁNG LỊCH — `longTermReturnAt` là hàm DUY
   * NHẤT được phép suy nó (ADR 0011). Vẫn là con số DỰ KIẾN: server mới tính ngày trả thật.
   */
  const expectedReturn =
    longTerm &&
    values.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE &&
    values.requestedPickupDate &&
    values.longTermPackageMonths
      ? // Qua GIỜ TƯỜNG VN trước: máy không đặt giờ Việt Nam thì ngày trả lệch một ngày (#207).
        longTermReturnFromWallClock(dayjs(values.requestedPickupDate), values.longTermPackageMonths)
      : null;

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
  const tripService = longTerm
    ? domainLabel('serviceType', values.serviceType)
    : withDriver
      ? `${domainLabel('serviceType', values.serviceType)}${LIST_SEPARATOR}${domainLabel('routeType', values.routeType)}`
      : rentalMode === RENTAL_MODE.HOURLY
        ? t('time.modeHourly')
        : t('time.modeDaily');
  const tripDuration = longTerm
    ? fmt.packageLabel(values.longTermPackageMonths)
    : values.pickupAt && values.returnAt
      ? fmt.rentalDuration(dayjs(values.pickupAt), dayjs(values.returnAt))
      : null;
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

      {/* ── Thông tin chuyến đi ──────────────────────────────────────────────── */}
      <YStack gap={space.sm}>
        <XStack ai="center" jc="space-between">
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
            {t('reviewPage.trip.title')}
          </Text>
          <Pressable
            onPress={onEdit}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('reviewPage.trip.editLabel')}
            hitSlop={space.sm}
          >
            <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('reviewPage.trip.edit')}
            </Text>
          </Pressable>
        </XStack>
        <YStack
          gap={space.sm}
          p={space.md}
          br={radius.lg}
          bw={1}
          bc={colors.borderSubtle}
          bg={colors.surface}
        >
          <DataRow label={t('review.vehicle')} value={listing.name} />
          <DataRow
            label={t('review.service')}
            value={
              domainLabel('serviceType', values.serviceType) +
              (withDriver && values.routeType
                ? ` · ${domainLabel('routeType', values.routeType)}`
                : '')
            }
          />

          {longTerm ? (
            <>
              <DataRow
                label={t('reviewPage.trip.package')}
                value={fmt.packageLabel(values.longTermPackageMonths) ?? '—'}
              />
              <DataRow
                label={t('reviewPage.trip.pickupWish')}
                value={
                  domainLabel('pickupPreference', values.pickupPreference) +
                  (values.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE &&
                  values.requestedPickupDate
                    ? ` · ${fmt.dateKey(values.requestedPickupDate)}`
                    : ` · ${t('longTerm.windowValue', {
                        start: fmt.dateKey(
                          nowInAppTz()
                            .add(PICKUP_WINDOW_START_DAYS, 'day')
                            .format(DAY_PARAM_FORMAT),
                        ),
                        end: fmt.dateKey(
                          nowInAppTz().add(PICKUP_WINDOW_END_DAYS, 'day').format(DAY_PARAM_FORMAT),
                        ),
                      })}`)
                }
              />
              {/* Ngày trả dự kiến chỉ nói được khi khách đã chọn một ngày cụ thể (ADR 0011). */}
              {expectedReturn ? (
                <DataRow
                  label={t('reviewPage.trip.expectedReturn')}
                  value={t('review.expectedReturnValue', {
                    date: fmt.dateKey(dayjs(expectedReturn).format(DAY_PARAM_FORMAT)),
                  })}
                />
              ) : null}
            </>
          ) : (
            <>
              <DataRow
                label={t('reviewPage.trip.pickupAt')}
                value={fmt.rentalPoint(dayjs(values.pickupAt))}
              />
              <DataRow
                label={t('reviewPage.trip.returnAt')}
                value={fmt.rentalPoint(dayjs(values.returnAt))}
              />
              <DataRow
                label={t('review.mode')}
                value={
                  rentalMode === RENTAL_MODE.HOURLY && !withDriver
                    ? t('time.modeHourly')
                    : t('time.modeDaily')
                }
              />
            </>
          )}

          {withDriver ? (
            <>
              <DataRow
                block
                label={t('reviewPage.trip.driverPickup')}
                value={pickupAddress ?? '—'}
              />
              {values.routeType !== ROUTE_TYPE.IN_CITY ? (
                <DataRow
                  block
                  label={t('reviewPage.trip.destination')}
                  value={values.destination || '—'}
                />
              ) : null}
            </>
          ) : values.deliveryRequested ? (
            <DataRow block label={t('reviewPage.trip.delivery')} value={deliveryAddress ?? '—'} />
          ) : (
            // Tự nhận xe: điểm hẹn của chủ xe; chưa công bố thì chủ xe gửi khi xác nhận chuyến.
            <DataRow
              block
              label={t('reviewPage.trip.selfPickup')}
              value={
                listing.pickupPoint
                  ? [listing.pickupPoint.branchName, listing.pickupPoint.address]
                      .filter(Boolean)
                      .join(LIST_SEPARATOR) || t('reviewPage.trip.selfPickupPending')
                  : t('reviewPage.trip.selfPickupPending')
              }
            />
          )}

          {/*
            HẠN MỨC QUÃNG ĐƯỜNG — nhắc lại ở lần soát cuối. Phí vượt km là khoản DUY NHẤT có thể phát
            sinh sau chuyến mà không nằm trong bảng giá. Điều kiện đọc `appliesExcessMileage` — CÙNG
            hàm `SettlementService` dùng để quyết định có đề xuất phí vượt hay không.
          */}
          {appliesExcessMileage(values.serviceType) && listing.mileagePolicy ? (
            <DataRow
              block
              label={t('review.mileage')}
              value={t('review.mileageValue', {
                km: fmt.km(listing.mileagePolicy.includedKmPerDay),
                fee: fmt.money(listing.mileagePolicy.excessFeePerKm),
              })}
            />
          ) : null}

          <DataRow label={t('reviewPage.trip.owner')} value={listing.shopName} />
          {/* Dòng tóm tắt dịch vụ · thời lượng — cùng `tripSummary` của `BookingTripCard` web. */}
          <Text col={colors.textMuted} fos={fontSize.label}>
            {tripDuration
              ? t('reviewPage.trip.summary', { service: tripService, duration: tripDuration })
              : tripService}
          </Text>
        </YStack>

        {/*
          QUÃNG ĐƯỜNG + PHÍ GIAO DỰ KIẾN nhắc lại ở lần soát cuối: con số này KHÔNG nằm trong tổng
          (ADR 0018, chủ xe chốt lúc duyệt) — biến mất ở đây là khách gửi mà không còn thấy khoản
          duy nhất có thể phát sinh thêm trước chuyến.
        */}
        {values.deliveryRequested ? <DeliveryEstimate form={form} vehicleId={listing.id} /> : null}
      </YStack>

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
        {renter ? (
          <YStack gap={space.sm}>
            <TextField
              control={form.control}
              name="customerName"
              label={t('reviewPage.renter.name')}
              placeholder={t('reviewPage.renter.namePlaceholder')}
              autoComplete="name"
              maxLength={CUSTOMER_NAME_MAX}
            />
            <TextField
              control={form.control}
              name="customerPhone"
              label={t('reviewPage.renter.phone')}
              placeholder={t('reviewPage.renter.phonePlaceholder')}
              autoComplete="tel"
              keyboardType="phone-pad"
            />
            <PhoneNote control={form.control} renter={renter} />
            {renter.email ? (
              <DataRow label={t('reviewPage.renter.email')} value={renter.email} />
            ) : null}
          </YStack>
        ) : null}
        <TextField
          control={form.control}
          name="note"
          label={t('reviewPage.renter.noteLabel')}
          placeholder={t('reviewPage.renter.notePlaceholder')}
          multiline
          rows={2}
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
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('reviewPage.requirements.reminder')}
        </Text>
      </FormSection>

      {/* Hai thẻ tiền "Chi phí thuê xe" + "Các khoản khác" (gồm cọc) — đầu cột phải bên web. */}
      {costs}

      {/*
        Ô ĐỒNG Ý — BẮT BUỘC cho mọi chuyến (web #205). Khi chủ xe có điều khoản riêng, CÙNG ô đó phủ
        luôn điều khoản ấy (`bookingCheckHost`) và server kiểm lại khi xe bắt buộc
        (`RENTAL_TERMS_ACCEPTANCE_REQUIRED`). Liên kết trong câu mở webview trong app, nên biểu mẫu
        đang điền không mất.
      */}
      <YStack gap={space.xs}>
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
