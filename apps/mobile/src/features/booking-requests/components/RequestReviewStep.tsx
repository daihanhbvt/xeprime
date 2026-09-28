import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  appliesExcessMileage,
  longTermReturnAt,
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  type PublicListingDetail,
} from '@xeprime/types';
import {
  dayjs,
  DAY_PARAM_FORMAT,
  nowInAppTz,
  type RentalMode,
  LIST_SEPARATOR,
} from '@xeprime/domain';
import type { BookingRequestFormValues } from '../booking-schema';
import type { RequestForm } from '../RequestBookingScreen';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { FormSection } from '@/components/ui/FormSection';
import { DataRow } from '@/components/ui/DataRow';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useAddressPreview } from '@/features/locations/hooks/use-address-preview';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { DeliveryEstimate } from './RequestTripStep';
import { usePublicQuote } from '../hooks/use-booking-request-flow';
import { toQuoteParams } from '../quote-params';

/**
 * Nguyện vọng nhận xe linh hoạt được diễn giải thành một KHOẢNG gợi ý, không phải ngày cụ thể
 * của đơn — cùng hai mốc với web.
 */
const PICKUP_WINDOW_START_DAYS = 1;
const PICKUP_WINDOW_END_DAYS = 7;

/**
 * Bước "Xác nhận" — tóm tắt những gì sắp gửi, và **báo giá của SERVER**.
 *
 * Không có phép nhân nào ở client: giá có bậc cuối tuần, ngày lễ và ưu đãi cam kết thời hạn, nên
 * mọi bản tính lại ở đây đều lệch với con số gian hàng nhìn thấy khi duyệt. Vẫn là ƯỚC TÍNH cho
 * tới lúc gian hàng duyệt (ADR 0014).
 */
