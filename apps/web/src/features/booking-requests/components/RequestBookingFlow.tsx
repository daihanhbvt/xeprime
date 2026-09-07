'use client';

import {
  CalendarOutlined,
  CarOutlined,
  CheckCircleFilled,
  CheckOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ExclamationOutlined,
} from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Radio, Segmented } from 'antd';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  addDateKeyDays,
  API_ERROR_CODE,
  DELIVERY_DISTANCE_STATUS,
  LONG_TERM_PACKAGE_MONTHS,
  longTermReturnAt,
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  isRouteType,
  isSameVnPhone,
  vnDateKey,
  PHONE_VERIFICATION_PURPOSE,
  type LongTermPackageMonths,
  type RouteType,
  type ServiceType,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { LongTermPackageStep } from './LongTermPackageStep';
import {
  RentalDateTimeRangeField,
  type RentalMode,
} from '@/components/form/RentalDateTimeRangeField';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { fetchListingDetailClient } from '@/features/marketplace/api';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { verifyOtp } from '@/features/phone-verification/api';
import { OtpCodeInput } from '@/features/phone-verification/components/OtpCodeInput';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhone } from '@/features/phone-verification/mask';
import { fetchDeliveryDistance, fetchPublicQuote } from '@/features/rental-policies/api';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { EmbedMap } from '@/components/data-display/EmbedMap';
import { cx } from '@/lib/cx';
import {
  appWallClockToInstant,
  appWallClockToIso,
  nowInAppTz,
  toAppTz,
  type Dayjs,
} from '@/lib/datetime';
import { isZeroMoney } from '@/lib/money';
import { mapDirectionsUrl } from '@/lib/map-embed';
import { buildBusyDayIndex } from '@/lib/rental-busy';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import {
  BUSY_DAYS_LOOKAHEAD,
  checkAvailability,
  fetchVehicleBusyDays,
  submitBookingRequest,
} from '../api';
import { PICKUP_METHOD, requestFormSchema, type RequestFormValues } from '../schema';
import { BookingPriceSummary } from './BookingPriceSummary';
import { BookingSteps, type BookingStepItem, type BookingStepKey } from './BookingSteps';
import { VehicleSummaryPanel } from './VehicleSummaryPanel';
import styles from './RequestBookingFlow.module.css';

/**
 * Chưa đủ dài thì KHÔNG hỏi bản đồ.
 *
 * "12 Ng" vừa tra sai chắc chắn vừa tốn một request có tính tiền. Ngưỡng này cùng với debounce
 * 900ms là hai thứ giữ cho một lần gõ địa chỉ tốn ĐÚNG một lượt tra, không phải một lượt cho
 * mỗi ký tự.
 */
const MIN_DELIVERY_ADDRESS_LENGTH = 12;

interface RequestBookingFlowProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  /** Listing đầy đủ khi mở từ trang chi tiết — có sẵn thì KHÔNG gọi lại API. */
  listing?: PublicListingDetail | null;
  /** Ngày giờ đã chọn ở bộ lọc "Tìm xe khả dụng" (ISO) — prefill để khách khỏi nhập lại. */
  pickupAt?: string | null;
  returnAt?: string | null;
  /** Ngữ cảnh dịch vụ/lộ trình từ tab tìm kiếm (URL) — prefill, khách vẫn đổi được. */
  serviceType?: string | null;
  routeType?: string | null;
  onClose: () => void;
  /**
   * Báo cho vỏ biết đang có request "không được bỏ dở" (xác minh OTP / gửi yêu cầu) để nó
   * khoá các đường đóng vô ý. Flow vẫn tự giữ state; đây chỉ là thông báo ra ngoài.
   */
  onBusyChange?: (busy: boolean) => void;
  /**
   * Đã sang màn KẾT QUẢ (gửi xong / trùng lặp). Vỏ dùng tín hiệu này để thu overlay lại cho vừa
   * nội dung — khung hai cột rộng 1180px và cao hết màn là dành cho biểu mẫu, giữ nguyên cho
   * một thẻ xác nhận ngắn thì thừa mênh mông chỗ trống.
   */
  onResultChange?: (isResult: boolean) => void;
}

/**
 * Luồng "Yêu cầu thuê xe" của khách — **hai bước biểu mẫu**, hai cột trên desktop.
 *
 * Cột trái là hồ sơ xe đứng yên (`VehicleSummaryPanel`); cột phải đổi theo bước:
 * `Chuyến đi` → `Xác nhận`.
 *
 * **Vì sao hai bước, không phải ba.** Bản trước tách `Thời gian` và `Liên hệ` thành hai bước
 * riêng, nhưng cả hai đều gần như không có việc để làm: thẻ tìm kiếm ở trang chủ đã hỏi thời
 * gian nên bước đầu chỉ còn một ô điền sẵn và một nút Tiếp tục, còn khách đã đăng nhập với SĐT
 * đã xác thực thì bước Liên hệ chỉ là một thẻ chỉ-đọc. Gộp lại thành MỘT bước "Chuyến đi" —
 * thời gian là một trường, ô liên hệ chỉ hiện với người hệ thống chưa biết — và giữ nguyên bước
 * `Xác nhận` cuối cùng, nơi khách soát lại rồi mới gửi.
 *
 * OTP là một TRẠNG THÁI giữa hai bước chứ không phải bước thứ ba — khách đã đăng nhập với đúng
 * SĐT đã xác thực không đi qua nó bao giờ. **Điều kiện bỏ qua OTP ở đây chỉ để CHỌN MÀN HÌNH.**
 * Cái chặn thật nằm ở `BookingRequestsService.canSkipBookingOtp`; nếu hai bên bất đồng (phiên
 * vừa hết hạn) backend trả `PHONE_NOT_VERIFIED` và flow tự lùi về OTP, giữ nguyên mọi thứ đã
 * nhập.
 *
 * **Giao xe tận nơi**: chỉ hỏi địa chỉ. Lựa chọn này chỉ hiện khi CHÍNH SÁCH hiệu lực cho phép
 * (`listing.deliveryAvailable`), không phải khi hồ sơ xe gắn chip tiện ích.
 *
 * Từ 24/08 (ADR 0018) màn hình hiện thêm **quãng đường và phí dự kiến** tra từ bản đồ. Đó là
 * ƯỚC LƯỢNG và chỉ có thế: nó KHÔNG đi vào payload, KHÔNG cộng vào tổng tiền, và không sinh ra
 * trạng thái chờ khách duyệt phí nào. Yêu cầu vẫn gửi đi với phí giao 0 như Wave 9 đã chốt, chủ
 * xe thống nhất phí với khách rồi cập nhật vào đơn sau khi duyệt. Chưa cấu hình bản đồ, địa chỉ
 * quá ngắn hay tra không ra thì phần ước lượng đơn giản không hiện — luồng đặt xe không đổi một
 * bước nào.
 *
 * Tiền hiển thị đều LẤY TỪ SERVER (`/public/listings/:id/quote`) và chỉ do `BookingPriceSummary`
 * dựng: DÒNG TỔNG dính đáy cột phải (luôn thấy được), còn BẢNG CHI TIẾT mở ra ở cuối thân bước
 * nên nó cuộn chung một mạch với phần nhập liệu thay vì nở ngược lên che mất.
 */
