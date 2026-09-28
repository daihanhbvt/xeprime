import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';
import { ActivityIndicator, Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { provinceCenter, type GeoPoint } from '@xeprime/domain';
import { LOCATION_SOURCE } from '@xeprime/types';
import { MapPinSheet } from '@/components/map/MapPinSheet';
import { MapPreview } from '@/components/map/MapPreview';
import { mapCenterNow } from '@/lib/map-center';
import { Callout } from '@/components/ui/Callout';
import { FieldLabel } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import {
  PLACE_SEARCH_MIN_LENGTH,
  usePlaceDetail,
  usePlaceSearch,
  useReverseGeocode,
} from '@/features/locations/hooks/use-places';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useWardOptions } from '@/features/locations/hooks/use-wards';
import { isInteractiveMapConfigured } from '@/lib/map-interactive';
import { mapAppUrl, mapAreaUrl, mapPreviewUrl, toGeoPoint } from '@/lib/map-static';
import { readRememberedProvince, rememberProvince } from '@/lib/province-memory';
import { colors, fieldFontSize, fontSize, iconSize, radius, space } from '@/theme/tokens';

/** Tên ba trường HÀNH CHÍNH + chi tiết — bản native của `AddressFieldNames` bên web. */
export interface AddressFieldNames<T extends FieldValues> {
  provinceCode: Path<T>;
  wardCode: Path<T>;
  addressLine: Path<T>;
}

/** Tên bốn trường GHIM. Bỏ trống = địa chỉ này không lưu toạ độ (sổ khách). */
export interface AddressPinNames<T extends FieldValues> {
  placeId: Path<T>;
  latitude: Path<T>;
  longitude: Path<T>;
  locationSource: Path<T>;
}

/**
 * Ô nhập ĐỊA CHỈ VẬT LÝ trên native — cùng ba bước với `AddressField` của web, cùng dữ liệu,
 * cùng luật; chỉ khác cách bày.
 *
 * 1. **Tỉnh/thành** và 2. **xã/phường/đặc khu** chọn từ DANH MỤC NHÀ NƯỚC (mô hình hai cấp, hiệu
 *    lực 01/07/2025 — không có quận/huyện). Ô chọn cấp xã có ô TÌM vì một tỉnh có tới 168 đơn vị,
 *    và phép tìm chạy ở server trên khoá đã bỏ dấu.
 * 3. **Số nhà, đường** thì GÕ, kèm danh sách gợi ý địa điểm. Không danh mục nhà nước nào phát
 *    hành số nhà và tên đường.
 *
 * **Phần BẢN ĐỒ bày khác web, nhưng làm được đúng những việc như nhau.** Trong form là một ẢNH
 * bản đồ tĩnh — hiện ngay, không tốn một WebView cho mỗi ô địa chỉ, và phần lớn lần mở form
 * người dùng chỉ liếc xem ghim đúng chưa. Chạm vào ảnh thì mở tấm CHỈNH GHIM (`MapPinSheet`):
 * bản đồ tương tác toàn màn, phóng to/kéo/bấm để dời ghim, và ghim mới kéo theo một lượt tra
 * ngược đổ địa chỉ vào ô — cùng ba thao tác và cùng luật với `MapPinPicker` bên web. Vì sao
 * WebView chứ không phải một module bản đồ native: `lib/map-interactive.ts`.
 */
