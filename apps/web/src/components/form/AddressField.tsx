'use client';

import { Alert, Button, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';
import { provinceCenter } from '@xeprime/domain';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import {
  ConfirmedPlaceField,
  type AddressPinNames,
} from '@/components/form/ConfirmedPlaceField';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useWardOptions } from '@/features/locations/hooks/use-wards';
import { readRememberedProvince, rememberProvince } from '@/lib/province-memory';
import styles from './AddressField.module.css';

/**
 * Thu phóng khi bản đồ mở ở TÂM MỘT TỈNH — rộng hơn hẳn mức mặc định "một phường".
 *
 * Tâm tỉnh là một điểm neo, không phải một phỏng đoán về chỗ người dùng muốn tới. Mở ở mức
 * phường tại đó là trình ra một khu phố ngẫu nhiên và bắt họ thu nhỏ lại trước khi làm được gì;
 * mức này cho thấy hình dạng của cả vùng để họ phóng vào đúng hướng.
 */
const PROVINCE_ZOOM = 11;

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
 * Tên bốn trường GHIM — định nghĩa ở `ConfirmedPlaceField`, nơi chúng thật sự được đọc và ghi.
 * Xuất lại ở đây để nơi gọi cũ không phải đổi đường import.
 */
export type { AddressPinNames };

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
   * Tỉnh/thành có bắt buộc riêng không. Bỏ trống = theo `required`.
   *
   * Cần một prop riêng vì có form mà tỉnh bắt buộc trong khi xã và số nhà thì không: đăng ký
   * người cho thuê xe (`registerShopSchema`) đòi tỉnh ở CẢ HAI tuyến — chi nhánh mặc định sinh ra
   * từ nó — nhưng chỉ tuyến GÓI mới đòi xã + số nhà (ADR 0040). Thiếu prop này thì ô tỉnh của
   * tuyến hoa hồng không có dấu sao mà vẫn báo `provinceRequired` khi bấm Lưu, tức là dấu sao
   * đang nói sai về schema.
   */
  provinceRequired?: boolean;
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
  /**
   * Điền sẵn tỉnh/thành mà người dùng đã CHỌN gần nhất ở nơi khác (thanh tìm xe, một form địa
   * chỉ trước đó) khi ô đang trống.
   *
   * Mặc định TẮT, và mặc định đó là có chủ ý. Chỉ form TẠO MỚI mới bật: ở đó ô trống nghĩa là
   * "chưa ai khai", nên điền sẵn là tiết kiệm một thao tác. Ở form SỬA, ô trống nghĩa là bản
   * ghi này KHÔNG có tỉnh — thường là dữ liệu có từ trước danh mục hành chính (ADR 0035 điều 7)
   * — và điền vào đó tỉnh mà người dùng vừa tìm xe sẽ dời địa chỉ một chi nhánh có thật sang
   * tỉnh khác, âm thầm, chỉ vì họ bấm Lưu.
   */
  prefillRememberedProvince?: boolean;
}

/**
 * Ô nhập ĐỊA CHỈ VẬT LÝ — ba bước, đúng thứ tự mà dữ liệu Việt Nam cho phép.
 *
 * 1. **Tỉnh/thành** và 2. **xã/phường/đặc khu** chọn từ DANH MỤC NHÀ NƯỚC (mô hình hai cấp, hiệu
 *    lực 01/07/2025 — không có quận/huyện). Cả hai đều có ô tìm; danh mục cấp xã lọc ở server
 *    theo khoá đã bỏ dấu nên gõ `"ba dinh"` ra `"Phường Ba Đình"`.
 * 3. **Số nhà, đường** thì GÕ, và phải được BẢN ĐỒ XÁC NHẬN — chọn một gợi ý, hoặc tự đặt ghim.
 *    Kỷ luật đó sống ở `ConfirmedPlaceField`, cùng một bản dùng chung với luồng đặt xe của khách.
 *    Không danh mục nhà nước nào phát hành số nhà và tên đường, nên ép chọn từ một dropdown danh
 *    mục là bịa ra một danh mục không tồn tại — nhưng gõ tự do thì để lại một địa chỉ không có
 *    toạ độ, và mọi phép tính quãng đường phía sau đo từ toạ độ.
 *
 * Phần hành chính và phần toạ độ là HAI ĐƯỜNG ĐỘC LẬP: chọn một gợi ý KHÔNG tự đổi tỉnh đã chọn —
 * nó chỉ hiện một lời nhắc nếu hai bên không khớp, và người dùng là người chốt. Lý do nằm ở dữ
 * liệu: nhà cung cấp bản đồ còn dùng tên đơn vị hành chính TRƯỚC sắp xếp 01/07/2025.
 *
 * **Ô này là của CHỦ XE khai địa chỉ vận hành.** Khách thuê xe dùng `RenterAddressBlock` — cùng ô
 * địa chỉ, nhưng không có hai bộ chọn hành chính, vì họ không biết mình sẽ nhận xe ở phường nào.
 */
