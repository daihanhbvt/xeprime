'use client';

import { EnvironmentOutlined } from '@ant-design/icons';
import { Alert, AutoComplete, Form, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';
import type { GeoPoint } from '@xeprime/domain';
import { LOCATION_SOURCE } from '@xeprime/types';
import { MapPinPicker } from '@/components/form/MapPinPicker';
import {
  PLACE_SEARCH_MIN_LENGTH,
  usePlaceDetail,
  usePlaceSearch,
  useReverseGeocode,
} from '@/features/locations/hooks/use-places';
import type { PlaceDetail } from '@/features/locations/types';
import fieldStyles from './field.module.css';
import styles from './AddressField.module.css';

/**
 * Tên bốn trường GHIM. Truyền hay không là một quyết định sản phẩm, không phải tuỳ tiện:
 *
 * - CÓ ghim ở những địa chỉ mà toạ độ có hệ quả — chi nhánh (điểm xuất phát tính phí giao xe),
 *   địa chỉ giao xe, điểm đón khách. Ở đó cái ghim phải được người dùng nhìn và xác nhận.
 * - KHÔNG ghim ở địa chỉ chỉ để liên hệ (sổ khách). Bắt người ta xác nhận một cái ghim mà hệ
 *   thống không dùng tới là thêm một bước vô nghĩa, và mỗi lượt tra bản đồ là một request có
 *   tính tiền.
 *
 * Bốn trường đi CÙNG NHAU: có `latitude` mà thiếu `longitude` là một cấu hình sai, và kiểu này
 * khiến nó không biên dịch được thay vì hỏng ở chỗ khác, muộn hơn.
 */
export interface AddressPinNames<T extends FieldValues> {
  placeId: Path<T>;
  latitude: Path<T>;
  longitude: Path<T>;
  locationSource: Path<T>;
}

export interface ConfirmedPlaceFieldProps<T extends FieldValues> {
  control: Control<T>;
  /** Trường giữ phần chữ của địa chỉ. */
  addressLineName: Path<T>;
  pin: AddressPinNames<T>;
  label: string;
  placeholder?: string;
  /** Mở bản đồ ở đâu khi chưa có ghim, và kéo gợi ý về gần đó. */
  anchor?: GeoPoint | null;
  /** Thu phóng khi mở ở `anchor`. Bỏ trống = mặc định của `MapPinPicker`. */
  anchorZoom?: number;
  /**
   * Có được phép hỏi bản đồ chưa. `false` khi chưa biết vùng nào cả — gợi ý lúc đó rải khắp cả
   * nước và chẳng giúp được ai, trong khi mỗi lượt hỏi là một request có tính tiền.
   */
  searchEnabled?: boolean;
  /** Lần dựng này đến từ một cú đổi NGỮ CẢNH (đổi tỉnh) — dọn cả ghim lẫn chữ. */
  clearOnMount?: boolean;
  required?: boolean;
  disabled?: boolean;
  /**
   * Một địa điểm vừa được tra xong. Nơi gọi quyết định làm gì với nó — form vận hành nhắc khi
   * tỉnh lệch, luồng khách lấy `suggestedProvinceCode` làm tỉnh của địa chỉ.
   */
  onPlaceResolved?: (place: PlaceDetail) => void;
}

/**
 * Ô ĐỊA CHỈ mà chữ trong đó luôn ĐÃ ĐƯỢC BẢN ĐỒ XÁC NHẬN.
 *
 * ## Vì sao ô này tồn tại
 *
 * Trước đây đây là một ô chữ tự do có kèm gợi ý: gõ gì cũng lưu được, và chỉ những người bấm vào
 * một gợi ý mới có toạ độ. Hệ quả nằm ở chỗ khác hẳn — phí giao xe tận nơi tính bằng quãng đường
 * từ chi nhánh tới CÁI GHIM, nên một địa chỉ không ghim là một đơn không tính được phí, và điều
 * đó chỉ lộ ra ở bước báo giá, sau khi người ta đã điền xong mọi thứ.
 *
 * Nên chữ trong ô luôn là một trong hai thứ, không có thứ ba:
 *   1. dòng người dùng BẤM trong danh sách gợi ý của bản đồ; hoặc
 *   2. chữ đang có tại thời điểm họ tự ĐẶT GHIM trên bản đồ — ghim tay cũng là một lời xác nhận
 *      vị trí, và với dữ liệu OpenStreetMap ở Việt Nam (hẻm, số nhà mới còn thưa) đó là lối ra
 *      duy nhất cho những địa chỉ mà không nhà cung cấp nào biết.
 *
 * Gõ mà không xác nhận thì khi rời ô, chữ quay về giá trị đã xác nhận GẦN NHẤT — với form tạo
 * mới đó là rỗng, nên ô trống và schema chặn Lưu. Cố ý không xoá về rỗng một cách máy móc: ở form
 * SỬA, giá trị đã xác nhận gần nhất là chính địa chỉ đang lưu trong DB, và xoá nó vì người dùng
 * lỡ gõ thêm một ký tự rồi bấm ra ngoài là phá dữ liệu có thật (ADR 0035 điều 7).
 *
 * ## Bản đồ hỏng thì kỷ luật này TẮT
 *
 * Chưa cấu hình khoá, hết hạn mức, nhà cung cấp lỗi — `/places/search` trả `available: false`, và
 * lúc đó ô quay về đúng một ô chữ tự do. Bắt buộc chọn từ một danh sách luôn rỗng nghĩa là không
 * ai lưu nổi địa chỉ nào cho tới khi bản đồ sống lại (ADR 0035 điều 6).
 *
 * ## Ô này KHÔNG biết gì về danh mục hành chính
 *
 * Tỉnh và xã là việc của nơi gọi: `AddressField` đặt hai bộ chọn phía trên, còn luồng đặt xe của
 * khách chỉ hiện tỉnh của chiếc xe làm ngữ cảnh và không hỏi xã (ADR 0035 điều 3 — không danh mục
 * nhà nước nào phát hành số nhà, và người thuê xe ở tỉnh khác thì không biết mình đang ở phường
 * nào). Nhờ vậy hai luồng dùng CÙNG một bản logic xác nhận thay vì mỗi bên một bản.
 */
export function ConfirmedPlaceField<T extends FieldValues>({
  control,
  addressLineName,
  pin,
  label,
  placeholder,
  anchor = null,
  anchorZoom,
  searchEnabled = true,
  clearOnMount = false,
  required,
  disabled,
  onPlaceResolved,
}: ConfirmedPlaceFieldProps<T>) {
  const t = useTranslations('Address');

  const addressLine = useController({ control, name: addressLineName });
  const placeId = useController({ control, name: pin.placeId });
  const latitude = useController({ control, name: pin.latitude });
  const longitude = useController({ control, name: pin.longitude });
  const locationSource = useController({ control, name: pin.locationSource });

  const line = (addressLine.field.value as string | null) ?? '';
  const inputId = `${String(addressLineName)}-${useId()}`;

  const point = useMemo<GeoPoint | null>(() => {
    const lat = latitude.field.value as number | null | undefined;
    const lng = longitude.field.value as number | null | undefined;
    return lat == null || lng == null ? null : { lat, lng };
  }, [latitude.field.value, longitude.field.value]);

  /**
   * Chữ ĐÃ ĐƯỢC XÁC NHẬN gần nhất — mốc để trả ô về khi người dùng gõ dở rồi bỏ đi.
   *
   * Khởi tạo bằng chính giá trị đang có lúc dựng: ở form sửa đó là địa chỉ trong DB (đã xác nhận
   * từ lần lưu trước), ở form tạo mới đó là rỗng. Có `useRef` song song với state vì trình xử lý
   * `onBlur` chạy ngoài vòng render gần nhất và phải đọc được giá trị MỚI NHẤT, không phải giá
   * trị đóng gói lúc render.
   */
  const [confirmedLine, setConfirmedLine] = useState(clearOnMount ? '' : line);
  const confirmedRef = useRef(confirmedLine);

  /** Đang tra chi tiết một gợi ý vừa bấm — `onBlur` phải để yên cho tới khi tra xong. */
  const [resolving, setResolving] = useState(false);
  const resolvingRef = useRef(false);

  /** Gợi ý bấm được nhưng tra chi tiết hỏng — không có toạ độ thì không tính là đã xác nhận. */
  const [detailFailed, setDetailFailed] = useState(false);

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
   * `useState(line)` ở trên chỉ bắt được giá trị có mặt ngay lúc dựng, mà có ba đường hợp lệ để
   * một địa chỉ về muộn hơn thế: form sửa nạp bản ghi bằng `reset()` sau khi API trả, luồng đặt
   * xe điền lại địa chỉ khách đã dùng lần trước trong một effect (`delivery-address-memory`), và
   * một địa chỉ cũ chưa từng có toạ độ (ADR 0035 điều 7).
   *
   * Không có khối này thì cả ba trường hợp đều mang mốc rỗng, và cú blur ĐẦU TIÊN xoá sạch địa
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
   * Việc khoanh vùng đã có `bias` lo: backend gửi `proximity` + `circle` quanh điểm neo, thứ KÉO
   * thứ tự kết quả mà không loại bỏ gì — đúng cái cần, vì giao xe tận nơi được phép qua ranh giới
   * tỉnh.
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

  /**
   * Bản đồ có đang dùng được không.
   *
   * `available: false` là câu trả lời TƯỜNG MINH của backend cho "chưa cấu hình khoá / nhà cung
   * cấp lỗi" — không phải một lỗi HTTP, nên phải đọc đúng cờ này chứ không đợi `isError`. Chưa
   * hỏi lần nào thì `data` là `undefined`, và lúc đó mặc định coi như bản đồ SỐNG: ô vẫn đòi xác
   * nhận, và người dùng chưa gõ đủ ba ký tự thì cũng chưa có gì để mất.
   */
  const placeServiceDown = suggestions.isError || suggestions.data?.available === false;
  /** Kỷ luật "phải xác nhận" có hiệu lực không — xem docblock của component. */
  const strict = !disabled && !placeServiceDown;

  const setPoint = (next: GeoPoint | null, source: string | null) => {
    latitude.field.onChange((next?.lat ?? null) as PathValue<T, Path<T>>);
    longitude.field.onChange((next?.lng ?? null) as PathValue<T, Path<T>>);
    locationSource.field.onChange((source ?? null) as PathValue<T, Path<T>>);
  };

  const setLine = (next: string) => {
    addressLine.field.onChange(next as PathValue<T, Path<T>>);
  };

  const onPickSuggestion = async (id: string) => {
    /*
     * Điền ĐỦ địa chỉ của dòng vừa bấm vào ô, NGAY, trước cả khi hỏi server.
     *
     * Đủ nghĩa là cả hai phần của dòng gợi ý (`"21 Lý Thường Kiệt"` + `"Phường Vĩnh Ninh, Huế"`),
     * không phải mỗi phần đậm: người dùng chọn cái họ ĐỌC được, nên ô phải hiện lại đúng cái đó.
     * Nhờ vậy cũng không cần thêm một dòng "Ghim đang ở: …" bên dưới để nói cùng một chuyện.
     *
     * Điền tại đây chứ không để `onChange` của AntD tự xử: nó phát `value` của lựa chọn — tức MÃ
     * ĐỊA ĐIỂM — nên bất kỳ lỗi nào sau đó là người dùng nhìn thấy một dãy ký tự vô nghĩa trong ô
     * địa chỉ.
     */
    const picked = suggestions.data?.items.find((s) => s.placeId === id);
    const pickedText = picked
      ? [picked.primaryText, picked.secondaryText].filter(Boolean).join(', ')
      : '';
    if (pickedText) setLine(pickedText);

    /*
     * Khoá `onBlur` trong lúc tra. Bấm một gợi ý rồi bấm tiếp ra ngoài là thao tác bình thường,
     * và nếu `onBlur` chạy giữa chừng nó sẽ thấy chữ mới khác chữ đã xác nhận rồi xoá đúng cái
     * địa chỉ người dùng vừa chọn — lỗi chỉ xuất hiện khi mạng chậm, tức là chỉ ở máy người khác.
     */
    resolvingRef.current = true;
    setResolving(true);
    const result = await placeDetail.mutateAsync(id).catch(() => null);
    resolvingRef.current = false;
    setResolving(false);

    const place = result?.place;
    /*
     * Tra hỏng nghĩa là KHÔNG có toạ độ, nghĩa là chưa xác nhận được gì. Trả ô về mốc cũ và nói
     * ra, thay vì để lại một dòng chữ trông như đã chọn xong trong khi phép tính quãng đường phía
     * sau không có điểm nào để đo tới.
     */
    if (!place) {
      setLine(confirmedRef.current);
      setDetailFailed(true);
      return;
    }

    placeId.field.onChange(place.placeId as PathValue<T, Path<T>>);
    setPoint(
      { lat: Number(place.latitude), lng: Number(place.longitude) },
      LOCATION_SOURCE.GOOGLE_PLACE,
    );
    // Chốt ĐÚNG dòng người dùng đã bấm. `formattedAddress` do server suy lại từ toạ độ có thể ra
    // nhà bên cạnh, nên nó chỉ là bản dự phòng khi dòng gợi ý không còn trong danh sách.
    confirm(pickedText || (place.formattedAddress ?? ''));
    onPlaceResolved?.(place);
  };

  const onMovePin = (next: GeoPoint) => {
    setPoint(next, LOCATION_SOURCE.MAP_PIN);
    // Ghim tự đặt thì `placeId` cũ không còn mô tả đúng chỗ này nữa — giữ lại là nói dối về
    // nguồn gốc của toạ độ.
    placeId.field.onChange(null as PathValue<T, Path<T>>);
    /*
     * Đặt ghim tay LÀ một lời xác nhận vị trí, nên chữ đang có trong ô được chốt lại ngay — kể cả
     * khi tra ngược hỏng sau đó. Đây là lối ra cho những địa chỉ mà nhà cung cấp bản đồ không
     * biết (hẻm, số nhà mới); không có nó thì "phải chọn từ gợi ý" biến thành "không lưu được".
     */
    confirm((addressLine.field.value as string | null) ?? '');
    /*
     * Rồi ĐỔ địa chỉ tra ngược được vào chính ô đó, đè lên chữ cũ.
     *
     * Ghim mới là thứ vừa được đặt, nên nó là sự thật mới — giữ lại dòng chữ của vị trí trước đó
     * là để ô nói một chỗ trong khi toạ độ trỏ một chỗ khác. Bản trước chỉ điền khi ô đang TRỐNG,
     * và đó là cách chắc chắn nhất để hai thứ lệch nhau mà không ai thấy.
     */
    void reverse
      .mutateAsync(next)
      .then((r) => {
        const resolved = r.place?.formattedAddress ?? r.place?.suggestedAddressLine ?? '';
        if (!resolved) return;
        setLine(resolved);
        confirm(resolved);
      })
      .catch(() => {
        // Tra ngược hỏng không làm hỏng cái ghim: toạ độ đã vào form và đã được chốt ở trên.
      });
  };

  /**
   * Rời ô mà chữ chưa được xác nhận nghĩa là trả về mốc đã xác nhận gần nhất — IM LẶNG.
   *
   * Không kèm lời nhắc nào: dòng chú thích dưới ô đã nói trước phải làm gì, và một cảnh báo hiện
   * ra sau khi chữ biến mất chỉ giải thích một cơ chế nội bộ đúng lúc người dùng đang muốn đi tiếp.
   *
   * Không đụng tới cái ghim: nếu đang có ghim thì nó vẫn đúng với chữ đã xác nhận, còn nếu chưa
   * có thì chẳng có gì để dọn.
   */
  const onAddressBlur = () => {
    addressLine.field.onBlur();
    if (!strict || resolvingRef.current) return;
    const current = (addressLine.field.value as string | null) ?? '';
    if (current.trim() === confirmedRef.current.trim()) return;
    setLine(confirmedRef.current);
  };

  /*
   * Ngữ cảnh đổi (người dùng đổi tỉnh) nghĩa là ghim cũ nằm ở tỉnh khác và dòng chữ cũ mô tả một
   * con đường ở tỉnh khác. Bỏ cả hai thay vì mang theo một địa chỉ chắc chắn sai.
   *
   * `key` ở nơi gọi đã dựng lại component này, nên state CỤC BỘ sạch sẵn — kể cả `confirmedLine`,
   * thứ được khởi tạo thẳng bằng rỗng khi `clearOnMount` (nếu không nó nhận địa chỉ của ngữ cảnh
   * CŨ và trở thành cái mốc mà mọi cú blur sau đó khôi phục về). Ở đây chỉ còn các trường trong
   * FORM, thứ sống ngoài vòng đời component và không được remount dọn hộ.
   *
   * Effect chạy đúng một lần lúc dựng vì `clearOnMount` cố định trong vòng đời của instance này.
   */
  useEffect(() => {
    if (!clearOnMount) return;
    setPoint(null, null);
    placeId.field.onChange(null as PathValue<T, Path<T>>);
    setLine('');
    // Chạy MỘT LẦN cho mỗi lần dựng; các `field` của RHF đổi định danh mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Lỗi "chưa xác nhận vị trí" đến từ schema và được gắn lên trường TOẠ ĐỘ, thứ không có ô nhập
   * nào để hiện nó. Không kéo lên đây thì người dùng bấm Gửi, không có gì xảy ra, và không có
   * dòng chữ nào nói vì sao.
   */
  const pinError = latitude.fieldState.error?.message ?? longitude.fieldState.error?.message;

  return (
    <>
      <Form.Item
        label={label}
        htmlFor={inputId}
        required={required}
        validateStatus={addressLine.fieldState.error ? 'error' : ''}
        help={addressLine.fieldState.error?.message ?? (strict ? t('addressLineHint') : undefined)}
        className={fieldStyles.item}
      >
        <AutoComplete
          id={inputId}
          value={line}
          disabled={disabled}
          /*
           * Bấm một gợi ý làm AntD phát `onChange` với `value` của lựa chọn — tức MÃ ĐỊA ĐIỂM,
           * không phải chữ. Chặn ngay tại đây thay vì trông chờ `onSelect` ghi đè sau: thứ tự
           * hai sự kiện đó là chi tiết nội bộ của rc-select, và đặt cược vào nó nghĩa là một
           * bản nâng cấp AntD có thể lặng lẽ dán một dãy hash vào ô địa chỉ của khách.
           */
          onChange={(value: string) => {
            if (suggestions.data?.items.some((s) => s.placeId === value)) return;
            touchedRef.current = true;
            // Gõ tiếp là bỏ qua lời nhắc vừa rồi — nó nói về lần gõ trước, không phải lần này.
            if (detailFailed) setDetailFailed(false);
            setLine(value);
          }}
          onBlur={onAddressBlur}
          onSelect={(value: string) => void onPickSuggestion(value)}
          placeholder={placeholder}
          // Lọc phía client TẮT: danh sách đến từ bản đồ theo đúng chữ vừa gõ, lọc lần nữa sẽ
          // giấu mất chính kết quả vừa tìm được.
          filterOption={false}
          notFoundContent={
            suggestions.isFetching || resolving ? (
              <Spin size="small" />
            ) : placeServiceDown ? (
              t('placeUnavailable')
            ) : line.trim().length >= PLACE_SEARCH_MIN_LENGTH ? (
              t('placeEmpty')
            ) : null
          }
          options={(suggestions.data?.items ?? []).map((s) => ({
            value: s.placeId,
            label: (
              <span className={styles.suggestion}>
                <EnvironmentOutlined className={styles.suggestionIcon} />
                <span className={styles.suggestionText}>
                  <strong>{s.primaryText}</strong>
                  {s.secondaryText ? <em>{s.secondaryText}</em> : null}
                </span>
              </span>
            ),
          }))}
          status={addressLine.fieldState.error ? 'error' : undefined}
        />
      </Form.Item>

      {/*
        Ở đây từng có ba dòng nữa: "đã trả ô về địa chỉ đã xác nhận", "vị trí này do hệ thống tra
        tự động, hãy xem lại ghim", và "ghim đang ở: …".

        Cả ba đều là GIẢI THÍCH CƠ CHẾ, không phải thông tin để hành động — và chúng đứng chen
        giữa ô nhập với bản đồ, đúng chỗ mắt người dùng đang đi. Ô gõ dở giờ tự về rỗng, im lặng;
        địa chỉ đã chọn thì nằm ngay trong ô, nên không cần một dòng thứ hai nhắc lại nó.

        Thứ ở lại là hai thứ người dùng PHẢI làm gì đó: một cú bấm gợi ý không ra toạ độ, và lỗi
        "chưa có vị trí" của schema.
      */}
      {detailFailed ? (
        <Alert type="warning" showIcon className={styles.alert} title={t('placeDetailFailed')} />
      ) : null}

      <MapPinPicker
        value={point}
        onChange={onMovePin}
        fallbackCenter={anchor}
        fallbackZoom={anchorZoom}
        label={t('mapLabel')}
        disabled={disabled}
      />

      {pinError ? (
        <p className={styles.pinError} role="alert">
          {pinError}
        </p>
      ) : null}
    </>
  );
}