export function AddressFields<T extends FieldValues>({
  control,
  names,
  pin,
  title,
  required,
  provinceRequired = required,
  wardRequired = required,
  disabled,
  prefillRememberedProvince = false,
}: {
  control: Control<T>;
  names: AddressFieldNames<T>;
  pin?: AddressPinNames<T>;
  title?: string;
  required?: boolean;
  /**
   * Tỉnh/thành có bắt buộc riêng không. Bỏ trống = theo `required`.
   *
   * Có prop riêng vì `registerShopSchema` đòi tỉnh ở CẢ HAI tuyến đăng ký nhưng chỉ đòi xã + số
   * nhà ở tuyến gói (ADR 0040): dùng một cờ chung thì ô tỉnh của tuyến hoa hồng mất dấu sao mà
   * vẫn báo `provinceRequired` khi bấm Lưu — dấu sao nói dối đúng ở chỗ nó phải nói thật.
   */
  provinceRequired?: boolean;
  /** Xã/phường có bắt buộc riêng không. Bỏ trống = theo `required`. */
  wardRequired?: boolean;
  disabled?: boolean;
  /**
   * Điền sẵn tỉnh/thành mà người dùng đã CHỌN gần nhất ở nơi khác (thanh tìm xe, một form địa chỉ
   * trước đó) khi ô đang trống — xem `lib/province-memory`.
   *
   * Mặc định TẮT, và mặc định đó là có chủ ý. Chỉ form TẠO MỚI mới bật: ở đó ô trống nghĩa là
   * "chưa ai khai", nên điền sẵn là tiết kiệm một thao tác. Ở form SỬA, ô trống nghĩa là bản ghi
   * này KHÔNG có tỉnh — thường là dữ liệu có từ trước danh mục hành chính (ADR 0035 điều 7) — và
   * điền vào đó tỉnh mà người dùng vừa tìm xe sẽ dời địa chỉ một chi nhánh có thật sang tỉnh
   * khác, âm thầm, chỉ vì họ bấm Lưu.
   */
  prefillRememberedProvince?: boolean;
}) {
  const t = useTranslations('Address');
  const province = useController({ control, name: names.provinceCode });
  const ward = useController({ control, name: names.wardCode });

  const provinceCode = (province.field.value as string | null) ?? '';

  const provinces = useProvinceOptions();
  const [wardSearch, setWardSearch] = useState('');
  /*
   * Ô CÓ GHIM không hỏi danh mục cấp xã (ADR 0042 điều 3): bộ chọn đó không được dựng, và tải
   * hàng trăm dòng cho một ô không tồn tại là một request cho mỗi lần mở form, mỗi người dùng.
   * Truyền mã tỉnh rỗng là cách TẮT có sẵn của hook — nó vốn đã dừng khi chưa chọn tỉnh.
   */
  const wards = useWardOptions(pin ? '' : provinceCode, wardSearch);

  /**
   * Dựng lại phần GHIM khi tỉnh đổi, và cảnh báo lệch tỉnh của ngữ cảnh CŨ — bản native của
   * `pinResetKey`/`provinceMismatch` bên web.
   *
   * `pinResetKey` nhích lên để REMOUNT `ConfirmedPlaceField` (`key={pinResetKey}`): state cục bộ
   * của nó (chữ đã xác nhận, cờ tra hỏng) sạch theo, và `clearOnMount` tự dọn bốn trường ghim +
   * chữ địa chỉ trong form. Khởi đầu là `0` nên lần mở đầu tiên KHÔNG dọn gì — đúng thứ form ở
   * chế độ sửa cần.
   */
  const [pinResetKey, setPinResetKey] = useState(0);
  /** Tỉnh bản đồ đoán khác tỉnh người dùng đã chọn — hiện lời nhắc, KHÔNG tự sửa. */
  const [provinceMismatch, setProvinceMismatch] = useState(false);

  /**
   * Đổi tỉnh (thao tác CHỦ ĐỘNG của người dùng) ⇒ ba việc:
   *  1. mã xã cũ chắc chắn sai — xoá ngay, tránh backend từ chối bằng một lỗi không giải thích
   *     được (FK tổ hợp `(ward_code, province_code)`);
   *  2. dựng lại phần GHIM — địa chỉ và cảnh báo lệch tỉnh của ngữ cảnh CŨ không còn ý nghĩa gì
   *     với tỉnh MỚI, và mang chúng theo là mang một địa chỉ chắc chắn sai;
   *  3. ghi bộ nhớ tỉnh — đây là chỗ DUY NHẤT được ghi, vì đây là lựa chọn chủ động thật sự.
   *
   * Là TRÌNH XỬ LÝ SỰ KIỆN (`SelectField.onValueChange`), không phải effect theo dõi
   * `provinceCode`: effect không phân biệt được "người dùng vừa đổi tỉnh" với "form mở ở chế độ
   * sửa và đã có sẵn tỉnh + xã", còn `prefillRememberedProvince` bên dưới ghi thẳng vào form qua
   * `province.field.onChange` nên không đi qua đây — nó không phải một cú đổi của người dùng.
   */
  const onProvinceChange = (next: string) => {
    ward.field.onChange('' as PathValue<T, Path<T>>);
    setWardSearch('');
    setPinResetKey((n) => n + 1);
    setProvinceMismatch(false);
    rememberProvince(next);
  };

  /*
   * Điền sẵn tỉnh đã nhớ — MỘT LẦN, sau khi mount, và chỉ khi ô đang trống.
   *
   * Đợi DANH MỤC về rồi mới quyết, và chỉ điền mã có TRONG danh mục đó. Bộ nhớ tỉnh dùng chung
   * cho cả thanh tìm xe lẫn các form địa chỉ, nhưng hai bên đọc hai danh mục khác nhau: thanh tìm
   * xe lấy tỉnh ĐANG CÓ XE (`/public/destinations`), còn ô này lấy tỉnh đang MỞ ĐĂNG KÝ
   * (`/provinces`). Không danh mục nào chứa trọn danh mục kia. Điền một mã không có trong
   * `options` thì ô chọn mang một giá trị nó không tra ra nhãn: người dùng nhìn thấy ô trống
   * trong khi form đang giữ mã đó, rồi bấm Lưu và không hiểu vì sao hỏng.
   *
   * Điều kiện "đang trống" đọc trong THÂN effect chứ không ở mảng phụ thuộc, để lần điền này
   * không bao giờ đè lên thứ người dùng vừa chọn. Ghi thẳng qua `province.field.onChange` — KHÔNG
   * đi qua `onProvinceChange` — vì đây là điền sẵn, không phải một cú đổi của người dùng: bộ chọn
   * chỉ đang trống, không có xã/ghim nào để dọn.
   */
  const prefilledProvinceRef = useRef(false);
  useEffect(() => {
    if (!prefillRememberedProvince || prefilledProvinceRef.current || provinces.isLoading) return;
    prefilledProvinceRef.current = true;
    if (province.field.value) return;

    let alive = true;
    void readRememberedProvince().then((remembered) => {
      if (!alive || !remembered || province.field.value) return;
      if (!provinces.options.some((o) => o.value === remembered)) return;
      province.field.onChange(remembered as PathValue<T, Path<T>>);
    });
    return () => {
      alive = false;
    };
    // `province.field` đổi định danh mỗi lần render; `prefilledProvinceRef` giữ cho effect này
    // điền ĐÚNG MỘT lần.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillRememberedProvince, provinces.isLoading, provinces.options]);

  /*
   * Ở đây từng có một `locationContext` ghép tên xã + tên tỉnh vào sau chữ người dùng gõ trước
   * khi hỏi bản đồ. Nó bị bỏ vì phản tác dụng — xem `placeQuery` ở `ConfirmedPlaceField`. Việc
   * khoanh vùng do ĐIỂM NEO lo, và nó khoanh bằng TOẠ ĐỘ chứ không bằng chữ (ADR 0042 điều 5).
   */

  return (
    <YStack gap={space.md}>
      {title ? <FieldLabel label={title} required={required} /> : null}

      {provinces.isError ? <Callout tone="warning" title={t('provinceLoadError')} /> : null}

      <SelectField
        control={control}
        name={names.provinceCode}
        label={t('provinceLabel')}
        options={provinces.options}
        required={provinceRequired ?? false}
        disabled={(disabled ?? false) || provinces.isError}
        placeholder={t('provincePlaceholder')}
        onValueChange={onProvinceChange}
      />

      {/*
        Ranh giới là CÓ GHIM hay không, không phải "khách hay chủ xe" (ADR 0042 điều 3).

        Mã xã tồn tại để định vị DƯỚI cấp tỉnh. Khi đã có một toạ độ người dùng nhìn và xác nhận,
        nó định vị chính xác hơn hẳn một mã năm chữ số — trong khi danh mục cấp xã có 3.321 đơn vị
        vừa đổi tên hàng loạt từ 01/07/2025, đủ để cả người khai địa chỉ của CHÍNH MÌNH cũng phải
        dừng lại tra cứu. Không có ghim (sổ khách) thì mã xã lại là cấp định vị duy nhất còn lại,
        nên ở đó nó ở lại.

        `wardCode` KHÔNG bị gỡ khỏi hợp đồng: cột vẫn còn, DTO vẫn nhận, dữ liệu cũ vẫn đọc được.
        Chỉ là không màn hình nào còn sinh ra nó.
      */}
      {pin ? null : (
        <SelectField
          control={control}
          name={names.wardCode}
          label={t('wardLabel')}
          options={wards.options}
          required={wardRequired ?? false}
          disabled={(disabled ?? false) || !provinceCode}
          placeholder={provinceCode ? t('wardPlaceholder') : t('wardNeedsProvince')}
          onSearch={setWardSearch}
          searchPlaceholder={t('wardPlaceholder')}
          emptyText={wards.isError ? t('wardLoadError') : t('wardEmpty')}
          {...(wards.isError ? { hint: t('wardLoadError') } : {})}
        />
      )}

      {pin ? (
        <>
          {/*
            Phần hành chính và phần toạ độ là HAI ĐƯỜNG ĐỘC LẬP: chọn một gợi ý KHÔNG tự đổi tỉnh
            đã chọn, nó chỉ hiện lời nhắc này. Lý do nằm ở dữ liệu: nhà cung cấp bản đồ còn dùng
            tên đơn vị hành chính TRƯỚC sắp xếp 01/07/2025, nên "tin bản đồ" nghĩa là ghi mã sai
            một cách có hệ thống (ADR 0035 điều 4). Người dùng là người chốt.
          */}
          {provinceMismatch ? (
            <Callout tone="warning" title={t('provinceMismatchTitle')}>
              {t('provinceMismatchHint')}
            </Callout>
          ) : null}
          <ConfirmedPlaceField
            key={pinResetKey}
            clearOnMount={pinResetKey > 0}
            control={control}
            addressLineName={names.addressLine}
            pin={pin}
            // Chưa có ghim thì kéo gợi ý về tâm tỉnh đang chọn. Tâm tỉnh là một điểm neo thô,
            // nhưng thô vẫn hơn hẳn không có: không neo thì "Nguyễn Huệ" ra TP.HCM ở mọi tỉnh.
            anchor={provinceCenter(provinceCode)}
            // Chưa chọn tỉnh thì chưa hỏi bản đồ: gợi ý lúc đó rải khắp cả nước và chẳng giúp
            // được ai, trong khi mỗi lượt hỏi là một request có tính tiền.
            searchEnabled={Boolean(provinceCode)}
            required={required ?? false}
            disabled={disabled ?? false}
            onPlaceResolved={(place) =>
              setProvinceMismatch(
                Boolean(place.suggestedProvinceCode) &&
                  place.suggestedProvinceCode !== provinceCode,
              )
            }
          />
        </>
      ) : (
        <TextField
          control={control}
          name={names.addressLine}
          label={t('addressLineLabel')}
          placeholder={t('addressLinePlaceholder')}
          required={required ?? false}
          editable={!disabled}
        />
      )}
    </YStack>
  );
}

/**
 * Ô ĐỊA CHỈ CÓ GHIM — bản native của `ConfirmedPlaceField` (ADR 0042).
 *
 * Chữ trong ô luôn là chữ ĐÃ ĐƯỢC XÁC NHẬN: nó đến từ một dòng gợi ý người dùng bấm (ô nhận CẢ
 * HAI phần của dòng đó), hoặc là chính chữ đang có lúc mở form/lúc một luồng khác điền hộ. Chữ
 * đó ĐI KÈM cái ghim là thứ quyết định phí giao xe (ADR 0018) — một địa chỉ không ghim là một
 * đơn không tính được phí, và điều đó chỉ lộ ra ở bước báo giá, sau khi khách đã điền xong mọi
 * thứ. Bởi vậy chữ và ghim phải luôn khớp nhau: gõ dở rồi rời ô mà không xác nhận lại thì ô TRẢ
 * VỀ chữ đã xác nhận gần nhất, chứ không giữ một dòng chữ mới ứng với một ghim cũ.
 *
 * Là component RIÊNG để **hook chỉ chạy khi ô này thật sự lưu toạ độ**: gọi `useController` cho
 * bốn trường ghim ngay trong `AddressFields` sẽ nổ ở form không khai chúng, mà hook thì không gọi
 * có điều kiện được. Xuất ra ngoài vì luồng KHÁCH dùng lại đúng ô này mà không có bộ chọn hành
 * chính nào đứng trên (`RenterAddressBlock`).
 */
export function ConfirmedPlaceField<T extends FieldValues>({
  control,
  addressLineName,
  pin,
  anchor = null,
  searchEnabled = true,
  clearOnMount = false,
  label,
  placeholder,
  hint,
  required,
  disabled,
  onServiceAvailabilityChange,
  onPlaceResolved,
}: {
  control: Control<T>;
  addressLineName: Path<T>;
  pin: AddressPinNames<T>;
  /**
   * Kéo gợi ý về gần điểm này khi ô CHƯA có ghim.
   *
   * Backend gửi `proximity` + `circle` quanh nó — thứ KÉO thứ tự kết quả mà không loại bỏ gì,
   * đúng cái cần vì giao xe tận nơi được phép qua ranh giới tỉnh.
   */
  anchor?: GeoPoint | null;
  /**
   * Có được phép hỏi bản đồ chưa. `false` khi chưa biết vùng nào cả — gợi ý lúc đó rải khắp cả
   * nước và chẳng giúp được ai, trong khi mỗi lượt hỏi là một request có tính tiền.
   */
  searchEnabled?: boolean;
  /**
   * Lần dựng này đến từ một cú đổi NGỮ CẢNH (đổi tỉnh) — dọn cả ghim lẫn chữ đã có, vì cả hai mô
   * tả một địa điểm ở tỉnh CŨ. Nơi gọi tăng `key` cùng lúc để component này được REMOUNT — state
   * cục bộ (chữ đã xác nhận, cờ tra hỏng) sạch theo, và effect ở đây chỉ còn phải dọn các trường
   * sống ở FORM, thứ không tự sạch theo một lần remount.
   */
  clearOnMount?: boolean;
  label?: string;
  placeholder?: string;
  hint?: string;
  required: boolean;
  disabled: boolean;
  /**
   * Dịch vụ địa điểm sống hay chết — báo LÊN mỗi khi câu trả lời đổi.
   *
   * Trên native, cái ghim CHỈ sinh ra từ một dòng gợi ý (không có bản đồ tương tác để tự đặt),
   * nên `/places/search` chết nghĩa là người dùng KHÔNG còn đường nào tạo ra một toạ độ. Nơi
   * gọi dùng tin này để thôi bắt buộc toạ độ — bản đồ hỏng không được phép trở thành "không đặt
   * được xe" (ADR 0035 điều 6).
   *
   * `available: false` là câu trả lời TƯỜNG MINH của backend cho "chưa cấu hình khoá / nhà cung
   * cấp lỗi" — không phải một lỗi HTTP, nên phải đọc đúng cờ đó chứ không đợi `isError`.
   */
  onServiceAvailabilityChange?: (available: boolean) => void;
  /**
   * Địa điểm vừa được bản đồ xác nhận. Nơi gọi quyết định làm gì với nó — form vận hành nhắc khi
   * tỉnh lệch, luồng khách lấy `suggestedProvinceCode` làm tỉnh của địa chỉ.
   */
  onPlaceResolved?: (place: { suggestedProvinceCode?: string | null }) => void;
}) {
  const t = useTranslations('Address');
  const tStates = useTranslations('Common.states');

  const addressLine = useController({ control, name: addressLineName });
  const placeId = useController({ control, name: pin.placeId });
  const latitude = useController({ control, name: pin.latitude });
  const longitude = useController({ control, name: pin.longitude });
  const locationSource = useController({ control, name: pin.locationSource });

  const line = (addressLine.field.value as string | null) ?? '';
  const point = toGeoPoint(
    latitude.field.value as number | null,
    longitude.field.value as number | null,
  );

  /**
   * Chữ ĐÃ ĐƯỢC XÁC NHẬN gần nhất — mốc để trả ô về khi người dùng gõ dở rồi bỏ đi. Bản native
   * của cùng cơ chế bên web.
   *
   * Khởi tạo bằng chính giá trị đang có lúc dựng: form SỬA có sẵn địa chỉ trong DB (đã xác nhận
   * từ lần lưu trước), form TẠO MỚI thì rỗng. `clearOnMount` (đổi ngữ cảnh — xem `AddressFields`)
   * ép nó về rỗng bất kể giá trị đang có, vì giá trị đó thuộc về ngữ cảnh CŨ. Có `useRef` song
   * song với state vì `onAddressBlur` chạy ngoài vòng render gần nhất và phải đọc được giá trị
   * MỚI NHẤT, không phải giá trị đóng gói lúc render.
   */
  const [confirmedLine, setConfirmedLine] = useState(clearOnMount ? '' : line);
  const confirmedRef = useRef(confirmedLine);

  /** Đang tra chi tiết một gợi ý vừa bấm — `onBlur` phải để yên cho tới khi tra xong. */
  const resolvingRef = useRef(false);
  /** Gợi ý bấm được nhưng tra chi tiết hỏng — không có toạ độ thì không tính là đã xác nhận. */
  const [detailFailed, setDetailFailed] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  /** Android blurs the input before a suggestion's onPress fires. */
  const pressingSuggestionRef = useRef(false);

  const confirm = (next: string) => {
    confirmedRef.current = next;
    setConfirmedLine(next);
    setDetailFailed(false);
  };

  /** Người dùng đã tự gõ vào ô này chưa — xem effect "nhận mốc từ bên ngoài" ngay dưới. */
  const touchedRef = useRef(false);

  /*
   * Giá trị đổ vào từ BÊN NGOÀI trong lúc người dùng chưa gõ gì thì ĐƯỢC COI LÀ đã xác nhận.
   *
   * Có ba đường hợp lệ để một địa chỉ về muộn hơn lần dựng đầu: luồng đặt xe điền lại địa chỉ
   * khách đã dùng lần trước trong một effect (`delivery-address-memory`), luồng khách seed tỉnh
   * của xe vào ô rỗng, và một địa chỉ cũ chưa từng có toạ độ (ADR 0035 điều 7).
   *
   * Không có khối này thì cả ba trường hợp đều mang mốc rỗng, và cú rời ô ĐẦU TIÊN xoá sạch địa
   * chỉ mà hệ thống vừa tự điền — một lỗi trông y hệt "tự nhiên mất chữ".
   *
   * Chỉ nhận MỘT lần và chỉ khi chưa có mốc: sau khi người dùng gõ, mốc phải đứng yên cho tới
   * một lần xác nhận thật, nếu không mọi thứ họ gõ đều tự phong là đã xác nhận.
   */
  useEffect(() => {
    if (touchedRef.current || !line.trim() || confirmedRef.current.trim()) return;
    confirmedRef.current = line;
    setConfirmedLine(line);
  }, [line]);

  /**
   * Hỏi bản đồ ĐÚNG thứ người dùng gõ, không ghép thêm gì.
   *
   * Bản trước nối tên xã + tên tỉnh vào sau (`"21 Lý Thường Kiệt, TP Huế"`) để kéo kết quả về
   * đúng vùng. Nó phản tác dụng: autocomplete khớp theo TỪ, nên mỗi từ thêm vào là một từ nữa
   * phải khớp — và `"TP Huế"` là NHÃN giao diện, không phải tên trong dữ liệu bản đồ. Kết quả đo
   * được: `q=21 Lý Thường, TP Huế` trả về rỗng trong khi chính chuỗi `21 Lý Thường` ra đúng chỗ.
   *
   * Việc khoanh vùng đã có `biasPoint` lo — xem `anchor`.
   */
  const placeQuery = line.trim();
  const suggestions = usePlaceSearch(placeQuery, {
    // Chưa có ghim thì kéo về điểm neo: gợi ý cho "Nguyễn Huệ" ra đúng vùng đang nói tới thay vì
    // ra TP.HCM mọi lúc, và không tốn thêm request nào để biết vùng đó ở đâu.
    biasPoint: point ?? anchor,
    enabled: !disabled && searchEnabled,
  });
  const placeDetail = usePlaceDetail();
  const reverse = useReverseGeocode();

  /** Tấm chỉnh ghim đang mở — bản đồ tương tác sống trong đó, không nhúng vào form. */
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  /** Có dựng được bản đồ tương tác không (thiếu khoá thì khối bản đồ trở lại CHỈ-XEM). */
  const interactive = isInteractiveMapConfigured();

  /*
   * Chưa hỏi lần nào thì mặc định coi bản đồ SỐNG: ô vẫn đòi xác nhận, và người dùng chưa gõ
   * đủ ba ký tự thì cũng chưa có gì để mất. Chỉ một câu trả lời TƯỜNG MINH mới hạ cờ xuống.
   */
  const serviceAvailable = !(suggestions.isError || suggestions.data?.available === false);
  const reportAvailability = onServiceAvailabilityChange;
  useEffect(() => {
    reportAvailability?.(serviceAvailable);
  }, [reportAvailability, serviceAvailable]);
  /** Kỷ luật "phải xác nhận" có hiệu lực không — hết hiệu lực thì rời ô không tự sửa gì nữa. */
  const strict = !disabled && serviceAvailable;

  const onPickSuggestion = async (id: string) => {
    setSuggestionsOpen(false);
    pressingSuggestionRef.current = false;
    /*
     * Điền phần chữ NGAY, từ chính dòng người dùng vừa bấm — trước cả khi hỏi server.
     *
     * Chữ do server suy lại từ toạ độ KHÔNG khớp thứ người dùng đã chọn: bấm
     * "12, Nguyễn Huệ" mà tra ngược toạ độ đó ra "Hoàng Hạc Cafe, 18A, Nguyễn Huệ" (nhà bên
     * cạnh). Dòng người ta bấm mới là thứ họ muốn, không phải thứ máy suy lại.
     *
     * Làm trước `await` cũng là để ô chữ không đứng im suốt lượt gọi mạng: trên 3G đó là một
     * hai giây người dùng tưởng cú chạm bị trượt.
     */
    const picked = suggestions.data?.items.find((item) => item.placeId === id);
    /*
     * Ô nhận CẢ HAI phần của dòng vừa bấm, không phải mỗi phần đậm (ADR 0042 điều 1).
     *
     * Phần đậm là "21 Lý Thường Kiệt"; phần mờ là "Phường Vĩnh Ninh, Huế". Chỉ lấy phần đậm thì
     * ô địa chỉ nói một con đường mà không nói ở đâu — và từ ADR 0042 ô này KHÔNG còn ô xã/phường
     * đứng cạnh để bù vào, nên nó phải tự mang trọn địa chỉ.
     */
    const pickedText = picked
      ? [picked.primaryText, picked.secondaryText].filter(Boolean).join(', ')
      : '';
    if (pickedText) {
      addressLine.field.onChange(pickedText as PathValue<T, Path<T>>);
    }

    /*
     * Khoá `onAddressBlur` trong lúc tra. Bấm một gợi ý rồi chạm tiếp ra ngoài là thao tác bình
     * thường, và nếu blur chạy giữa chừng nó sẽ thấy chữ mới khác mốc đã xác nhận rồi xoá đúng
     * cái địa chỉ người dùng vừa chọn — lỗi chỉ lộ ra khi mạng chậm, tức là chỉ ở máy người khác.
     */
    resolvingRef.current = true;
    const result = await placeDetail.mutateAsync(id).catch(() => null);
    resolvingRef.current = false;

    const place = result?.place;
    /*
     * Tra hỏng nghĩa là KHÔNG có toạ độ, nghĩa là chưa xác nhận được gì. Trả ô về mốc cũ và nói
     * ra, thay vì để lại một dòng chữ trông như đã chọn xong trong khi phép tính quãng đường
     * phía sau không có điểm nào để đo tới.
     */
    if (!place) {
      addressLine.field.onChange(confirmedRef.current as PathValue<T, Path<T>>);
      setDetailFailed(true);
      return;
    }

    placeId.field.onChange((place.placeId ?? null) as PathValue<T, Path<T>>);
    latitude.field.onChange(Number(place.latitude) as PathValue<T, Path<T>>);
    longitude.field.onChange(Number(place.longitude) as PathValue<T, Path<T>>);
    locationSource.field.onChange(LOCATION_SOURCE.GOOGLE_PLACE as PathValue<T, Path<T>>);
    // Chốt ĐÚNG dòng người dùng đã bấm — chữ và ghim vừa ghi vào form cùng mô tả MỘT địa điểm.
    confirm(pickedText);
    onPlaceResolved?.(place);
  };

  /**
   * Người dùng tự đặt ghim trên bản đồ — bản native của `onMovePin` bên web, cùng bốn bước và
   * cùng thứ tự.
   *
   * Đặt ghim tay LÀ một lời xác nhận vị trí, nên chữ đang có trong ô được chốt lại ngay, kể cả
   * khi tra ngược hỏng sau đó. Đây là lối ra cho những địa chỉ nhà cung cấp bản đồ không biết
   * (hẻm, số nhà mới); không có nó thì "phải chọn từ gợi ý" biến thành "không lưu được".
   */
  const onMovePin = (next: GeoPoint, resolvedLine: string | null) => {
    latitude.field.onChange(next.lat as PathValue<T, Path<T>>);
    longitude.field.onChange(next.lng as PathValue<T, Path<T>>);
    locationSource.field.onChange(LOCATION_SOURCE.MAP_PIN as PathValue<T, Path<T>>);
    /*
     * Ghim tự đặt thì `placeId` cũ không còn mô tả đúng chỗ này nữa — giữ lại là nói dối về
     * nguồn gốc của toạ độ.
     */
    placeId.field.onChange(null as PathValue<T, Path<T>>);
    confirm((addressLine.field.value as string | null) ?? '');

    /*
     * Rồi ĐỔ địa chỉ tra ngược được vào chính ô đó, đè lên chữ cũ.
     *
     * Ghim mới là thứ vừa được đặt, nên nó là sự thật mới — giữ lại dòng chữ của vị trí trước đó
     * là để ô nói một chỗ trong khi toạ độ trỏ một chỗ khác.
     */
    /*
     * Tấm chỉnh ghim ĐÃ tra ngược đúng điểm này để in tên chỗ đó ra cho người dùng đọc trước khi
     * bấm — dùng lại kết quả đó thay vì hỏi `/places/reverse` lần hai cho cùng một toạ độ. Lượt
     * gọi thứ hai vừa tốn tiền vừa có thể trả về một chuỗi KHÁC chuỗi người dùng vừa đọc.
     */
    if (resolvedLine) {
      addressLine.field.onChange(resolvedLine as PathValue<T, Path<T>>);
      confirm(resolvedLine);
      return;
    }

    // Tấm chưa kịp tra xong (người dùng bấm ngay) — tự hỏi ở đây, đúng như `onMovePin` bên web.
    void reverse
      .mutateAsync(next)
      .then((result) => {
        const resolved = result.place?.formattedAddress ?? result.place?.suggestedAddressLine ?? '';
        if (!resolved) return;
        addressLine.field.onChange(resolved as PathValue<T, Path<T>>);
        confirm(resolved);
      })
      .catch(() => {
        // Tra ngược hỏng không làm hỏng cái ghim: toạ độ đã vào form và đã được chốt ở trên.
      });
  };

  /**
   * Rời ô mà chữ chưa được xác nhận nghĩa là trả về mốc đã xác nhận gần nhất — IM LẶNG, cùng
   * luật với web.
   *
   * Không kèm lời nhắc nào: dòng chú thích dưới ô đã nói trước phải làm gì. Không đụng tới cái
   * ghim: nếu đang có ghim thì nó vẫn đúng với chữ đã xác nhận, còn nếu chưa có thì chẳng có gì
   * để dọn. Đây chính là chỗ chặn lỗi "chữ mới, ghim cũ": không có nó, người dùng gõ đè lên một
   * địa chỉ đã chọn rồi bấm Gửi trước khi chọn lại gợi ý sẽ gửi đi một chữ không khớp toạ độ.
   */
  const onAddressBlur = () => {
    if (pressingSuggestionRef.current) return;
    setSuggestionsOpen(false);
    if (!strict || resolvingRef.current) return;
    if (line.trim() === confirmedRef.current.trim()) return;
    addressLine.field.onChange(confirmedRef.current as PathValue<T, Path<T>>);
  };

  /** Người dùng vừa TỰ gõ — phân biệt với giá trị do `setValue` lập trình đổ vào (xem effect trên). */
  const onAddressChangeText = (text: string) => {
    touchedRef.current = true;
    if (detailFailed) setDetailFailed(false);
    setSuggestionsOpen(
      !disabled && searchEnabled && text.trim().length >= PLACE_SEARCH_MIN_LENGTH,
    );
  };

  /*
   * Lần dựng này đến từ một cú đổi NGỮ CẢNH (đổi tỉnh) — dọn cả ghim lẫn chữ, không chỉ ghim.
   * `key` ở nơi gọi đã dựng lại component này, nên state CỤC BỘ sạch sẵn (kể cả `confirmedLine`,
   * khởi tạo thẳng bằng rỗng ở trên khi `clearOnMount`). Ở đây chỉ còn các trường sống trong
   * FORM, thứ không được một lần remount dọn hộ.
   *
   * Effect chạy đúng một lần lúc dựng vì `clearOnMount` cố định trong vòng đời của instance này.
   */
  useEffect(() => {
    if (!clearOnMount) return;
    placeId.field.onChange(null as PathValue<T, Path<T>>);
    latitude.field.onChange(null as PathValue<T, Path<T>>);
    longitude.field.onChange(null as PathValue<T, Path<T>>);
    locationSource.field.onChange(null as PathValue<T, Path<T>>);
    addressLine.field.onChange('' as PathValue<T, Path<T>>);
    // Chạy MỘT LẦN cho mỗi lần dựng; các `field` của RHF đổi định danh mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Bản đồ hiện NGAY, không đợi có ghim — đúng như web (`MapPinPicker` luôn được dựng, và mở ở
   * `fallbackCenter` khi `value` còn rỗng).
   *
   * Trước đợt này app ẩn hẳn khối bản đồ cho tới khi server trả toạ độ, nên suốt lúc người
   * dùng đang gõ địa chỉ — đúng lúc họ cần đối chiếu nhất — chỗ đó chỉ có một dòng "chưa hiện
   * được bản đồ", đọc ra như một thứ đang hỏng.
   *
   * Ảnh vùng KHÔNG có ghim: một cái ghim giữa tâm tỉnh trông y hệt một vị trí đã xác nhận.
   */
  const pinned = mapPreviewUrl(point);
  /*
   * Chưa có ghim ⇒ ảnh VÙNG quanh điểm gần nhất mà app biết: tâm tỉnh đang chọn, hoặc — khi chưa
   * chọn tỉnh — vị trí thiết bị nếu lượt chạy này đã đọc được.
   *
   * Bản ĐỒNG BỘ, cố ý: đây là một ảnh xem trước trong lúc người dùng đang gõ, không phải một cú
   * chạm. Không đo, không hỏi quyền — một hộp thoại bật lên giữa lúc gõ địa chỉ là đúng thứ vừa
   * bị gỡ khỏi màn OTP.
   */
  const area = mapCenterNow({ anchor });
  // KHÔNG rơi về hằng số giữa Đà Nẵng ở đây: ảnh này không kéo được, nên một vùng không liên quan
  // gì tới người đang gõ chỉ là nhiễu. Không biết gì thì giữ nguyên chỗ trống như trước.
  const preview = pinned ?? (area.source === 'fallback' ? null : mapAreaUrl(area.center));
  const items = suggestions.data?.items ?? [];
  const queryReady =
    !disabled && searchEnabled && line.trim().length >= PLACE_SEARCH_MIN_LENGTH;
  const showSuggestions = suggestionsOpen && queryReady;

  const suggestionMenu = showSuggestions ? (
    <YStack
      bg={colors.surfaceElevated}
      br={radius.md}
      bw={1}
      bc={colors.border}
      ov="hidden"
      elevation={4}
      accessibilityRole="menu"
    >
      {suggestions.isFetching && items.length === 0 ? (
        <XStack ai="center" jc="center" gap={space.sm} px={space.md} py={space.md}>
          <ActivityIndicator size="small" color={colors.primaryActive} />
        </XStack>
      ) : suggestions.isError || suggestions.data?.available === false ? (
        <XStack ai="center" gap={space.sm} px={space.md} py={space.md}>
          <Ionicons name="cloud-offline-outline" size={iconSize.sm} color={colors.textMuted} />
          <Text f={1} col={colors.textMuted} fos={fontSize.label}>
            {t('placeUnavailable')}
          </Text>
        </XStack>
      ) : items.length === 0 ? (
        <XStack ai="center" gap={space.sm} px={space.md} py={space.md}>
          <Ionicons name="search-outline" size={iconSize.sm} color={colors.textMuted} />
          <Text f={1} col={colors.textMuted} fos={fontSize.label}>
            {t('placeEmpty')}
          </Text>
        </XStack>
      ) : (
        items.map((item, index) => (
          <Pressable
            key={item.placeId}
            accessibilityRole="menuitem"
            accessibilityLabel={
              [item.primaryText, item.secondaryText].filter(Boolean).join(', ')
            }
            onPressIn={() => {
              pressingSuggestionRef.current = true;
            }}
            onPress={() => void onPickSuggestion(item.placeId)}
            android_ripple={{ color: colors.surfaceSelected }}
          >
            <XStack
              ai="flex-start"
              gap={space.sm}
              px={space.md}
              py={space.sm}
              {...(index > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : {})}
            >
              <Ionicons name="location-outline" size={iconSize.sm} color={colors.primaryActive} />
              <YStack f={1} gap={space.xs}>
                <Text col={colors.text} fos={fieldFontSize.value} numberOfLines={1}>
                  {item.primaryText}
                </Text>
                {item.secondaryText ? (
                  <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
                    {item.secondaryText}
                  </Text>
                ) : null}
              </YStack>
            </XStack>
          </Pressable>
        ))
      )}
    </YStack>
  ) : null;

  /**
   * Lỗi "chưa xác nhận vị trí" đến từ schema và được gắn lên trường TOẠ ĐỘ, thứ không có ô nhập
   * nào để hiện nó. Không kéo lên đây thì người dùng bấm Gửi, không có gì xảy ra, và không có
   * dòng chữ nào nói vì sao.
   */
  const pinError = latitude.fieldState.error?.message ?? longitude.fieldState.error?.message;

  return (
    <YStack gap={space.sm}>
      {/*
        Nhãn mặc định là "Địa chỉ", không còn "Số nhà, đường" (ADR 0042 điều 1): ô này nhận TRỌN
        một địa chỉ chứ không còn là mảnh thứ ba của một cụm ba phần. Hướng dẫn nói TRƯỚC, ở dòng
        chú thích dưới ô — không phải một lời giải thích hiện ra sau khi người dùng đã làm sai.
      */}
      <TextField
        control={control}
        name={addressLineName}
        label={label ?? t('addressLineLabel')}
        placeholder={placeholder ?? t('addressLinePlaceholder')}
        hint={hint ?? t('addressLineHint')}
        required={required}
        editable={!disabled}
        onChangeText={onAddressChangeText}
        onBlur={onAddressBlur}
        onFocus={() => setSuggestionsOpen(queryReady)}
        afterControl={suggestionMenu}
      />

      {/*
        Chỉ còn hai thứ người dùng PHẢI làm gì đó ở đây: một cú bấm gợi ý không ra toạ độ, và
        lỗi "chưa có vị trí" của schema (`pinError`, ngay dưới bản đồ). Cảnh báo lệch tỉnh KHÔNG
        sống ở component dùng chung này — nó chỉ có nghĩa khi có một ô tỉnh đứng trên để so, nên
        `AddressFields` (chủ xe) tự vẽ và tự quản, còn `RenterAddressBlock` (khách) không có.
      */}
      {detailFailed ? <Callout tone="warning" title={t('placeDetailFailed')} /> : null}

      <YStack gap={space.xs}>
        <FieldLabel label={t('mapLabel')} />
        {preview ? (
          <>
            {/*
              Chạm vào ảnh là MỞ TẤM CHỈNH GHIM, kể cả khi chưa có ghim nào: ở đó người dùng
              phóng to, kéo bản đồ và bấm đúng chỗ mình muốn — cùng ba thao tác của web.

              Thiếu khoá bản đồ thì không dựng được bản đồ tương tác, và lúc đó chạm vào ảnh trở
              lại nghĩa cũ: mở app bản đồ của máy để xem kỹ. Chỉ ảnh CÓ GHIM mới mở được app đó —
              một vùng chạm dẫn tới tâm tỉnh là hứa sai về thứ người dùng vừa chạm.
            */}
            <MapPreview
              uri={preview}
              unavailableLabel={tStates('imageUnavailable')}
              /*
               * Chỉ lượt tra CHI TIẾT địa điểm mới cần lớp phủ. Lượt tra NGƯỢC (`reverse`, sau
               * khi tự đặt ghim) thì không: nó chạy sau khi toạ độ đã ghi vào form, nên ảnh bản
               * đồ đã nhảy sang chỗ mới rồi — chỉ còn phần CHỮ là đang chờ, và chữ đó có khung
               * chờ riêng của nó.
               */
              busy={placeDetail.isPending}
              busyLabel={tStates('loading')}
              {...(interactive && !disabled
                ? { onOpen: () => setPinSheetOpen(true), openLabel: t('map.tapToEdit') }
                : point && pinned
                  ? {
                      onOpen: () => void Linking.openURL(mapAppUrl(point)),
                      openLabel: t('map.openInGoogleMaps'),
                    }
                  : {})}
            />
            {interactive && !disabled ? (
              <>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('map.tapToEdit')}
                </Text>
                {/*
                  Xem kỹ bằng GOOGLE MAPS vẫn còn, nhưng lùi xuống một liên kết phụ: cú chạm
                  chính trên ảnh thuộc về việc CHỈNH ghim. Chưa có ghim thì không có gì để mở tới.
                */}
                {point && pinned ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={t('map.openInGoogleMaps')}
                    onPress={() => void Linking.openURL(mapAppUrl(point))}
                  >
                    <XStack ai="center" gap={space.xs}>
                      <Ionicons
                        name="open-outline"
                        size={iconSize.sm}
                        color={colors.primaryActive}
                      />
                      <Text col={colors.primaryActive} fos={fontSize.label}>
                        {t('map.openInGoogleMaps')}
                      </Text>
                    </XStack>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {pinned ? t('map.readOnlyHint') : t('map.pinHint')}
              </Text>
            )}
          </>
        ) : (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('map.unavailable')}
          </Text>
        )}
      </YStack>

      {interactive && !disabled ? (
        <MapPinSheet
          open={pinSheetOpen}
          value={point}
          anchor={anchor}
          onClose={() => setPinSheetOpen(false)}
          onConfirm={onMovePin}
        />
      ) : null}

      {pinError ? (
        <Text col={colors.danger} fos={fontSize.label}>
          {pinError}
        </Text>
      ) : null}
    </YStack>
  );
}
