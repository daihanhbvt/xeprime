'use client';

import { EnvironmentOutlined } from '@ant-design/icons';
import { Alert, AutoComplete, Button, Form, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';
import type { GeoPoint } from '@xeprime/domain';
import { LOCATION_SOURCE } from '@xeprime/types';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { MapPinPicker } from '@/components/form/MapPinPicker';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useWardOptions } from '@/features/locations/hooks/use-wards';
import {
  PLACE_SEARCH_MIN_LENGTH,
  usePlaceDetail,
  usePlaceSearch,
  useReverseGeocode,
} from '@/features/locations/hooks/use-places';
import fieldStyles from './field.module.css';
import styles from './AddressField.module.css';

/**
 * Tên ba trường HÀNH CHÍNH + chi tiết của một địa chỉ trong form.
 *
 * Nhận TÊN chứ không nhận object giá trị: một payload có thể mang nhiều địa chỉ (yêu cầu thuê có
 * cả điểm đón lẫn địa chỉ giao xe), mỗi cái một tiền tố. Khai tên tường minh giữ cho ô này dùng
 * lại được mà không bắt form phải gom địa chỉ thành object lồng.
 */
export interface AddressFieldNames<T extends FieldValues> {
  provinceCode: Path<T>;
  wardCode: Path<T>;
  addressLine: Path<T>;
}

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

interface AddressFieldProps<T extends FieldValues> {
  control: Control<T>;
  names: AddressFieldNames<T>;
  /** Bỏ trống = địa chỉ này không lưu toạ độ: không gợi ý địa điểm, không bản đồ. */
  pin?: AddressPinNames<T>;
  /** Tiêu đề khối — bỏ trống thì không hiện, dùng khi form đã có tiêu đề bao ngoài. */
  title?: string;
  /** Ô địa chỉ này có bắt buộc không (dấu sao của AntD; ràng buộc thật ở Yup). */
  required?: boolean;
  /**
   * Xã/phường có bắt buộc riêng không. Bỏ trống = theo `required`.
   *
   * Có prop riêng vì hai luồng khác nhau thật: form CHI NHÁNH đòi đủ hai cấp (đó là địa điểm
   * vận hành), còn hồ sơ gian hàng chỉ đòi tỉnh — chặn xã ở đó là khoá luôn việc sửa số tài
   * khoản ngân hàng của một hồ sơ có từ trước danh mục cấp xã. Dấu sao phải nói đúng schema,
   * nếu không nó là một lời hứa sai ngay trên nhãn.
   */
  wardRequired?: boolean;
  disabled?: boolean;
  /**
   * Ghi chú ngữ cảnh đặt ngay trên khối — ví dụ màn hồ sơ gian hàng nhắc rằng đổi địa chỉ ở đây
   * là dời vị trí công khai của mọi xe thuộc chi nhánh mặc định.
   */
  notice?: React.ReactNode;
}

/**
 * Ô nhập ĐỊA CHỈ VẬT LÝ — ba bước, đúng thứ tự mà dữ liệu Việt Nam cho phép.
 *
 * 1. **Tỉnh/thành** và 2. **xã/phường/đặc khu** chọn từ DANH MỤC NHÀ NƯỚC (mô hình hai cấp, hiệu
 *    lực 01/07/2025 — không có quận/huyện). Cả hai đều có ô tìm; danh mục cấp xã lọc ở server
 *    theo khoá đã bỏ dấu nên gõ `"ba dinh"` ra `"Phường Ba Đình"`.
 * 3. **Số nhà, đường** thì GÕ, có gợi ý địa điểm Google khi ô này lưu toạ độ. Không danh mục nhà
 *    nước nào phát hành số nhà và tên đường, nên ép chọn từ dropdown là bịa ra một danh mục
 *    không tồn tại.
 *
 * **Ghim là bước KIỂM, không phải bước nhập.** Gợi ý của Google còn dùng tên đơn vị hành chính
 * CŨ và đôi khi ghim lệch cả trăm mét. Toạ độ đó tính phí giao xe và là chỗ tài xế lái tới, nên
 * khối bản đồ nói rõ ghim đang đến từ đâu: người tự đặt, hay máy đoán.
 *
 * Phần hành chính và phần toạ độ là HAI ĐƯỜNG ĐỘC LẬP: chọn một gợi ý Google KHÔNG tự đổi tỉnh
 * đã chọn — nó chỉ hiện một lời nhắc nếu hai bên không khớp, và người dùng là người chốt.
 */