export function AddressField<T extends FieldValues>({
  control,
  names,
  pin,
  title,
  required,
  provinceRequired = required,
  wardRequired = required,
  disabled,
  notice,
  prefillRememberedProvince = false,
}: AddressFieldProps<T>) {
  const t = useTranslations('Address');
  const tc = useTranslations('Common');

  const province = useController({ control, name: names.provinceCode });
  const ward = useController({ control, name: names.wardCode });

  const provinceCode = (province.field.value as string | null) ?? '';

  const provinces = useProvinceOptions();
  const [wardSearch, setWardSearch] = useState('');
  /*
   * Ô có GHIM thì không hỏi danh mục cấp xã: bộ chọn đó không được dựng (xem phần render), và
   * tải 168 dòng cho một ô không tồn tại là một request cho mỗi lần mở form, mỗi người dùng.
   * Truyền mã tỉnh rỗng là cách TẮT có sẵn của hook — nó đã dừng khi chưa chọn tỉnh.
   */
  const wards = useWardOptions(pin ? '' : provinceCode, wardSearch);

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
  /** Tỉnh bản đồ đoán khác tỉnh người dùng đã chọn — hiện lời nhắc, KHÔNG tự sửa. */
  const [provinceMismatch, setProvinceMismatch] = useState(false);
  const onProvinceChange = (next: string) => {
    ward.field.onChange('' as PathValue<T, Path<T>>);
    setWardSearch('');
    setPinResetKey((n) => n + 1);
    // Lời nhắc cũ nói về cặp (địa điểm, tỉnh) vừa bị thay — để lại là một cảnh báo về chuyện đã
    // không còn.
    setProvinceMismatch(false);
    /*
     * Ghi bộ nhớ ở TRÌNH XỬ LÝ SỰ KIỆN — đây là một lựa chọn chủ động của người dùng, thứ duy
     * nhất được phép đi vào `province-memory`. Điền sẵn ở effect bên dưới cố ý KHÔNG ghi ngược
     * lại: nếu có, một gợi ý sẽ tự đóng dấu thành "người dùng đã chọn" và không bao giờ hết hạn.
     */
    rememberProvince(next);
  };

  /*
   * Điền sẵn tỉnh đã nhớ — MỘT LẦN, sau khi mount, và chỉ khi ô đang trống.
   *
   * Trong effect chứ không trong `defaultValues`: `localStorage` không tồn tại trên server, nên
   * đọc nó lúc render sẽ cho hai kết quả khác nhau giữa HTML server dựng và lần render đầu ở
   * client. Điều kiện "đang trống" đọc trong thân effect chứ không ở mảng phụ thuộc, để lần điền
   * này không bao giờ đè lên thứ người dùng vừa gõ.
   */
  const prefilledProvince = useRef(false);
  useEffect(() => {
    if (!prefillRememberedProvince || prefilledProvince.current) return;
    /*
     * Đợi DANH MỤC về rồi mới quyết, và chỉ điền mã có TRONG danh mục đó.
     *
     * Bộ nhớ tỉnh dùng chung cho cả thanh tìm xe lẫn các form địa chỉ, nhưng hai bên đọc hai danh
     * mục khác nhau: thanh tìm xe lấy tỉnh ĐANG CÓ XE (`/public/destinations`), còn ô này lấy
     * tỉnh đang MỞ ĐĂNG KÝ (`/provinces`). Không danh mục nào chứa trọn danh mục kia — một tỉnh
     * có xe trên chợ vẫn có thể bị admin tắt đăng ký mới.
     *
     * Điền một mã không có trong `options` thì AntD dựng ô chọn với một giá trị nó không tra ra
     * nhãn: người dùng nhìn thấy ô trống trong khi form đang mang mã đó, rồi bấm Lưu và không
     * hiểu vì sao hỏng. Tra được thì mới điền; không thì để trống và họ tự chọn.
     */
    if (provinces.isLoading) return;
    prefilledProvince.current = true;
    if (province.field.value) return;
    const remembered = readRememberedProvince();
    if (!remembered || !provinces.options.some((o) => o.value === remembered)) return;
    province.field.onChange(remembered as PathValue<T, Path<T>>);
    // Chạy lại khi danh mục đổi trạng thái; `prefilledProvince` giữ cho nó chỉ điền ĐÚNG MỘT lần.
    // `field` của RHF đổi định danh mỗi render nên không đưa vào mảng phụ thuộc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillRememberedProvince, provinces.isLoading, provinces.options]);

  /*
   * Ở đây từng có một `locationContext` ghép tên xã + tên tỉnh vào sau chữ người dùng gõ trước
   * khi hỏi bản đồ. Nó bị bỏ vì phản tác dụng — xem `placeQuery` ở `ConfirmedPlaceField`. Việc
   * khoanh vùng do điểm neo (`anchor`) lo, và nó khoanh bằng TOẠ ĐỘ chứ không bằng chữ.
   */

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
        required={provinceRequired}
        onAfterChange={(next) => onProvinceChange(typeof next === 'string' ? next : '')}
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

      {/*
        Xã/phường CHỈ hỏi khi ô này KHÔNG lưu toạ độ (ADR 0042).

        Có ghim thì mã xã là một câu hỏi thừa và đắt: toạ độ đã xác nhận định vị chính xác hơn
        hẳn một mã năm chữ số, trong khi danh mục cấp xã có 3.321 đơn vị vừa đổi tên hàng loạt từ
        01/07/2025 — đủ để một người đang khai địa chỉ của chính mình cũng phải dừng lại tra cứu.

        Không ghim (sổ khách) thì ngược lại: mã xã là cấp định vị DUY NHẤT dưới tỉnh, nên nó ở
        lại. Đó cũng là lý do `wardCode` vẫn nằm trong `AddressFieldNames` chứ không bị gỡ.
      */}
      {pin ? null : (
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
            <Alert
              type="warning"
              showIcon
              className={styles.alert}
              title={t('provinceMismatchTitle')}
              description={t('provinceMismatchHint')}
            />
          ) : null}
          <ConfirmedPlaceField
            key={pinResetKey}
            clearOnMount={pinResetKey > 0}
            control={control}
            addressLineName={names.addressLine}
            pin={pin}
            label={t('addressLineLabel')}
            placeholder={t('addressLinePlaceholder')}
            /*
             * Neo vào TÂM TỈNH đang chọn. Thiếu nó thì mọi form địa chỉ trong sản phẩm mở bản đồ
             * ở cùng một chỗ giữa Đà Nẵng — kể cả khi người dùng vừa chọn Bắc Ninh ngay phía
             * trên. Tham chiếu ổn định theo mã tỉnh (bảng hằng ở `@xeprime/domain`), nên truyền
             * thẳng xuống không làm bản đồ dời khung nhìn ở mỗi lần render.
             */
            anchor={provinceCenter(provinceCode)}
            anchorZoom={PROVINCE_ZOOM}
            // Chưa chọn tỉnh thì chưa hỏi bản đồ: gợi ý lúc đó rải khắp cả nước và chẳng giúp
            // được ai, trong khi mỗi lượt hỏi là một request có tính tiền.
            searchEnabled={Boolean(provinceCode)}
            required={required}
            disabled={disabled}
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
          required={required}
          disabled={disabled}
        />
      )}
    </section>
  );
}