export function RequestReviewStep({
  values,
  form,
  listing,
  rentalMode,
  accountPhoneVerified,
}: {
  values: BookingRequestFormValues;
  /** Cùng form của bước Chuyến đi — `DeliveryEstimate` theo dõi địa chỉ giao qua `control`. */
  form: RequestForm;
  listing: PublicListingDetail;
  /** Cách tính thời gian đang chọn — vào dòng "Hình thức", đúng như web. */
  rentalMode: RentalMode;
  accountPhoneVerified: boolean;
}) {
  const t = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const longTerm = values.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = values.serviceType === SERVICE_TYPE.WITH_DRIVER;

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
  const quote = usePublicQuote(listing.id, toQuoteParams(values));

  /**
   * Ngày trả DỰ KIẾN của gói dài hạn = ngày nhận + N THÁNG LỊCH.
   *
   * `longTermReturnAt` — hàm DUY NHẤT được phép suy ngày trả của gói dài hạn (ADR 0011); tuyệt
   * đối không nhân `số tháng × 30`, phép đó sai đúng vào các tháng 28/30/31 ngày. Vẫn là con số
   * DỰ KIẾN: giờ nhận do gian hàng chốt khi duyệt, và SERVER mới là nơi tính ngày trả thật.
   */
  const expectedReturn =
    longTerm &&
    values.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE &&
    values.requestedPickupDate &&
    values.longTermPackageMonths
      ? longTermReturnAt(dayjs(values.requestedPickupDate).toDate(), values.longTermPackageMonths)
      : null;

  return (
    <YStack gap={space.lg}>
      {/* Cùng thứ tự dòng với `<dl className={styles.reviewList}>` của web, không thiếu dòng nào. */}
      <FormSection title={t('review.vehicle')} icon="document-text-outline">
        <YStack gap={space.sm}>
          <DataRow label={t('review.vehicle')} value={listing.name} />

          <RenterRow
            name={values.customerName}
            phone={values.customerPhone}
            verified={accountPhoneVerified}
          />

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
                label={t('review.package')}
                value={fmt.packageLabel(values.longTermPackageMonths) ?? '—'}
              />
              <DataRow
                label={t('review.pickupPreference')}
                value={
                  domainLabel('pickupPreference', values.pickupPreference) +
                  (values.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE &&
                  values.requestedPickupDate
                    ? ` · ${fmt.dateKey(values.requestedPickupDate)}`
                    : ` · ${t('longTerm.windowValue', {
                        start: nowInAppTz().add(PICKUP_WINDOW_START_DAYS, 'day').format('DD/MM'),
                        end: fmt.dateKey(
                          nowInAppTz().add(PICKUP_WINDOW_END_DAYS, 'day').format(DAY_PARAM_FORMAT),
                        ),
                      })}`)
                }
              />
              {/* Ngày trả dự kiến chỉ nói được khi khách đã chọn một ngày cụ thể (ADR 0011). */}
              {expectedReturn ? (
                <DataRow
                  label={t('review.expectedReturn')}
                  value={t('review.expectedReturnValue', {
                    date: fmt.dateKey(dayjs(expectedReturn).format(DAY_PARAM_FORMAT)),
                  })}
                />
              ) : null}
            </>
          ) : (
            <>
              <DataRow
                label={t('review.pickupAt')}
                value={fmt.rentalPoint(dayjs(values.pickupAt))}
              />
              <DataRow
                label={t('review.returnAt')}
                value={fmt.rentalPoint(dayjs(values.returnAt))}
              />
              <DataRow
                label={t('review.mode')}
                value={
                  (rentalMode === 'hourly' && !withDriver
                    ? t('time.modeHourly')
                    : t('time.modeDaily')) +
                  (withDriver
                    ? ''
                    : ` · ${values.deliveryRequested ? t('pickup.delivery') : t('pickup.self')}`)
                }
              />
            </>
          )}

          {/* Nhắc LẠI địa chỉ nhận xe: đây là lần cuối khách soát trước khi gửi. */}
          {!withDriver && !values.deliveryRequested && listing.pickupPoint ? (
            <DataRow
              block
              label={t('pickup.self')}
              value={
                [listing.pickupPoint.branchName, listing.pickupPoint.address]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR) || '—'
              }
            />
          ) : null}

          {withDriver ? (
            <>
              <DataRow block label={t('review.driverPickupAddress')} value={pickupAddress ?? '—'} />
              {values.routeType !== ROUTE_TYPE.IN_CITY ? (
                <DataRow block label={t('review.destination')} value={values.destination || '—'} />
              ) : null}
            </>
          ) : null}

          {values.deliveryRequested ? (
            <DataRow block label={t('review.deliveryAddress')} value={deliveryAddress ?? '—'} />
          ) : null}

          {/*
            HẠN MỨC QUÃNG ĐƯỜNG — nhắc lại ở lần soát cuối, không chỉ ở trang xe.

            Phí vượt km là khoản DUY NHẤT có thể phát sinh sau chuyến mà không nằm trong bảng giá
            bên dưới; khách phải đọc nó ngay trước khi cam kết, chứ không phải nhớ lại từ một màn
            đã rời đi. Không tự nhân ra tổng km cho cả chuyến: số ngày TÍNH PHÍ là của server, và
            một con số tự tính ở đây sẽ lệch với thứ dùng lúc quyết toán.

            Điều kiện dịch vụ đọc `appliesExcessMileage` — CÙNG hàm `SettlementService` dùng để
            quyết định có đề xuất phí vượt hay không, nên cổng CÔNG BỐ và cổng THU TIỀN không thể
            lệch nhau.
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
        </YStack>
      </FormSection>

      {/*
        QUÃNG ĐƯỜNG + PHÍ GIAO DỰ KIẾN, nhắc lại ở lần soát cuối.

        Con số này KHÔNG nằm trong tổng bên dưới (ADR 0018: ước tính, chủ xe chốt lúc duyệt). Nếu
        nó chỉ xuất hiện ở bước Chuyến đi rồi biến mất, khách bấm gửi mà không còn thấy khoản duy
        nhất có thể phát sinh thêm TRƯỚC chuyến — hoặc tệ hơn, không còn thấy cảnh báo "ngoài bán
        kính, chủ xe sẽ liên hệ chốt phí".
      */}
      {values.deliveryRequested ? (
        <FormSection title={t('pickup.feeLabel')} icon="navigate-outline">
          <DeliveryEstimate form={form} vehicleId={listing.id} />
        </FormSection>
      ) : null}

      {/*
        ĐẶT NGAY — chỉ NÓI khi server đã xem trước và không thấy blocker nào.

        `autoAccept.eligible` là kết luận của server trên chính bộ tham số đang gửi, không phải
        cờ `autoAcceptEnabled` của chiếc xe: một xe bật Đặt ngay vẫn rơi về duyệt tay khi khoảng
        thuê chạm lịch bận, khách chưa đủ điều kiện, hay chính sách chặn. Hứa nhầm ở đây là hứa
        một chuyến đã chắc chắn, rồi để khách ngồi chờ duyệt.
      */}
      {quote.data?.autoAccept?.eligible ? (
        <Callout tone="success" title={t('review.instantBook')}>
          <CalloutBody>{t('review.instantBookHint')}</CalloutBody>
        </Callout>
      ) : null}

      {/*
        Bước cuối trước khi gửi yêu cầu là chỗ duy nhất khách còn dừng lại được — và chính sách
        huỷ/hoàn tiền là văn bản họ sẽ cần đúng lúc chuyến hỏng. Cùng câu, cùng chỗ đặt với web
        (`LegalConsentNote place="booking"`); liên kết mở ra ngoài nên biểu mẫu đang điền không mất.
      */}
      <LegalConsentNote place="booking" />
    </YStack>
  );
}

/**
 * Dòng "Người thuê": giá trị + chip đã-xác-thực.
 *
 * Không dùng `DataRow` được vì cột phải còn có chip trạng thái, mà `DataRow` chỉ nhận chuỗi.
 */
function RenterRow({ name, phone, verified }: { name: string; phone: string; verified: boolean }) {
  const t = useTranslations('BookingRequests.flow');

  return (
    <XStack
      ai="flex-start"
      jc="space-between"
      gap={space.md}
      p={space.sm}
      br={radius.md}
      bg={verified ? colors.successSurface : colors.surfaceMuted}
    >
      <Text col={colors.textMuted} fos={fontSize.bodySm} flexShrink={0}>
        {t('review.renter')}
      </Text>
      <YStack f={1} ai="flex-end" gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} ta="right">
          {`${name} · ${phone}`}
        </Text>
        {verified ? (
          <XStack ai="center" gap={2}>
            <Ionicons name="checkmark-circle" size={iconSize.xs} color={colors.success} />
            <Text col={colors.success} fos={fontSize.label}>
              {t('contact.verified')}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </XStack>
  );
}