export function RequestBookingFlow({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  listing: providedListing,
  pickupAt,
  returnAt,
  serviceType: serviceTypeContext,
  routeType: routeTypeContext,
  onClose,
  onBusyChange,
  onResultChange,
}: RequestBookingFlowProps) {
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<BookingStepKey>('trip');
  const [rentalMode, setRentalMode] = useState<RentalMode>('daily');
  const [otpPhone, setOtpPhone] = useState('');
  const [code, setCode] = useState('');
  const [stepError, setStepError] = useState<string | null>(null);
  /** Yêu cầu trùng lặp — trạng thái riêng, có lối đi tiếp, không phải một alert đỏ. */
  const [duplicate, setDuplicate] = useState(false);
  /** Người đã đăng nhập bấm "Đổi" ở bước xác nhận → hiện lại ô nhập liên hệ ở bước Chuyến đi. */
  const [editingContact, setEditingContact] = useState(false);
  const [requestCode, setRequestCode] = useState<string | null>(null);
  /**
   * Bảng chi tiết giá đang mở hay không.
   *
   * State nằm ở ĐÂY, không trong `BookingPriceSummary`: khối tiền có hai hình thái ở hai nhánh
   * cây khác nhau — dòng tổng dính đáy cột, bảng chi tiết cuối thân bước — và nút mở nằm ở
   * hình thái này còn nội dung mở ra ở hình thái kia.
   */
  const [priceExpanded, setPriceExpanded] = useState(false);
  const priceDetailRef = useRef<HTMLDivElement | null>(null);

  // 401 = chưa đăng nhập, là trạng thái hợp lệ ở màn công khai này → coi như khách vãng lai.
  const { data: me } = useCurrentUser();
  const accountPhone = me?.phone ?? null;
  const accountPhoneVerified = Boolean(me?.phoneVerified && accountPhone);

  /**
   * Hồ sơ xe cho cột trái. Mở từ trang chi tiết thì `providedListing` đã đủ và query TẮT —
   * không có lý do gọi lại thứ vừa render xong.
   */
  const listingQ = useQuery({
    queryKey: queryKeys.marketplace.listing(vehicleId),
    queryFn: () => fetchListingDetailClient(vehicleId),
    enabled: !providedListing,
    staleTime: 5 * 60_000,
  });
  const listing = providedListing ?? listingQ.data ?? null;

  const { control, trigger, getValues, setValue, formState } = useForm<RequestFormValues>({
    resolver: yupResolver(requestFormSchema),
    defaultValues: {
      customerName: '',
      customerPhone: '',
      // Dịch vụ/lộ trình prefill từ ngữ cảnh tìm kiếm; đối chiếu với năng lực xe ở effect dưới.
      serviceType:
        serviceTypeContext && (SERVICE_TYPE_VALUES as string[]).includes(serviceTypeContext)
          ? (serviceTypeContext as ServiceType)
          : SERVICE_TYPE.SELF_DRIVE,
      routeType: isRouteType(routeTypeContext) ? routeTypeContext : ROUTE_TYPE.IN_CITY,
      pickupAddress: '',
      destination: '',
      // Mốc từ URL là UTC; ô chọn phải hiện GIỜ VIỆT NAM (CLAUDE.md §9).
      pickupAt: pickupAt ? toAppTz(pickupAt) : null,
      returnAt: returnAt ? toAppTz(returnAt) : null,
      // Thuê dài hạn: chọn sẵn gói NHỎ NHẤT và nguyện vọng linh hoạt nhất — khách thấy ngay
      // một mức giá thật để so, thay vì một bảng trống phải bấm mới có số.
      longTermPackageMonths: LONG_TERM_PACKAGE_MONTHS[0],
      pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
      requestedPickupDate: null,
      pickupMethod: PICKUP_METHOD.SELF,
      deliveryAddress: '',
    },
  });

  const watchedPickup = useWatch({ control, name: 'pickupAt' });
  const watchedReturn = useWatch({ control, name: 'returnAt' });
  const pickupMethod = useWatch({ control, name: 'pickupMethod' });
  const watchedService = useWatch({ control, name: 'serviceType' });
  const watchedRoute = useWatch({ control, name: 'routeType' });
  const watchedPackage = useWatch({ control, name: 'longTermPackageMonths' });
  const watchedPreference = useWatch({ control, name: 'pickupPreference' });
  const watchedRequestedDate = useWatch({ control, name: 'requestedPickupDate' });
  const isLongTerm = watchedService === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = watchedService === SERVICE_TYPE.WITH_DRIVER;
  // Có tài xế thì xe ĐẾN ĐÓN khách — "giao xe tận nơi" không có nghĩa với chuyến này.
  const isDelivery = !isWithDriver && pickupMethod === PICKUP_METHOD.DELIVERY;

  /**
   * Giao tận nơi có ĐẶT ĐƯỢC không — theo CHÍNH SÁCH hiệu lực, không phải chip tiện ích trên
   * hồ sơ xe. Hồ sơ xe chưa về thì chưa dựng lựa chọn nào để khỏi nháy một ô rồi rút lại.
   */
  const deliveryAvailable = Boolean(listing?.deliveryAvailable);

  /** Chỗ khách tới lấy xe khi tự nhận — chi nhánh giữ xe, backend đã lo phần fallback. */
  const pickupPoint = listing?.pickupPoint ?? null;

  /** Các dịch vụ xe phục vụ được — nguồn của bộ chọn dịch vụ trong luồng. */
  const vehicleServices = useMemo<string[]>(
    () => listing?.serviceTypes ?? [],
    [listing?.serviceTypes],
  );

  /**
   * Ngữ cảnh từ URL có thể trỏ tới dịch vụ xe KHÔNG phục vụ (link cũ, gõ tay) — khi hồ sơ xe
   * về thì đối chiếu và rơi về dịch vụ đầu tiên của xe, không giữ một lựa chọn vô nghĩa.
   */
  useEffect(() => {
    if (vehicleServices.length === 0) return;
    if (!vehicleServices.includes(getValues('serviceType'))) {
      setValue('serviceType', vehicleServices[0] as ServiceType);
    }
  }, [vehicleServices, getValues, setValue]);

  /**
   * Chính sách tắt giao xe mà form còn giữ lựa chọn cũ (khách đổi dịch vụ, hoặc hồ sơ xe về
   * muộn) → kéo về nhận tại điểm hẹn. Không làm việc này thì payload mang `deliveryRequested`
   * mà giao diện không còn ô nào để sửa, và backend từ chối ở đúng nút cuối cùng.
   */
  useEffect(() => {
    if (!deliveryAvailable && getValues('pickupMethod') === PICKUP_METHOD.DELIVERY) {
      setValue('pickupMethod', PICKUP_METHOD.SELF, { shouldValidate: true });
    }
  }, [deliveryAvailable, getValues, setValue]);

  /**
   * Đổi dịch vụ. Dài hạn và các dịch vụ theo ngày dùng hai bộ input khác hẳn nhau (gói +
   * nguyện vọng ngày nhận ↔ khoảng nhận–trả), nên không mang dữ liệu bên này sang bên kia.
   */
  function selectService(next: ServiceType) {
    setValue('serviceType', next, { shouldValidate: true });
    setStepError(null);
  }

  /**
   * Báo giá công khai — CÙNG PricingService với luồng duyệt của shop, FE không tự cộng trừ.
   * Hỏng cũng không chặn luồng đặt: khối giá là thông tin tham khảo, giá chốt do shop duyệt.
   *
   * Dài hạn báo giá theo GÓI: không gửi ngày nào cả (giá không phụ thuộc ngày nhận, ADR 0011).
   * Dịch vụ theo ngày giữ hợp đồng nhận–trả như cũ.
   */
  const quoteParams = isLongTerm
    ? watchedPackage != null
      ? { serviceType: watchedService, packageMonths: watchedPackage }
      : null
    : watchedPickup && watchedReturn
      ? {
          pickupAt: appWallClockToIso(watchedPickup),
          returnAt: appWallClockToIso(watchedReturn),
          serviceType: watchedService,
          ...(isWithDriver ? { routeType: watchedRoute } : {}),
        }
      : null;
  /**
   * Lịch bận của xe — nạp MỘT lần cho cả năm khi mở luồng, không phải mỗi lần lật tháng.
   *
   * Cửa sổ lùi một ngày so với hôm nay theo giờ VN: máy khách ở múi giờ âm có thể đang ở "hôm
   * qua" so với ngày nghiệp vụ, và ô đầu tiên trên lịch không được phép trống dữ liệu.
   *
   * Thuê dài hạn không có ô chọn khoảng (khách chỉ nêu nguyện vọng ngày nhận — ADR 0011) nên
   * query tắt hẳn ở đó.
   */
  const busyWindow = useMemo(() => {
    const from = addDateKeyDays(vnDateKey(new Date()), -1);
    return { from, to: addDateKeyDays(from, BUSY_DAYS_LOOKAHEAD) };
  }, []);
  const busyDaysQ = useQuery({
    queryKey: queryKeys.bookingRequests.busyDays(vehicleId, busyWindow.from, busyWindow.to),
    queryFn: () => fetchVehicleBusyDays(vehicleId, busyWindow.from, busyWindow.to),
    enabled: !isLongTerm,
    staleTime: 60_000,
  });
  const busyDays = useMemo(() => buildBusyDayIndex(busyDaysQ.data?.days), [busyDaysQ.data]);

  /*
   * Quãng đường giao xe + phí dự kiến.
   *
   * Địa chỉ debounce 900ms và phải đủ dài trước khi hỏi: mỗi lượt trượt cache là một request có
   * tính tiền tới nhà cung cấp bản đồ, và một địa chỉ đang gõ dở ("12 Ng") vừa tốn hạn mức vừa
   * chắc chắn tra sai. Ba lớp cache xếp chồng nhau — TanStack ở đây, `geocode_cache` và
   * `geo_route_cache` ở backend — nên khách sửa qua sửa lại rồi quay về địa chỉ cũ không tốn gì.
   *
   * Query KHÔNG bao giờ ném: mọi ngả không tra được về dưới dạng `status`, nên không có nhánh
   * lỗi nào chặn khách bấm gửi yêu cầu.
   */
  const watchedDeliveryAddress = useWatch({ control, name: 'deliveryAddress' });
  const debouncedDeliveryAddress = useDebouncedValue(watchedDeliveryAddress?.trim() ?? '', 900);
  const deliveryQ = useQuery({
    queryKey: queryKeys.marketplace.deliveryDistance(vehicleId, debouncedDeliveryAddress),
    queryFn: () => fetchDeliveryDistance(vehicleId, debouncedDeliveryAddress),
    enabled:
      isDelivery &&
      deliveryAvailable &&
      debouncedDeliveryAddress.length >= MIN_DELIVERY_ADDRESS_LENGTH,
    // Vị trí một địa chỉ không đổi trong một phiên đặt xe — không có lý do gì hỏi lại.
    staleTime: 10 * 60_000,
    retry: false,
  });
  const delivery = deliveryQ.data ?? null;

  const quoteQ = useQuery({
    queryKey: queryKeys.marketplace.quote(vehicleId, quoteParams ?? {}),
    queryFn: () => fetchPublicQuote(vehicleId, quoteParams!),
    // Bật từ NGAY bước Chuyến đi: chọn xong khoảng thuê là thấy tiền tạm tính, không phải đi
    // hết một bước nữa mới biết mình sắp trả bao nhiêu.
    enabled: quoteParams != null,
    staleTime: 60_000,
  });

  /**
   * Điền sẵn tên + SĐT của tài khoản. Chạy khi `/auth/me` về (có thể sau lần render đầu), và chỉ
   * điền vào ô đang trống — không đè lên thứ khách đã tự gõ.
   */
  useEffect(() => {
    if (!me) return;
    if (!getValues('customerName')) setValue('customerName', me.displayName ?? '');
    if (!getValues('customerPhone') && accountPhone) setValue('customerPhone', accountPhone);
  }, [me, accountPhone, getValues, setValue]);

  const vp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.BOOKING);

  /** SĐT đang dùng có phải chính SĐT đã xác thực của tài khoản không (bỏ qua 0/84/+84). */
  const phoneMatchesAccount = (phone: string) =>
    accountPhoneVerified && isSameVnPhone(phone, accountPhone);

  /**
   * Hệ thống đã biết đủ liên hệ chưa. `false` ⇒ bước Chuyến đi dựng ô nhập tên + SĐT; `true`
   * ⇒ không hỏi lại thứ đã có, chỉ hiện một dòng "Người thuê" ở bước Xác nhận kèm nút Đổi.
   */
  const contactKnown = accountPhoneVerified && !editingContact;

  /**
   * Đổi bước — MỘT cửa duy nhất, vì bước nào cũng kéo theo hình thái của khối tiền.
   *
   * Bước Xác nhận mở sẵn bảng giá đầy đủ (khách sắp cam kết thì phải thấy đủ), các bước khác
   * bắt đầu ở dòng tổng; và trạng thái mở KHÔNG mang từ bước này sang bước kia. Đặt ở đây thay
   * vì một `useEffect` theo dõi `step`: hiệu ứng đó chỉ chạy SAU khi bước mới đã render một
   * lần với giá trị cũ, tức là một nhịp nháy, và nó cũng đè luôn lựa chọn khách vừa bấm.
   */
  function goToStep(next: BookingStepKey) {
    setStep(next);
    setPriceExpanded(next === 'review');
  }

  const availabilityM = useMutation({
    mutationFn: () => {
      const v = getValues();
      return checkAvailability({
        vehicleId,
        pickupAt: v.pickupAt ? appWallClockToIso(v.pickupAt) : '',
        returnAt: v.returnAt ? appWallClockToIso(v.returnAt) : '',
      });
    },
    onSuccess: (res) => {
      if (res.available) {
        setStepError(null);
        void afterTripStep();
      } else {
        // KHÔNG nói xe "đã được đặt" và không hé lộ đơn của người khác — chỉ nói khung giờ bận.
        setStepError(t('time.unavailable'));
      }
    },
    onError: (e) => setStepError(errorMessage(e)),
  });

  const submitM = useMutation({
    mutationFn: (phone: string) => {
      const v = getValues();
      const withDriver = v.serviceType === SERVICE_TYPE.WITH_DRIVER;
      return submitBookingRequest({
        vehicleId,
        customerName: v.customerName.trim(),
        customerPhone: phone,
        serviceType: v.serviceType,
        /*
         * Dài hạn KHÔNG gửi lịch: chỉ gói + nguyện vọng. Khoảng "trong 7 ngày tới" do server
         * tính từ lúc nhận yêu cầu, client không khai (ADR 0011).
         */
        ...(v.serviceType === SERVICE_TYPE.LONG_TERM
          ? {
              longTermPackageMonths: v.longTermPackageMonths ?? undefined,
              pickupPreference: v.pickupPreference,
              ...(v.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && v.requestedPickupDate
                ? { requestedPickupDate: v.requestedPickupDate.format('YYYY-MM-DD') }
                : {}),
            }
          : {
              pickupAt: v.pickupAt ? appWallClockToIso(v.pickupAt) : '',
              returnAt: v.returnAt ? appWallClockToIso(v.returnAt) : '',
            }),
        // Có tài xế: lộ trình + địa chỉ đón (+ điểm đến khi liên tỉnh); backend validate lại.
        ...(withDriver
          ? {
              routeType: v.routeType,
              pickupAddress: v.pickupAddress.trim(),
              ...(v.routeType !== ROUTE_TYPE.IN_CITY && v.destination.trim()
                ? { destination: v.destination.trim() }
                : {}),
            }
          : {}),
        ...(!withDriver && v.pickupMethod === PICKUP_METHOD.DELIVERY
          ? { deliveryRequested: true, deliveryAddress: v.deliveryAddress.trim() }
          : {}),
      });
    },
    onSuccess: async (receipt) => {
      setRequestCode(receipt.id ?? null);
      // Có thể vừa được cấp phiên mới (passwordless) → làm mới toàn bộ cache để cả app biết.
      await queryClient.invalidateQueries();
      goToStep('done');
    },
    onError: (e) => {
      const code = getErrorCode(e);
      if (code === API_ERROR_CODE.BOOKING_REQUEST_DUPLICATE) {
        setDuplicate(true);
        return;
      }
      /*
       * Backend nói SĐT chưa xác thực trong khi FE tưởng được bỏ qua OTP — nghĩa là phiên đã hết
       * hạn hoặc SĐT tài khoản vừa bị đổi. Đây là điểm khôi phục: lùi về bước xác thực, GIỮ
       * NGUYÊN xe/ngày giờ/liên hệ đã nhập, gửi mã cho chính số đó.
       */
      if (code === API_ERROR_CODE.PHONE_NOT_VERIFIED) {
        const phone = getValues('customerPhone').trim();
        setOtpPhone(phone);
        setCode('');
        goToStep('otp');
        setStepError(t('otp.sessionExpired'));
        vp.send(phone);
        return;
      }
      setStepError(errorMessage(e));
    },
  });

  const verifyM = useMutation({
    mutationFn: () =>
      verifyOtp({ phone: otpPhone, purpose: PHONE_VERIFICATION_PURPOSE.BOOKING, code }),
    onSuccess: () => goToStep('review'),
    onError: (e) => setStepError(errorMessage(e)),
  });

  const submitting = submitM.isPending;
  const verifying = verifyM.isPending;

  // Đẩy trạng thái "đang gửi" ra vỏ để nó khoá Esc/bấm nền trong lúc request đang bay.
  useEffect(() => {
    onBusyChange?.(submitting || verifying);
  }, [submitting, verifying, onBusyChange]);

  const isResult = step === 'done' || duplicate;
  useEffect(() => {
    onResultChange?.(isResult);
  }, [isResult, onResultChange]);

  /**
   * Vừa mở bảng chi tiết thì đưa nó vào tầm mắt. Bảng nằm cuối thân bước nên với một bước dài
   * nó rơi dưới đáy vùng cuộn — bấm "Chi tiết" mà màn hình không đổi gì thì khách tưởng nút
   * hỏng. `block: 'start'` đưa đầu bảng lên đầu vùng nhìn: phần còn lại cuộn tiếp như thường,
   * và hàng nút dính đáy không che mất chỗ vừa mở.
   */
  useEffect(() => {
    if (!priceExpanded) return;
    priceDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [priceExpanded]);

  /** Rời bước Chuyến đi: SĐT đã xác thực thì sang thẳng Xác nhận, chưa thì dựng OTP. */
  async function afterTripStep() {
    const phone = getValues('customerPhone').trim();
    if (phoneMatchesAccount(phone)) {
      goToStep('review');
      return;
    }
    try {
      await vp.sendAsync(phone);
      setOtpPhone(phone);
      setCode('');
      goToStep('otp');
    } catch {
      /* lỗi gửi mã hiển thị qua vp.error tại bước Chuyến đi */
    }
  }

  /**
   * Một nút "Tiếp tục" cho cả bước Chuyến đi — gộp việc của hai bước cũ: kiểm dữ liệu chuyến,
   * kiểm khung giờ còn trống, rồi mới quyết định đi qua OTP hay thẳng tới Xác nhận.
   */
  async function continueFromTrip() {
    setStepError(null);

    const fields: Array<keyof RequestFormValues> = isLongTerm
      ? ['longTermPackageMonths', 'pickupPreference', 'requestedPickupDate']
      : ['pickupAt', 'returnAt'];
    // Địa chỉ giao/đón và liên hệ nằm CÙNG bước này — schema tự bỏ qua trường không liên quan.
    fields.push('deliveryAddress', 'pickupAddress', 'destination');
    if (!contactKnown) fields.push('customerName', 'customerPhone');

    if (!(await trigger(fields))) return;

    /*
     * Dài hạn chưa có khung giờ cụ thể để kiểm lịch: khách mới nêu nguyện vọng, gian hàng chốt
     * ngày giờ khi duyệt và constraint DB mới là chỗ chặn trùng lịch (ADR 0006).
     */
    if (isLongTerm) {
      await afterTripStep();
      return;
    }
    availabilityM.mutate();
  }

  function confirmOtp() {
    if (code.length !== 6 || verifying) return;
    setStepError(null);
    verifyM.mutate();
  }

  function onCodeChange(next: string) {
    if (stepError) setStepError(null);
    setCode(next);
  }

  /** Quay lại bước nhập; `editContact` = khách bấm "Đổi" ở dòng Người thuê. */
  function backToTrip(editContact = false) {
    goToStep('trip');
    if (editContact) setEditingContact(true);
    setStepError(null);
    setCode('');
    vp.reset();
    verifyM.reset();
    submitM.reset();
  }

  function resend() {
    setStepError(null);
    setCode('');
    verifyM.reset();
    vp.send(otpPhone);
  }

  function submitRequest() {
    setStepError(null);
    submitM.mutate(getValues('customerPhone').trim());
  }

  const summaryPanel = (
    <VehicleSummaryPanel
      listing={listing}
      fallbackName={vehicleName}
      fallbackImageUrl={vehicleImageUrl}
      loading={listingQ.isLoading}
      // Panel nói giá của ĐÚNG dịch vụ/gói khách đang chọn, không phải giá tự lái mặc định.
      serviceType={watchedService}
      packageMonths={watchedPackage}
    />
  );

  const hasRange = Boolean(watchedPickup && watchedReturn);
  /** Đã chọn đủ để server báo giá được chưa — quyết định hình thái khối tiền dưới đáy. */
  const hasPriceSelection = isLongTerm ? watchedPackage != null : hasRange;

  const priceProps = {
    listing,
    serviceType: watchedService,
    routeType: watchedRoute,
    quote: quoteQ.data ?? null,
    quoteLoading: quoteQ.isLoading,
    hasSelection: hasPriceSelection,
    isDelivery,
    expanded: priceExpanded,
  };

  /**
   * Bảng chi tiết giá — đặt CUỐI thân bước, tức là trong cùng mạch cuộn với mọi khối nhập liệu
   * phía trên. Vỏ luôn được dựng để `ref` đứng yên; rỗng thì CSS tự giấu đi (`:empty`) nên nó
   * không để lại một khoảng trống nào khi bảng đang đóng.
   */
  const priceDetail = (
    <div ref={priceDetailRef} className={styles.priceDetail}>
      <BookingPriceSummary {...priceProps} variant="detail" />
    </div>
  );

  const longTermPackages = listing?.longTermPackages ?? [];

  function selectPackage(months: LongTermPackageMonths) {
    setValue('longTermPackageMonths', months, { shouldValidate: true });
    if (stepError) setStepError(null);
  }

  /** Ngày trả DỰ KIẾN của gói khi khách đã chọn ngày nhận cụ thể — giờ chốt khi gian hàng duyệt. */
  const expectedReturnDate =
    watchedPackage != null && watchedRequestedDate
      ? toAppTz(
          longTermReturnAt(appWallClockToInstant(watchedRequestedDate).toDate(), watchedPackage),
        )
      : null;

  const steps: BookingStepItem[] = [
    { key: 'trip', label: t('steps.trip') },
    { key: 'review', label: t('steps.review') },
  ];

  /**
   * Cặp nút của footer, suy từ bước hiện tại — MỘT nơi quyết định nhãn/trạng thái cho cả luồng.
   * Bước đầu không có gì để "quay lại" nên nút phụ là `Huỷ`.
   */
  const primaryAction =
    step === 'trip'
      ? {
          label: availabilityM.isPending ? t('actions.checking') : t('actions.continue'),
          onClick: () => void continueFromTrip(),
          loading: availabilityM.isPending || vp.sending,
          disabled: false,
        }
      : step === 'otp'
        ? {
            label: t('actions.verify'),
            onClick: confirmOtp,
            loading: verifying,
            disabled: code.length !== 6,
          }
        : {
            label: t('actions.submit'),
            onClick: submitRequest,
            loading: submitting,
            disabled: false,
          };

  const secondaryAction =
    step === 'trip'
      ? { label: t('actions.cancel'), onClick: onClose, disabled: false }
      : step === 'otp'
        ? { label: t('actions.back'), onClick: () => backToTrip(), disabled: verifying }
        : { label: t('actions.back'), onClick: () => backToTrip(), disabled: submitting };

  // --- Trạng thái trùng lặp: chiếm trọn thân hộp thoại, có hai lối đi tiếp ------------------
  if (duplicate) {
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          <span className={cx(styles.doneBadge, styles.warnBadge)} aria-hidden>
            <ExclamationOutlined />
          </span>
          <h3 className={styles.doneTitle}>{t('duplicate.title')}</h3>
          <p className={styles.doneText}>{t('duplicate.body')}</p>
          <div className={styles.doneActions}>
            <Button
              type="primary"
              size="large"
              block
              onClick={() => {
                onClose();
                router.push(ROUTES.TRIPS);
              }}
            >
              {t('duplicate.viewTrips')}
            </Button>
            <Button size="large" block onClick={onClose}>
              {t('duplicate.close')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- Đã gửi xong: kết quả, không phải một bước biểu mẫu -----------------------------------
  if (step === 'done') {
    const v = getValues();
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          {/*
            Vòng tròn XANH tự vẽ thay vì để `CheckCircleFilled` tự tô: màu của glyph đến từ
            `currentColor`, mà style runtime của AntD tiêm SAU stylesheet của CSS Module nên một
            class đơn (0,1,0) không chắc thắng — dấu tích ra màu chữ (gần đen) đúng như đã thấy.
            Ở đây màu là NỀN của thẻ bọc, không phụ thuộc thừa kế nào.
          */}
          <span className={styles.doneBadge} aria-hidden>
            <CheckOutlined />
          </span>
          <h3 className={styles.doneTitle}>{t('done.title')}</h3>
          {requestCode ? (
            <p className={styles.requestCode}>{t('done.requestCode', { code: requestCode })}</p>
          ) : null}
          <p className={styles.doneText}>{t('done.body')}</p>

          <dl className={styles.doneSummary}>
            <div className={styles.doneRow}>
              <dt>{t('review.vehicle')}</dt>
              <dd>{listing?.name ?? vehicleName}</dd>
            </div>
            <div className={styles.doneRow}>
              <dt>{t('done.time')}</dt>
              <dd>
                {v.pickupAt ? fmt.rentalPoint(v.pickupAt) : '—'} →{' '}
                {v.returnAt ? fmt.rentalPoint(v.returnAt) : '—'}
              </dd>
            </div>
            <div className={styles.doneRow}>
              <dt>{t('review.service')}</dt>
              <dd>
                {dl('serviceType', v.serviceType)}
                {v.serviceType === SERVICE_TYPE.WITH_DRIVER
                  ? ` · ${dl('routeType', v.routeType)}`
                  : ''}
              </dd>
            </div>
            <div className={styles.doneRow}>
              <dt>{t('done.pickupMethod')}</dt>
              <dd>
                {v.serviceType === SERVICE_TYPE.WITH_DRIVER
                  ? t('done.driverPickup', { address: v.pickupAddress || '—' })
                  : isDelivery
                    ? t('pickup.delivery')
                    : t('pickup.self')}
              </dd>
            </div>
            {quoteQ.data ? (
              <div className={styles.doneRow}>
                {/* Còn phụ phí chưa tính (estimateNote) thì KHÔNG gọi "Tổng dự kiến" — 17/08. */}
                <dt>
                  {quoteQ.data.breakdown.estimateNote ? t('price.subtotal') : t('price.total')}
                </dt>
                {/* Tiền LUÔN qua bộ format — `1800000` trần là con số thô lọt ra ngoài. */}
                <dd className={styles.doneMoney}>{fmt.money(quoteQ.data.breakdown.totalAmount)}</dd>
              </div>
            ) : null}
          </dl>

          {/* Nói rõ đây MỚI là yêu cầu — xe chưa bị giữ chỗ (pending không chiếm lịch). */}
          <Alert
            type="warning"
            showIcon
            className={styles.doneNote}
            message={t('done.notReserved')}
          />

          <div className={cx(styles.doneActions, styles.doneActionsRow)}>
            <Button
              type="primary"
              size="large"
              block
              onClick={() => {
                onClose();
                router.push(ROUTES.TRIPS);
              }}
            >
              {t('done.myTrips')}
            </Button>
            {/*
              Hỏi thêm chủ xe là việc RẤT hay xảy ra ngay sau khi gửi (giao xe ở đâu, có giao
              được sớm hơn không). Dùng lại nút nhắn shop sẵn có — nó tự lo cả trường hợp khách
              chưa đăng nhập — và đóng overlay trước khi rời sang khu tin nhắn.
            */}
            <ChatWithShopButton
              vehicleId={vehicleId}
              label={t('done.chatShop')}
              size="large"
              block
              onNavigate={onClose}
            />
            <Button size="large" block onClick={onClose}>
              {t('done.close')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.left}>{summaryPanel}</div>

      <div className={styles.right}>
        {/* OTP nằm TRONG bước Chuyến đi nên thanh vẫn sáng ô đó — xem docblock `BookingSteps`. */}
        <BookingSteps steps={steps} current={step === 'otp' ? 'trip' : step} />

        {/* ── Bước 1 — Chuyến đi ───────────────────────────────────────────── */}
        {step === 'trip' ? (
          <section className={styles.stepBody}>
            {/*
              Bộ chọn dịch vụ chỉ dựng khi xe phục vụ NHIỀU dịch vụ. Một dịch vụ thì không có
              gì để chọn: dòng "Dịch vụ · Tự lái" chỉ đọc lại thứ khách vừa bấm ở trang chi
              tiết, và nó nằm ngay dưới hàng chip dịch vụ của cột trái đã nói đúng điều đó.
            */}
            {vehicleServices.length > 1 ? (
              <div className={styles.serviceField}>
                <span className={styles.rangeFieldLabel}>{t('service.label')}</span>
                <Segmented
                  block
                  value={watchedService}
                  onChange={(v) => selectService(v as ServiceType)}
                  /*
                   * Nhãn tab là TÊN DỊCH VỤ, không badge phần trăm: mức giảm của thuê dài hạn
                   * là ưu đãi CAM KẾT THỜI HẠN, khác nhau theo từng gói, nên gắn một con số
                   * chung lên tab chỉ làm khách hiểu sai (ADR 0011).
                   */
                  options={vehicleServices.map((value) => ({
                    value,
                    label: dl('serviceType', value),
                  }))}
                />
              </div>
            ) : null}

            {isWithDriver ? (
              <div className={styles.serviceField}>
                <span className={styles.rangeFieldLabel}>{t('service.routeLabel')}</span>
                <Radio.Group
                  value={watchedRoute}
                  onChange={(e) =>
                    setValue('routeType', e.target.value as RouteType, { shouldValidate: true })
                  }
                  options={ROUTE_TYPE_VALUES.map((value) => ({
                    value,
                    label: dl('routeType', value),
                  }))}
                />
                <p className={styles.rangeHint}>{t(`route.description.${watchedRoute}`)}</p>
              </div>
            ) : null}

            {/*
              Thuê dài hạn là GÓI CỐ ĐỊNH (ADR 0011): đúng sáu gói, không có thời lượng tuỳ ý và
              không có ô chọn ngày trả. Cả bước gói + nguyện vọng nằm trong một component riêng
              để bước này không lẫn với luồng chọn khoảng ngày của dịch vụ khác.
            */}
            {isLongTerm ? (
              <LongTermPackageStep
                packages={longTermPackages}
                packagesLoading={listingQ.isLoading}
                selectedMonths={watchedPackage}
                onSelectPackage={selectPackage}
                packageError={formState.errors.longTermPackageMonths?.message}
                preference={watchedPreference}
                onPreferenceChange={(next) => {
                  setValue('pickupPreference', next, { shouldValidate: true });
                  if (next === PICKUP_PREFERENCE.WITHIN_7_DAYS) {
                    setValue('requestedPickupDate', null, { shouldValidate: true });
                  }
                  if (stepError) setStepError(null);
                }}
                requestedDate={watchedRequestedDate}
                onRequestedDateChange={(value) => {
                  setValue('requestedPickupDate', value, { shouldValidate: true });
                  if (stepError) setStepError(null);
                }}
                dateError={formState.errors.requestedPickupDate?.message}
              />
            ) : null}

            {/*
              Ô chọn thời gian phải TRÔNG như một ô nhập bấm được. Bản trước để trigger trần
              (không viền, không nền) nên nó đọc như một dòng chữ và không ai biết bấm được vào
              đâu. Viền + nền + nhãn hai đầu ở đây là phần "vỏ ô nhập"; ruột vẫn là control lịch
              dùng chung, không dựng lịch thứ hai.
            */}
            {!isLongTerm ? (
              <div className={styles.rangeField}>
                <span className={styles.rangeFieldLabel}>{t('time.label')}</span>
                <div
                  className={cx(
                    styles.rangeBox,
                    (formState.errors.pickupAt || formState.errors.returnAt) &&
                      styles.rangeBoxError,
                  )}
                >
                  <RentalDateTimeRangeField
                    value={{ pickupAt: watchedPickup ?? null, returnAt: watchedReturn ?? null }}
                    onChange={(next: { pickupAt: Dayjs | null; returnAt: Dayjs | null }) => {
                      setValue('pickupAt', next.pickupAt, { shouldValidate: true });
                      setValue('returnAt', next.returnAt, { shouldValidate: true });
                      if (stepError) setStepError(null);
                    }}
                    mode={rentalMode}
                    onModeChange={setRentalMode}
                    /*
                     * Nhãn nằm NGAY CẠNH giá trị, không phải một hàng caption riêng phía trên:
                     * hàng caption cũ căn theo hai mép ô còn giá trị lại nằm sát mũi tên ở giữa,
                     * nên "TRẢ XE" trôi ra tận mép phải trong khi số của nó ở giữa ô.
                     */
                    variant="labelled"
                    prefix={<CalendarOutlined />}
                    /* Lịch bận của chính xe này: khoá ngày đã kín, tô riêng ngày bận vài giờ. */
                    busyDays={busyDays}
                    busyLoading={busyDaysQ.isLoading}
                  />
                </div>
                {/* Thời lượng đã nằm ở viên bên phải ô — dòng này chỉ nói CHẾ ĐỘ tính và cách đổi. */}
                <p className={styles.rangeHint}>
                  {hasRange ? (
                    <>
                      <ClockCircleOutlined aria-hidden />{' '}
                      {rentalMode === 'hourly' ? t('time.modeHourly') : t('time.modeDaily')} ·{' '}
                      {t('time.changeHint')}
                    </>
                  ) : (
                    t('time.empty')
                  )}
                </p>
              </div>
            ) : null}

            {formState.errors.pickupAt || formState.errors.returnAt ? (
              <p className={styles.fieldError} role="alert">
                {formState.errors.pickupAt?.message ?? formState.errors.returnAt?.message}
              </p>
            ) : null}

            {/* ── Có tài xế: xe ĐẾN ĐÓN — hỏi địa chỉ đón (+ điểm đến khi liên tỉnh),
                   không có khái niệm "giao xe tận nơi". ─────────────────────── */}
            {isWithDriver ? (
              <div className={styles.deliveryBlock}>
                <TextField
                  control={control}
                  name="pickupAddress"
                  label={t('driver.pickupAddressLabel')}
                  placeholder={t('driver.pickupAddressPlaceholder')}
                  autoComplete="street-address"
                />
                {watchedRoute !== ROUTE_TYPE.IN_CITY ? (
                  <TextField
                    control={control}
                    name="destination"
                    label={t('driver.destinationLabel')}
                    placeholder={t('driver.destinationPlaceholder')}
                  />
                ) : null}
                <p className={styles.deliveryNote}>
                  {t('driver.note', {
                    route: dl('routeType', watchedRoute),
                    description: t(`route.description.${watchedRoute}`),
                  })}
                </p>
              </div>
            ) : null}

            {/* ── Hình thức nhận xe (tự lái / dài hạn) ─────────────────────── */}
            {isWithDriver ? null : (
              <fieldset className={styles.pickupGroup}>
                <legend className={styles.fieldLabel}>{t('pickup.legend')}</legend>
                {deliveryAvailable ? (
                  <div
                    className={styles.pickupOptions}
                    role="radiogroup"
                    aria-label={t('pickup.groupLabel')}
                  >
                    {(
                      [
                        {
                          key: PICKUP_METHOD.SELF,
                          label: t('pickup.self'),
                          hint: pickupPoint?.address ?? t('pickup.selfHint'),
                          icon: <CarOutlined />,
                        },
                        {
                          key: PICKUP_METHOD.DELIVERY,
                          label: t('pickup.delivery'),
                          hint: t('pickup.deliveryHint'),
                          icon: <EnvironmentOutlined />,
                        },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        role="radio"
                        aria-checked={pickupMethod === option.key}
                        className={cx(
                          styles.pickupOption,
                          pickupMethod === option.key && styles.pickupOptionActive,
                        )}
                        onClick={() =>
                          setValue('pickupMethod', option.key, { shouldValidate: true })
                        }
                      >
                        <span className={styles.pickupIcon} aria-hidden>
                          {option.icon}
                        </span>
                        <span className={styles.pickupText}>
                          <span className={styles.pickupLabel}>{option.label}</span>
                          <span className={styles.pickupHint}>{option.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  /*
                   * Chính sách tắt giao xe ⇒ chỉ còn MỘT cách nhận xe, mà một nhóm radio một
                   * lựa chọn là câu hỏi không có câu trả lời nào khác. Nói thẳng chỗ nhận thay vì
                   * bắt khách bấm vào thứ duy nhất bấm được.
                   */
                  <div className={styles.pickupSingle}>
                    <span className={styles.pickupIcon} aria-hidden>
                      <CarOutlined />
                    </span>
                    <span className={styles.pickupText}>
                      <span className={styles.pickupLabel}>{t('pickup.self')}</span>
                      <span className={styles.pickupHint}>
                        {pickupPoint?.address ?? t('pickup.selfOnly')}
                      </span>
                    </span>
                  </div>
                )}
              </fieldset>
            )}

            {isDelivery ? (
              <div className={styles.deliveryBlock}>
                <TextField
                  control={control}
                  name="deliveryAddress"
                  label={t('pickup.addressLabel')}
                  placeholder={t('pickup.addressPlaceholder')}
                  autoComplete="street-address"
                />
                {/*
                  Quãng đường + phí DỰ KIẾN. Chủ xe vẫn là người chốt (ADR 0014), nên mọi nhãn ở
                  đây nói "dự kiến" và con số này KHÔNG được cộng vào tổng tiền của báo giá.

                  Chưa cấu hình bản đồ, chưa gõ đủ địa chỉ, hay tra không ra — tất cả rơi về đúng
                  dòng chữ cũ ("hai bên trao đổi trực tiếp"). Luồng đặt xe không đổi hành vi khi
                  bản đồ vắng mặt, nó chỉ mất phần ước lượng.
                */}
                {deliveryQ.isFetching ? (
                  <p className={styles.deliveryNote} role="status">
                    {t('pickup.estimating')}
                  </p>
                ) : delivery?.status === DELIVERY_DISTANCE_STATUS.AUTO ? (
                  <>
                    <div className={styles.deliveryFeeRow}>
                      <span>{t('pickup.feeLabel')}</span>
                      <b className={isZeroMoney(delivery.fee ?? '0') ? styles.freeTag : undefined}>
                        {isZeroMoney(delivery.fee ?? '0')
                          ? t('pickup.feeFree')
                          : fmt.money(delivery.fee ?? '0')}
                      </b>
                    </div>
                    <p className={styles.deliveryNote}>
                      {t('pickup.estimatedDistance', {
                        distance: fmt.distanceKm(delivery.distanceKm),
                      })}
                    </p>
                  </>
                ) : delivery?.status === DELIVERY_DISTANCE_STATUS.MANUAL ? (
                  <p className={styles.deliveryNote}>
                    {delivery.distanceKm != null
                      ? t('pickup.manualWithDistance', {
                          distance: fmt.distanceKm(delivery.distanceKm),
                        })
                      : t('pickup.feeNote')}
                  </p>
                ) : delivery?.status === DELIVERY_DISTANCE_STATUS.ADDRESS_NOT_FOUND ? (
                  <p className={styles.deliveryNote}>{t('pickup.addressNotFound')}</p>
                ) : (
                  <p className={styles.deliveryNote}>{t('pickup.feeNote')}</p>
                )}
                {delivery?.formattedAddress ? (
                  <p className={styles.deliveryNote}>
                    {t('pickup.resolvedAddress', { address: delivery.formattedAddress })}
                  </p>
                ) : null}
                <EmbedMap
                  src={mapDirectionsUrl(delivery?.origin, delivery?.destination)}
                  title={t('pickup.mapTitle')}
                  height={200}
                />
              </div>
            ) : null}

            {/*
              Liên hệ chỉ hỏi khi hệ thống CHƯA biết: khách vãng lai, hoặc người đã đăng nhập vừa
              bấm "Đổi". Người đã đăng nhập với SĐT đã xác thực không thấy ô nào ở đây — thông tin
              của họ hiện thành một dòng ở bước Xác nhận.
            */}
            {contactKnown ? null : (
              <div className={styles.contactBlock}>
                <span className={styles.fieldLabel}>{t('contact.heading')}</span>
                {/*
                  Hai ô, một hàng. Gian hàng gọi lại khách qua SĐT (đã xác thực OTP ngay trong
                  luồng này) nên đó là tất cả những gì cần hỏi — ô email từng đứng đây là một
                  hàng nữa để khách bỏ qua, và không nơi nào trong luồng duyệt dùng tới nó.
                */}
                <div className={styles.contactFields}>
                  <TextField
                    control={control}
                    name="customerName"
                    label={t('contact.nameLabel')}
                    placeholder={t('contact.namePlaceholder')}
                    autoComplete="name"
                  />
                  <TextField
                    control={control}
                    name="customerPhone"
                    label={t('contact.phoneLabel')}
                    placeholder={t('contact.phonePlaceholder')}
                    autoComplete="tel"
                  />
                </div>
              </div>
            )}

            {vp.error ? (
              <Alert type="error" showIcon message={vp.error} className={styles.err} />
            ) : null}
            {stepError ? (
              <Alert
                type="warning"
                showIcon
                message={stepError}
                className={styles.err}
                role="alert"
              />
            ) : null}

            {priceDetail}

            {/*
              Bước cuối cùng trước khi gửi yêu cầu là chỗ duy nhất khách còn dừng lại được —
              và chính sách huỷ/hoàn tiền là văn bản họ sẽ cần đúng lúc chuyến hỏng. Liên kết
              mở tab mới để không xoá mất biểu mẫu đang điền.
            */}
            <LegalConsentNote place="booking" className={styles.consent} />
          </section>
        ) : null}

        {/* ── Trạng thái OTP — giữa hai bước, không chiếm ô trên thanh ─────── */}
        {step === 'otp' ? (
          <section className={styles.stepBody}>
            <h3 className={styles.otpTitle}>{t('otp.title')}</h3>
            <p className={styles.stepHint}>{t('otp.hint', { phone: maskPhone(otpPhone) })}</p>
            <OtpCodeInput
              value={code}
              onChange={onCodeChange}
              onComplete={confirmOtp}
              autoFocus
              disabled={verifying}
            />
            {vp.devCode ? (
              <div className={styles.devHint}>{t('otp.devCode', { code: vp.devCode })}</div>
            ) : null}
            {stepError ? (
              <Alert
                type="error"
                showIcon
                message={stepError}
                className={styles.err}
                role="alert"
              />
            ) : null}
            <div className={styles.otpLinks}>
              <button type="button" className={styles.linkBtn} onClick={() => backToTrip(true)}>
                {t('otp.editPhone')}
              </button>
              <button
                type="button"
                className={styles.linkBtn}
                disabled={vp.cooldown > 0 || vp.sending}
                onClick={resend}
              >
                {vp.cooldown > 0 ? t('otp.resendIn', { seconds: vp.cooldown }) : t('otp.resend')}
              </button>
            </div>
          </section>
        ) : null}

        {/* ── Bước 2 — Xác nhận ────────────────────────────────────────────── */}
        {step === 'review' ? (
          <section className={styles.stepBody}>
            <dl className={styles.reviewList}>
              <div className={styles.reviewRow}>
                <dt>{t('review.vehicle')}</dt>
                <dd>{listing?.name ?? vehicleName}</dd>
              </div>
              {/*
                Người thuê là một DÒNG ở đây, không còn là cả một bước: với người đã đăng nhập thì
                đây là thứ duy nhất cần soát, và nút Đổi đưa họ về đúng chỗ sửa được.
              */}
              <div className={styles.reviewRow}>
                <dt>{t('review.renter')}</dt>
                <dd className={styles.renterValue}>
                  <span>{`${getValues('customerName')} · ${getValues('customerPhone')}`}</span>
                  {accountPhoneVerified ? (
                    <span className={styles.verifiedTag}>
                      <CheckCircleFilled /> {t('contact.verified')}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => backToTrip(true)}
                    disabled={submitting}
                  >
                    <EditOutlined /> {t('contact.change')}
                  </button>
                </dd>
              </div>
              <div className={styles.reviewRow}>
                <dt>{t('review.service')}</dt>
                <dd>
                  {dl('serviceType', watchedService)}
                  {isWithDriver ? ` · ${dl('routeType', watchedRoute)}` : ''}
                </dd>
              </div>
              {/*
                Dài hạn KHÔNG hiện "nhận xe / trả xe" như một lịch đã chốt — chưa có lịch nào cả.
                Hiện gói đã mua và nguyện vọng ngày nhận; ngày trả dự kiến chỉ nói được khi khách
                đã chọn một ngày cụ thể, và vẫn ghi rõ giờ do gian hàng chốt (ADR 0011).
              */}
              {isLongTerm ? (
                <>
                  <div className={styles.reviewRow}>
                    <dt>{t('review.package')}</dt>
                    <dd>
                      {watchedPackage != null
                        ? t('packageMonths', { months: watchedPackage })
                        : '—'}
                    </dd>
                  </div>
                  <div className={styles.reviewRow}>
                    <dt>{t('review.pickupPreference')}</dt>
                    <dd>
                      {dl('pickupPreference', watchedPreference)}
                      {watchedPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && watchedRequestedDate
                        ? ` · ${watchedRequestedDate.format('DD/MM/YYYY')}`
                        : ` · ${t('longTerm.windowValue', {
                            start: nowInAppTz().add(1, 'day').format('DD/MM'),
                            end: nowInAppTz().add(7, 'day').format('DD/MM/YYYY'),
                          })}`}
                    </dd>
                  </div>
                  {expectedReturnDate ? (
                    <div className={styles.reviewRow}>
                      <dt>{t('review.expectedReturn')}</dt>
                      <dd>
                        {t('review.expectedReturnValue', {
                          date: expectedReturnDate.format('DD/MM/YYYY'),
                        })}
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className={styles.reviewRow}>
                    <dt>{t('review.pickupAt')}</dt>
                    <dd>{watchedPickup ? fmt.rentalPoint(watchedPickup) : '—'}</dd>
                  </div>
                  <div className={styles.reviewRow}>
                    <dt>{t('review.returnAt')}</dt>
                    <dd>{watchedReturn ? fmt.rentalPoint(watchedReturn) : '—'}</dd>
                  </div>
                  <div className={styles.reviewRow}>
                    <dt>{t('review.mode')}</dt>
                    <dd>
                      {rentalMode === 'hourly' && !isWithDriver
                        ? t('time.modeHourly')
                        : t('time.modeDaily')}
                      {isWithDriver
                        ? ''
                        : ` · ${isDelivery ? t('pickup.delivery') : t('pickup.self')}`}
                    </dd>
                  </div>
                </>
              )}
              {/*
                Địa chỉ nhận xe được nhắc LẠI ở đây một cách có chủ đích: đây là lần cuối khách
                soát trước khi gửi, và "tới đâu để lấy xe" là thứ họ phải chắc chắn nhất.
              */}
              {!isWithDriver && !isDelivery && pickupPoint ? (
                <div className={styles.reviewRow}>
                  <dt>{t('pickup.self')}</dt>
                  <dd>
                    {[pickupPoint.branchName, pickupPoint.address].filter(Boolean).join(LIST_SEPARATOR)}
                  </dd>
                </div>
              ) : null}
              {isWithDriver ? (
                <>
                  <div className={styles.reviewRow}>
                    <dt>{t('review.driverPickupAddress')}</dt>
                    <dd>{getValues('pickupAddress') || '—'}</dd>
                  </div>
                  {watchedRoute !== ROUTE_TYPE.IN_CITY ? (
                    <div className={styles.reviewRow}>
                      <dt>{t('review.destination')}</dt>
                      <dd>{getValues('destination') || '—'}</dd>
                    </div>
                  ) : null}
                </>
              ) : null}
              {isDelivery ? (
                <div className={styles.reviewRow}>
                  <dt>{t('review.deliveryAddress')}</dt>
                  <dd>{getValues('deliveryAddress') || '—'}</dd>
                </div>
              ) : null}
            </dl>

            {stepError ? (
              <Alert
                type="error"
                showIcon
                message={stepError}
                className={styles.err}
                role="alert"
              />
            ) : null}

            {priceDetail}
          </section>
        ) : null}

        {/*
          Tiền + nút: MỘT khối dính đáy cột phải.

          Trước đây mỗi bước tự dựng `PriceBreakdown` riêng, nên cùng một bảng tiền hiện lại ở cả
          ba bước và trôi mất khi cuộn. Giờ đáy cột chỉ giữ DÒNG TỔNG cạnh hàng nút — luôn trong
          tầm mắt, không bao giờ cao quá một dòng — còn bảng chi tiết mở ra ở cuối thân bước,
          trong đúng mạch cuộn của nội dung.
        */}
        <div className={styles.dock}>
          {step === 'otp' ? null : (
            <BookingPriceSummary
              {...priceProps}
              variant="bar"
              onExpandedChange={setPriceExpanded}
            />
          )}
          <footer className={styles.footer}>
            <Button onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
              {secondaryAction.label}
            </Button>
            {/*
              `key={step}` — mỗi bước là một nút RIÊNG, không tái dùng chung một phần tử DOM.
              Dùng lại phần tử cũ khiến spinner của bước trước ở lại trong cây (AntD gỡ nó bằng
              hoạt ảnh rời) và nút mang tên khả truy cập "loading …" của việc đã xong. Trong một
              bước thì key không đổi, nên bật/tắt loading vẫn mượt như thường.
            */}
            <Button
              key={step}
              type="primary"
              loading={primaryAction.loading}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          </footer>
        </div>
      </div>
    </div>
  );
}