export function AddressField<T extends FieldValues>({
  control,
  names,
  pin,
  title,
  required,
  wardRequired = required,
  disabled,
  notice,
}: AddressFieldProps<T>) {
  const t = useTranslations('Address');
  const tc = useTranslations('Common');

  const province = useController({ control, name: names.provinceCode });
  const ward = useController({ control, name: names.wardCode });

  const provinceCode = (province.field.value as string | null) ?? '';
  const wardCode = (ward.field.value as string | null) ?? '';

  const provinces = useProvinceOptions();
  const [wardSearch, setWardSearch] = useState('');
  const wards = useWardOptions(provinceCode, wardSearch);

  /**
   * Người dùng vừa đổi tỉnh ⇒ mã xã cũ chắc chắn sai, và cái ghim cũ nằm ở tỉnh khác.
   *
   * Dọn trong TRÌNH XỬ LÝ SỰ KIỆN, không phải trong effect nhìn `provinceCode` đổi: effect
   * không phân biệt được "người dùng vừa đổi tỉnh" với "form vừa mở ở chế độ sửa và đã có sẵn
   * tỉnh + xã", nên bản trước phải thêm một `useRef` đọc ngay lúc render để nhớ mốc cũ. Sự kiện
   * thì biết chắc, và không tạo vòng render phụ nào.
   *
   * Xoá xã ngay thay vì để backend từ chối lúc lưu: FK tổ hợp `(ward_code, province_code)` sẽ
   * chặn, nhưng người dùng nhận một lỗi không giải thích được.
   *
   * `pinResetKey` nhích lên để dựng lại phần ghim: state cục bộ của nó (địa chỉ đã đọc ngược,
   * cảnh báo lệch tỉnh) sạch theo, và nó tự dọn bốn trường ghim trong form. Khởi đầu là `0` nên
   * lần mở đầu tiên KHÔNG dọn gì — đúng thứ form ở chế độ sửa cần.
   */
  const [pinResetKey, setPinResetKey] = useState(0);
  const onProvinceChange = () => {
    ward.field.onChange('' as PathValue<T, Path<T>>);
    setWardSearch('');
    setPinResetKey((n) => n + 1);
  };

  /** Tên xã + tên tỉnh ĐANG CHỌN — dùng làm ngữ cảnh khi hỏi bản đồ. */
  const locationContext = useMemo(() => {
    const wardName = wards.items.find((w) => w.code === wardCode)?.name ?? '';
    const provinceName = provinces.options.find((p) => p.value === provinceCode)?.label ?? '';
    return [wardName, provinceName].filter(Boolean).join(', ');
  }, [wards.items, wardCode, provinces.options, provinceCode]);

  return (
    <section className={styles.block} aria-label={title ?? t('sectionTitle')}>
      {title ? <h3 className={styles.title}>{title}</h3> : null}
      {notice}

      {provinces.isError ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          title={t('provinceLoadError')}
          action={
            <Button size="small" onClick={provinces.refetch}>
              {tc('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {/*
        Danh mục RỖNG cũng khoá ô: một dropdown mở ra không có gì để chọn là điều khiển chết, và
        người dùng sẽ ngồi thử lại thay vì đọc được lý do.
      */}
      <SelectField
        control={control}
        name={names.provinceCode}
        label={t('provinceLabel')}
        required={required}
        onAfterChange={onProvinceChange}
        showSearch
        options={provinces.options}
        loading={provinces.isLoading}
        disabled={disabled || provinces.isError || provinces.options.length === 0}
        placeholder={t('provincePlaceholder')}
        /*
         * Trạng thái của danh mục nói ở DÒNG CHÚ THÍCH, không ở placeholder: placeholder biến
         * mất ngay khi ô có giá trị, mà "đang tải" và "chưa có tỉnh nào" là những câu người dùng
         * cần đọc đúng lúc ô đang trống VÀ lúc họ quay lại xem vì sao không chọn được gì.
         */
        help={
          provinces.isLoading
            ? t('provinceLoading')
            : provinces.options.length === 0 && !provinces.isError
              ? t('provinceEmpty')
              : undefined
        }
      />

      <SelectField
        control={control}
        name={names.wardCode}
        label={t('wardLabel')}
        required={wardRequired}
        showSearch
        options={wards.options}
        loading={wards.isLoading}
        disabled={disabled || !provinceCode}
        placeholder={t('wardPlaceholder')}
        onSearch={setWardSearch}
        notFoundContent={wards.isLoading ? <Spin size="small" /> : t('wardEmpty')}
        /*
         * Chỉ nói khi có chuyện: chưa chọn tỉnh, hoặc danh mục lỗi. Đếm số đơn vị của tỉnh là
         * một con số người đang điền địa chỉ không dùng vào việc gì.
         */
        help={
          !provinceCode ? t('wardNeedsProvince') : wards.isError ? t('wardLoadError') : undefined
        }
      />

      {pin ? (
        <AddressLocationSection
          key={pinResetKey}
          clearPin={pinResetKey > 0}
          control={control}
          addressLineName={names.addressLine}
          pin={pin}
          provinceCode={provinceCode}
          locationContext={locationContext}
          required={required}
          disabled={disabled}
        />
      ) : (
        <TextField
          control={control}
          name={names.addressLine}
          label={t('addressLineLabel')}
          placeholder={t('addressLinePlaceholder')}
          required={required}
          disabled={disabled}
        />
      )}
    </section>
  );
}

/**
 * Phần "số nhà, đường + ghim" — tách thành component riêng để **hook chỉ chạy khi ô này thật sự
 * lưu toạ độ**. Gọi `useController` cho bốn trường ghim ngay trong `AddressField` sẽ nổ ở những
 * form không khai chúng (sổ khách), mà hook thì không gọi có điều kiện được.
 */
function AddressLocationSection<T extends FieldValues>({
  control,
  addressLineName,
  pin,
  provinceCode,
  locationContext,
  clearPin,
  required,
  disabled,
}: {
  control: Control<T>;
  addressLineName: Path<T>;
  pin: AddressPinNames<T>;
  provinceCode: string;
  locationContext: string;
  /** Lần dựng này đến từ một cú ĐỔI TỈNH — xem `pinResetKey` ở `AddressField`. */
  clearPin: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
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
   * Chữ dùng để HỎI bản đồ, khác chữ trong ô nhập.
   *
   * Ghép thêm xã và tỉnh vì `"12 Nguyễn Huệ"` là tên đường có ở hàng chục tỉnh — hỏi trống không
   * thì gợi ý đầu tiên gần như luôn rơi vào TP.HCM. Ngữ cảnh lấy từ danh mục ĐANG CHỌN, nên gợi
   * ý bám theo lựa chọn hành chính của người dùng chứ không ngược lại.
   */
  const placeQuery = line.trim()
    ? `${line.trim()}${locationContext ? `, ${locationContext}` : ''}`
    : '';
  const suggestions = usePlaceSearch(placeQuery, {
    biasPoint: point,
    // Chưa chọn tỉnh thì không hỏi: gợi ý lúc đó rải khắp cả nước và chẳng giúp được ai, trong
    // khi mỗi lượt hỏi là một request có tính tiền.
    enabled: !disabled && Boolean(provinceCode),
  });
  const placeDetail = usePlaceDetail();
  const reverse = useReverseGeocode();

  /** Tỉnh bản đồ đoán khác tỉnh người dùng đã chọn — hiện lời nhắc, KHÔNG tự sửa. */
  const [provinceMismatch, setProvinceMismatch] = useState(false);
  /** Địa chỉ chữ của cái ghim hiện tại, để người dùng đọc lại "chỗ này là đâu". */
  const [pinAddress, setPinAddress] = useState<string | null>(null);

  const setPoint = (next: GeoPoint | null, source: string | null) => {
    latitude.field.onChange((next?.lat ?? null) as PathValue<T, Path<T>>);
    longitude.field.onChange((next?.lng ?? null) as PathValue<T, Path<T>>);
    locationSource.field.onChange((source ?? null) as PathValue<T, Path<T>>);
  };

  const onPickSuggestion = async (id: string) => {
    const result = await placeDetail.mutateAsync(id).catch(() => null);
    const place = result?.place;
    if (!place) return;

    placeId.field.onChange(place.placeId as PathValue<T, Path<T>>);
    setPoint(
      { lat: Number(place.latitude), lng: Number(place.longitude) },
      LOCATION_SOURCE.GOOGLE_PLACE,
    );
    setPinAddress(place.formattedAddress ?? null);
    // Chỉ điền phần "số nhà, đường" mà bản đồ tách ra — KHÔNG dán nguyên chuỗi đầy đủ vào ô, vì
    // chuỗi đó còn chứa tên quận/phường CŨ và sẽ bị ghép thêm một lần nữa lúc lưu.
    if (place.suggestedAddressLine) {
      addressLine.field.onChange(place.suggestedAddressLine as PathValue<T, Path<T>>);
    }
    setProvinceMismatch(
      Boolean(place.suggestedProvinceCode) && place.suggestedProvinceCode !== provinceCode,
    );
  };

  const onMovePin = (next: GeoPoint) => {
    setPoint(next, LOCATION_SOURCE.MAP_PIN);
    // Ghim tự đặt thì `placeId` cũ không còn mô tả đúng chỗ này nữa — giữ lại là nói dối về
    // nguồn gốc của toạ độ.
    placeId.field.onChange(null as PathValue<T, Path<T>>);
    setProvinceMismatch(false);
    void reverse
      .mutateAsync(next)
      .then((r) => setPinAddress(r.place?.formattedAddress ?? null))
      .catch(() => setPinAddress(null));
  };

  /*
   * Đổi tỉnh ⇒ ghim cũ nằm ở tỉnh khác. Bỏ nó thay vì mang theo một toạ độ chắc chắn sai.
   *
   * `key` ở nơi gọi đã dựng lại component này, nên state CỤC BỘ (`pinAddress`,
   * `provinceMismatch`) sạch sẵn — ở đây chỉ còn bốn trường ghim trong FORM, thứ sống ngoài
   * vòng đời component và không được remount dọn hộ. Effect chạy đúng một lần lúc dựng và
   * không đụng state React nào, nên nó không tạo thêm vòng render.
   */
  useEffect(() => {
    if (!clearPin) return;
    setPoint(null, null);
    placeId.field.onChange(null as PathValue<T, Path<T>>);
    // Chạy MỘT LẦN cho mỗi lần dựng: `clearPin` cố định trong suốt vòng đời của instance này,
    // và các `field` của RHF đổi định danh mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const source = locationSource.field.value as string | null;
  const needsPinCheck = point != null && source !== LOCATION_SOURCE.MAP_PIN;

  return (
    <>
      <Form.Item
        label={t('addressLineLabel')}
        htmlFor={inputId}
        required={required}
        validateStatus={addressLine.fieldState.error ? 'error' : ''}
        help={addressLine.fieldState.error?.message}
        className={fieldStyles.item}
      >
        <AutoComplete
          id={inputId}
          value={line}
          disabled={disabled}
          onChange={(value: string) => addressLine.field.onChange(value as PathValue<T, Path<T>>)}
          onBlur={addressLine.field.onBlur}
          onSelect={(value: string) => void onPickSuggestion(value)}
          placeholder={t('addressLinePlaceholder')}
          // Lọc phía client TẮT: danh sách đến từ bản đồ theo đúng chữ vừa gõ, lọc lần nữa sẽ
          // giấu mất chính kết quả vừa tìm được.
          filterOption={false}
          notFoundContent={
            suggestions.isFetching ? (
              <Spin size="small" />
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

      {provinceMismatch ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          title={t('provinceMismatchTitle')}
          description={t('provinceMismatchHint')}
        />
      ) : null}

      {needsPinCheck ? (
        <Alert type="info" showIcon className={styles.alert} title={t('pinNeedsCheck')} />
      ) : null}

      <MapPinPicker value={point} onChange={onMovePin} label={t('mapLabel')} disabled={disabled} />

      {pinAddress ? (
        <p className={styles.pinAddress}>{t('pinAt', { address: pinAddress })}</p>
      ) : null}
      {!point && provinceCode ? <p className={styles.pinAddress}>{t('noPinYet')}</p> : null}
    </>
  );
}
