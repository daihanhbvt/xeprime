import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useKeyboardHold } from '@/components/layout/focus-reveal';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { provinceCenter, toGeoPoint, type GeoPoint } from '@xeprime/domain';
import { LOCATION_SOURCE } from '@xeprime/types';
import { MapPreview } from '@/components/map/MapPreview';
import { Callout } from '@/components/ui/Callout';
import { FieldLabel } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import {
  PLACE_SEARCH_MIN_LENGTH,
  usePlaceDetail,
  usePlaceSearch,
} from '@/features/locations/hooks/use-places';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useWardOptions } from '@/features/locations/hooks/use-wards';
import { placeMapUri } from '@/lib/map-static';
import { readRememberedProvince, rememberProvince } from '@/lib/province-memory';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, fontSize, iconSize, radius, space } from '@/theme/tokens';

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
 * **Phần BẢN ĐỒ khớp web (ADR 0061 điều 1):** chỉ một ẢNH tĩnh do API vẽ cho địa điểm vừa chọn từ
 * gợi ý — không kéo ghim, không bản đồ tương tác. Địa chỉ nhà cung cấp không biết thì chốt bằng
 * "dùng đúng địa chỉ đã nhập" (không toạ độ; server tự tra khi cần).
 */
export function AddressFields<T extends FieldValues>({
  control,
  names,
  pin,
  title,
  required,
  provinceRequired = required,
  wardRequired = required,
  addressLineRequired = required,
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
  /** Số nhà/đường có bắt buộc riêng không. Bỏ trống = theo `required`. */
  addressLineRequired?: boolean;
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
            required={addressLineRequired ?? false}
            disabled={disabled ?? false}
            onConfirmedManually={() => setProvinceMismatch(false)}
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
          required={addressLineRequired ?? false}
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
  onPlaceResolved,
  onConfirmedManually,
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
   * Địa điểm vừa được bản đồ xác nhận. Nơi gọi quyết định làm gì với nó — form vận hành nhắc khi
   * tỉnh lệch, luồng khách lấy `suggestedProvinceCode` làm tỉnh của địa chỉ.
   */
  onPlaceResolved?: (place: { suggestedProvinceCode?: string | null }) => void;
  /**
   * Một địa chỉ GÕ TAY vừa được chốt (không địa điểm nào đi kèm) — nơi gọi dọn những gì nó suy từ
   * địa điểm trước đó (cảnh báo lệch tỉnh, tỉnh của địa điểm cũ). Khớp web.
   */
  onConfirmedManually?: () => void;
}) {
  const colors = useColors();
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
  /**
   * Nguồn của địa chỉ đã xác nhận đó. Chỉ `manual` có hệ quả: địa chỉ gõ tay đã chốt là thứ DUY
   * NHẤT báo giá giao xe được phép tra bằng chữ (mỗi lượt tra là tiền), nên gõ đè lên nó phải tạm
   * gỡ nhãn đó, và ô quay về mốc thì trả lại. Khớp web.
   */
  const confirmedSourceRef = useRef<string | null>(
    clearOnMount ? null : ((locationSource.field.value as string | null) ?? null),
  );

  /**
   * Dòng chữ của NGỮ CẢNH CŨ còn nằm trong form lúc ô dựng lại vì đổi tỉnh (`clearOnMount`) — effect
   * dọn ô chạy SAU effect "nhận mốc từ bên ngoài", nên phải loại trừ đích danh nó (web).
   */
  const staleLineRef = useRef(clearOnMount ? line : null);

  /** Đang tra chi tiết một gợi ý vừa bấm — `onBlur` phải để yên cho tới khi tra xong. */
  const [resolving, setResolving] = useState(false);
  const resolvingRef = useRef(false);
  /**
   * Số thứ tự của lượt chọn gợi ý MỚI NHẤT. Mạng không trả theo thứ tự bấm, nên kết quả của một
   * lượt đã bị thay (bấm dòng khác, gõ tiếp) phải bị bỏ (web `pickSeqRef`).
   */
  const pickSeqRef = useRef(0);
  /** Gợi ý bấm được nhưng tra chi tiết hỏng — không có toạ độ thì không tính là đã xác nhận. */
  const [detailFailed, setDetailFailed] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  /** Android blurs the input before a suggestion's onPress fires. */
  const pressingSuggestionRef = useRef(false);
  /**
   * Khối ô + danh sách gợi ý. Trong lúc ô có tiêu điểm, vùng cuộn bao ngoài GIỮ bàn phím (kéo trang
   * không làm ô mất tiêu điểm — mất tiêu điểm là `onAddressBlur` trả chữ về mốc) và kéo cả khối
   * lên trên mép bàn phím mỗi khi danh sách đổi. Xem `KeyboardHold`.
   */
  const fieldBlockRef = useRef<View>(null);
  const keyboardHold = useKeyboardHold();
  const [focused, setFocused] = useState(false);

  const confirm = (next: string, source: string | null) => {
    confirmedRef.current = next;
    confirmedSourceRef.current = source;
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
  const externalSource = (locationSource.field.value as string | null) ?? null;
  useEffect(() => {
    if (
      touchedRef.current ||
      !line.trim() ||
      confirmedRef.current.trim() ||
      line === staleLineRef.current
    ) {
      return;
    }
    confirmedRef.current = line;
    // Nguồn đổ vào cùng lượt với chữ (bộ nhớ địa chỉ giao xe ghi cả hai) — nhớ kèm theo mốc.
    confirmedSourceRef.current = externalSource;
    setConfirmedLine(line);
    // Chỉ chạy theo CHỮ: nguồn đổi một mình (khách gõ đè địa chỉ gõ tay) không phải giá trị ngoài.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    /*
     * Chỉ hỏi cho chữ NGƯỜI DÙNG đang gõ: chữ trùng địa chỉ đã xác nhận (form sửa vừa mở, địa chỉ
     * nhớ từ lần trước, dòng gợi ý vừa bấm) không có gì để gợi ý thêm, và mỗi lượt hỏi là một giao
     * dịch tính tiền. Đang tra chi tiết dòng vừa bấm thì cũng không hỏi (ADR 0061 §3, khớp web).
     */
    enabled: !disabled && searchEnabled && !resolving,
    except: confirmedLine,
  });
  const placeDetail = usePlaceDetail();

  /*
   * Chưa hỏi lần nào thì mặc định coi bản đồ SỐNG: ô vẫn đòi xác nhận, và người dùng chưa gõ
   * đủ ba ký tự thì cũng chưa có gì để mất. Chỉ một câu trả lời TƯỜNG MINH (`available: false`)
   * mới hạ cờ xuống — một lỗi HTTP thì KHÔNG (web, ADR 0061): một 429 của `@Throttle` mà biến ô
   * thành ô chữ tự do là đóng dấu một chữ chưa xác nhận trong khi nhà cung cấp vẫn khoẻ. Lỗi HTTP
   * chỉ mời "dùng đúng địa chỉ đã nhập" (`offerTypedAddress`).
   */
  const serviceAvailable = suggestions.data?.available !== false;
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
    const seq = (pickSeqRef.current += 1);
    resolvingRef.current = true;
    setResolving(true);
    const result = await placeDetail.mutateAsync(id).catch(() => null);
    // Lượt này đã bị thay trong lúc chờ (bấm dòng khác, gõ tiếp) — kết quả nói về một dòng đã bỏ.
    if (seq !== pickSeqRef.current) return;
    resolvingRef.current = false;
    setResolving(false);

    /*
     * Nhà cung cấp không trả lời được lượt tra chi tiết (hết giao dịch, chạm trần — ADR 0061) ⇒ CHỐT
     * dòng khách vừa bấm như một địa chỉ gõ tay, không bảo "chọn lại": gợi ý có thể đến từ cache
     * trong khi mọi lượt tra đều hỏng, và "chọn lại" lúc đó là một vòng lặp. Khớp web.
     */
    if (result && result.available === false && pickedText) {
      confirmManual(pickedText);
      return;
    }

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
    confirm(pickedText || (place.formattedAddress ?? ''), LOCATION_SOURCE.GOOGLE_PLACE);
    onPlaceResolved?.(place);
  };

  /**
   * "Không có trong danh sách? Dùng đúng địa chỉ đã nhập" — bản native của cùng dòng bên web
   * (ADR 0061 điều 6).
   *
   * Nhà cung cấp gợi ý (Vietmap) không biết mọi hẻm, mọi số nhà mới, và Search của họ không bao
   * giờ trả rỗng — nên "phải chọn từ gợi ý" không được biến thành "không lưu được". Chữ khách gõ
   * được CHỐT như đã xác nhận, KHÔNG kèm toạ độ: ghim cũ (nếu có) mô tả một chỗ khác nên phải dọn,
   * và server tự tra toạ độ khi cần (lúc lưu, lúc báo giá giao xe).
   */
  const onUseTypedAddress = () => {
    setSuggestionsOpen(false);
    pressingSuggestionRef.current = false;
    const typed = line.trim();
    if (typed) confirmManual(typed);
  };

  /**
   * Chốt một địa chỉ GÕ TAY — không địa điểm nào đi kèm. Toạ độ và mã địa điểm cũ bị DỌN vì chúng
   * thuộc về địa chỉ trước đó; nguồn ghi `manual`; nơi gọi được báo để dọn thứ nó suy từ địa điểm
   * cũ (web `confirmManual`).
   */
  function confirmManual(text: string) {
    placeId.field.onChange(null as PathValue<T, Path<T>>);
    latitude.field.onChange(null as PathValue<T, Path<T>>);
    longitude.field.onChange(null as PathValue<T, Path<T>>);
    locationSource.field.onChange(LOCATION_SOURCE.MANUAL as PathValue<T, Path<T>>);
    addressLine.field.onChange(text as PathValue<T, Path<T>>);
    confirm(text, LOCATION_SOURCE.MANUAL);
    onConfirmedManually?.();
  }

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
    setFocused(false);
    if (pressingSuggestionRef.current) return;
    setSuggestionsOpen(false);
    if (!strict || resolvingRef.current) return;
    if (line.trim() === confirmedRef.current.trim()) return;
    addressLine.field.onChange(confirmedRef.current as PathValue<T, Path<T>>);
    // Về lại địa chỉ gõ tay đã chốt ⇒ nhận lại nhãn đã tạm gỡ lúc gõ đè (xem `onAddressChangeText`).
    if (confirmedSourceRef.current === LOCATION_SOURCE.MANUAL) {
      locationSource.field.onChange(LOCATION_SOURCE.MANUAL as PathValue<T, Path<T>>);
    }
  };

  /** Người dùng vừa TỰ gõ — phân biệt với giá trị do `setValue` lập trình đổ vào (xem effect trên). */
  const onAddressChangeText = (text: string) => {
    touchedRef.current = true;
    // Gõ trong lúc đang tra một gợi ý vừa bấm là đổi ý: bỏ lượt tra đó, chữ mới thắng.
    if (resolvingRef.current) {
      pickSeqRef.current += 1;
      resolvingRef.current = false;
      setResolving(false);
    }
    if (detailFailed) setDetailFailed(false);
    if (!strict) {
      /*
       * Gợi ý không dùng được ⇒ ô là ô chữ tự do, và chữ gõ tay CHÍNH LÀ địa chỉ: nguồn `manual`,
       * toạ độ/mã của địa điểm cũ bị dọn vì chúng tả một dòng chữ khác (web).
       */
      if (locationSource.field.value !== LOCATION_SOURCE.MANUAL || point) {
        placeId.field.onChange(null as PathValue<T, Path<T>>);
        latitude.field.onChange(null as PathValue<T, Path<T>>);
        longitude.field.onChange(null as PathValue<T, Path<T>>);
        locationSource.field.onChange(LOCATION_SOURCE.MANUAL as PathValue<T, Path<T>>);
      }
    } else if (confirmedSourceRef.current === LOCATION_SOURCE.MANUAL) {
      /*
       * Gõ đè lên một địa chỉ gõ tay ĐÃ CHỐT thì nó thôi là địa chỉ đã xác nhận: báo giá giao xe
       * tra bằng chữ đúng khi nguồn là `manual`. Gõ về đúng chữ cũ thì nhận lại nhãn (web).
       */
      const back = text.trim() === confirmedRef.current.trim();
      locationSource.field.onChange(
        (back ? LOCATION_SOURCE.MANUAL : null) as PathValue<T, Path<T>>,
      );
    }
    setSuggestionsOpen(!disabled && searchEnabled && text.trim().length >= PLACE_SEARCH_MIN_LENGTH);
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

  /** Mã của địa điểm đang được chọn — có thì hiện ảnh bản đồ của nó dưới ô (khớp web). */
  const mapPlaceId =
    point && locationSource.field.value === LOCATION_SOURCE.GOOGLE_PLACE
      ? ((placeId.field.value as string | null) ?? null)
      : null;
  const items = suggestions.data?.items ?? [];
  const queryReady = !disabled && searchEnabled && line.trim().length >= PLACE_SEARCH_MIN_LENGTH;
  const showSuggestions = suggestionsOpen && queryReady;
  /*
   * Chỉ mời khi danh sách trong tay là của ĐÚNG chữ đang hiện (đã debounce xong, không còn tải) và
   * chữ đó chưa phải địa chỉ đã chốt — mời lúc danh sách còn là của chuỗi trước là chốt một chữ
   * khách chưa kịp thấy gợi ý cho nó.
   */
  const offerTypedAddress =
    serviceAvailable &&
    !suggestions.isFetching &&
    (suggestions.isError || (suggestions.isSuccess && !suggestions.isPlaceholderData)) &&
    suggestions.debouncedQuery === line.trim() &&
    line.trim() !== confirmedLine.trim();
  const typedAddressRow = offerTypedAddress ? (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={t('useTypedAddress')}
      onPressIn={() => {
        pressingSuggestionRef.current = true;
      }}
      onPress={onUseTypedAddress}
      android_ripple={{ color: colors.surfaceSelected }}
    >
      <XStack
        ai="center"
        gap={space.sm}
        px={space.md}
        py={space.sm}
        borderTopWidth={1}
        borderTopColor={colors.borderSubtle}
      >
        <Ionicons name="create-outline" size={iconSize.sm} color={colors.primaryActive} />
        <Text f={1} col={colors.primaryActive} fos={fontSize.label}>
          {t('useTypedAddress')}
        </Text>
      </XStack>
    </Pressable>
  ) : null;

  /*
   * Xin giữ bàn phím khi ô có tiêu điểm, xin lại mỗi lần danh sách đổi hình (để vùng cuộn kéo cả
   * khối lên), trả lại khi rời ô hoặc gỡ ô. `keyboardHold` ổn định theo vùng cuộn.
   */
  const menuShape = showSuggestions
    ? `${items.length}:${suggestions.isFetching ? 1 : 0}:${offerTypedAddress ? 1 : 0}`
    : 'closed';
  useEffect(() => {
    if (!focused) return;
    keyboardHold.hold(fieldBlockRef.current);
  }, [focused, menuShape, keyboardHold]);
  useEffect(() => {
    if (!focused) return;
    return () => keyboardHold.release();
  }, [focused, keyboardHold]);

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
            accessibilityLabel={[item.primaryText, item.secondaryText].filter(Boolean).join(', ')}
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
      {typedAddressRow}
    </YStack>
  ) : null;

  return (
    <YStack gap={space.sm}>
      {/*
        Nhãn mặc định là "Địa chỉ", không còn "Số nhà, đường" (ADR 0042 điều 1): ô này nhận TRỌN
        một địa chỉ chứ không còn là mảnh thứ ba của một cụm ba phần. Hướng dẫn nói TRƯỚC, ở dòng
        chú thích dưới ô — không phải một lời giải thích hiện ra sau khi người dùng đã làm sai.
      */}
      <View ref={fieldBlockRef} collapsable={false}>
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
          onFocus={() => {
            setFocused(true);
            setSuggestionsOpen(queryReady);
          }}
          afterControl={suggestionMenu}
        />
      </View>

      {/*
        Chỉ còn hai thứ người dùng PHẢI làm gì đó ở đây: một cú bấm gợi ý không ra toạ độ, và
        lỗi "chưa có vị trí" của schema (`pinError`, ngay dưới bản đồ). Cảnh báo lệch tỉnh KHÔNG
        sống ở component dùng chung này — nó chỉ có nghĩa khi có một ô tỉnh đứng trên để so, nên
        `AddressFields` (chủ xe) tự vẽ và tự quản, còn `RenterAddressBlock` (khách) không có.
      */}
      {detailFailed ? <Callout tone="warning" title={t('placeDetailFailed')} /> : null}

      {/*
        Ảnh bản đồ TĨNH của địa điểm vừa chọn — để người dùng nhìn lại "đúng chỗ này chưa", không
        kéo không phóng (ADR 0061 điều 1, khớp `ConfirmedPlaceField` bên web). Chỉ cho địa điểm chọn
        từ gợi ý: API chỉ vẽ cho mã đã tra xong, còn địa chỉ gõ tay thì không có toạ độ nào để vẽ.
        Ảnh lỗi (mã cũ, quá hạn cache, bản đồ hỏng) thì `MapPreview` tự ẩn.
      */}
      {mapPlaceId ? (
        <MapPreview
          uri={placeMapUri(mapPlaceId)}
          accessibilityLabel={t('mapLabel')}
          busy={placeDetail.isPending}
          busyLabel={tStates('loading')}
        />
      ) : null}
    </YStack>
  );
}
