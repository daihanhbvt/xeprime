'use client';

import { CheckCircleOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import type { ReactNode } from 'react';
import {
  useFieldArray,
  useFormState,
  useWatch,
  type Control,
  type FieldErrors,
} from 'react-hook-form';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { LONG_TERM_PACKAGE_MONTHS, longTermPackageLabel } from '@xeprime/types';
import { formatMoneyVnd } from '@/lib/money';
import { deliverySummaryText } from '../form';
import type { PolicyFormValues } from '../schema';

import styles from './PolicySections.module.css';

/**
 * Mốc cũ chỉ để CẢNH BÁO nên component đọc đúng hai trường nó cần — nhận thẳng shape sinh từ
 * OpenAPI (`note` có thể null) mà không phải ép kiểu ở mọi nơi gọi.
 */
type LegacyTierView = { minDays: number; percent: number };

interface PolicySectionsProps {
  control: Control<PolicyFormValues>;
  /**
   * Mốc ưu đãi CŨ theo ngày còn sót trong dữ liệu, không quy đổi được sang gói nào (ADR 0011).
   * Chỉ để cảnh báo — máy giá đã bỏ qua chúng, và lưu lại chính sách là chúng biến mất.
   */
  legacyDiscountTiers?: readonly LegacyTierView[];
  /** Gợi ý cạnh ô cọc (vd "12 xe đang dùng mức cọc này") — chỉ trang shop có số liệu này. */
  depositHint?: ReactNode;
  /** Đánh số tiêu đề "1. … 4." như màn chính sách shop; màn theo xe để trơn. */
  numbered?: boolean;
}

/**
 * Bốn khối cấu hình chính sách thuê (Figma `237:1557` desktop / `247:1554` mobile) — dùng
 * CHUNG cho chính sách mặc định gian hàng và bản ghi đè theo xe: một bộ nhãn, một bộ
 * validation, không thể lệch câu chữ giữa hai màn.
 *
 * Chỉ là FORM: không gọi API, không đọc quyền. Ràng buộc chéo (bậc tăng dần, bán kính khớp
 * mốc cuối) nằm ở `schema.ts`; chốt thật ở backend.
 */
export function PolicySections({
  control,
  depositHint,
  legacyDiscountTiers,
  numbered = true,
}: PolicySectionsProps) {
  const n = (index: number, title: string) => (numbered ? `${index}. ${title}` : title);

  return (
    <div className={styles.stack}>
      <DepositSection
        control={control}
        title={n(1, 'Yêu cầu đặt cọc thế chấp (Bảo đảm)')}
        hint={depositHint}
      />
      <DeliverySection control={control} title={n(2, 'Dịch vụ giao nhận xe tận nơi')} />
      <OvertimeSection control={control} title={n(3, 'Phí trả xe quá giờ thỏa thuận')} />
      <DiscountSection
        control={control}
        title={n(4, 'Ưu đãi cam kết thời hạn (thuê dài hạn)')}
        legacyTiers={legacyDiscountTiers}
      />
    </div>
  );
}

function DepositSection({
  control,
  title,
  hint,
}: {
  control: Control<PolicyFormValues>;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <div className={styles.depositRow}>
        <div className={styles.inputNarrow}>
          <NumberField
            control={control}
            name="depositAmount"
            label="Số tiền cọc mặc định"
            money
            required
            min={0}
          />
        </div>
        {hint ? <div className={styles.depositHint}>{hint}</div> : null}
      </div>
      <p className={styles.note}>
        Cọc thế chấp là số tiền cố định bằng VND, không nằm trong doanh thu thuê và không chịu chiết
        khấu giảm giá. Thay đổi cấu hình này áp dụng từ các lượt đặt xe mới, không ảnh hưởng đến các
        booking cũ đã chốt cọc.
      </p>
    </section>
  );
}

function DeliverySection({
  control,
  title,
}: {
  control: Control<PolicyFormValues>;
  title: string;
}) {
  const enabled = useWatch({ control, name: 'deliveryEnabled' });
  const tiers = useWatch({ control, name: 'deliveryTiers' }) ?? [];
  const radius = useWatch({ control, name: 'deliveryMaxRadiusKm' });
  const { errors } = useFormState({ control, name: ['deliveryTiers', 'deliveryMaxRadiusKm'] });
  const { fields, append, remove } = useFieldArray({ control, name: 'deliveryTiers' });

  const tierErrors = errors.deliveryTiers as
    | (FieldErrors<PolicyFormValues>['deliveryTiers'] & {
        root?: { message?: string };
        message?: string;
      })
    | undefined;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;
  const tiersComplete = tiers.length > 0 && tiers.every((t) => t?.toKm != null) && radius != null;

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <SwitchField
          control={control}
          name="deliveryEnabled"
          label={enabled ? 'Đang bật' : 'Đang tắt'}
        />
      </div>
      <p className={styles.desc}>
        Tính phí hỗ trợ theo khoảng cách một chiều thực tế từ vị trí gian hàng đến điểm giao xe
        khách yêu cầu.
      </p>

      {enabled ? (
        <>
          <div className={styles.tierTable} role="group" aria-label="Bậc phí giao nhận">
            <div className={styles.tierHead}>
              <span>Khoảng cách từ (km)</span>
              <span>Khoảng cách đến (km)</span>
              <span>Phí áp dụng (VND)</span>
              <span className={styles.tierActionHead}>Thao tác</span>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className={styles.tierRow}>
                {/* Mốc "từ" suy từ bậc trước — read-only theo cấu trúc nên KHÔNG THỂ hở khoảng. */}
                <span className={styles.tierFrom}>
                  {index === 0 ? '0 km' : `> ${tiers[index - 1]?.toKm ?? '—'} km`}
                </span>
                <NumberField
                  control={control}
                  name={`deliveryTiers.${index}.toKm`}
                  label={`Mốc đến của bậc ${index + 1} (km)`}
                  addonAfter="km"
                  min={0}
                />
                <NumberField
                  control={control}
                  name={`deliveryTiers.${index}.fee`}
                  label={`Phí của bậc ${index + 1}`}
                  money
                  help={
                    tiers[index]?.fee === 0 || tiers[index]?.fee == null ? 'Miễn phí' : undefined
                  }
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined aria-hidden />}
                  aria-label={`Xóa bậc ${index + 1}`}
                  onClick={() => remove(index)}
                >
                  Xóa
                </Button>
              </div>
            ))}
          </div>

          <div className={styles.tierFooter}>
            <Button
              icon={<PlusOutlined aria-hidden />}
              onClick={() => append({ toKm: null, fee: null })}
            >
              Thêm khoảng cách
            </Button>
            {crossError ? (
              <span className={styles.tierError} role="alert">
                ⚠ {crossError}
              </span>
            ) : tiersComplete ? (
              <span className={styles.tierOk}>
                <CheckCircleOutlined aria-hidden /> Không có khoảng trống hoặc chồng lấn
              </span>
            ) : null}
          </div>

          <div className={styles.radiusRow}>
            <div className={styles.inputNarrow}>
              <NumberField
                control={control}
                name="deliveryMaxRadiusKm"
                label="Bán kính hỗ trợ tối đa tự giao"
                addonAfter="km"
                min={0}
                required
              />
            </div>
            <Alert
              className={styles.radiusWarning}
              type="warning"
              showIcon
              message='Ngoài bán kính này, khách thấy trạng thái "Liên hệ chủ xe" và yêu cầu sẽ chờ shop báo giá giao nhận thủ công trong hộp thư đặt xe.'
            />
          </div>

          {tiersComplete ? (
            <div className={styles.previewCard}>
              <span className={styles.previewTitle}>Tóm tắt cấu hình hiển thị với khách đặt:</span>
              <span className={styles.previewText}>
                {deliverySummaryText({ deliveryTiers: tiers, deliveryMaxRadiusKm: radius })}
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.disabledNote}>
          Đang tắt — khách không thể yêu cầu giao xe tận nơi khi đặt.
        </p>
      )}
    </section>
  );
}

function OvertimeSection({
  control,
  title,
}: {
  control: Control<PolicyFormValues>;
  title: string;
}) {
  const fee = useWatch({ control, name: 'overtimeFeePerHour' });

  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <div className={styles.fieldRow}>
        <NumberField
          control={control}
          name="overtimeFeePerHour"
          label="Phí mỗi giờ phát sinh"
          money
          addonAfter="đ / giờ"
          placeholder="Cần cấu hình"
        />
        <NumberField
          control={control}
          name="overtimeGraceMinutes"
          label="Thời gian trễ miễn phí tối đa"
          addonAfter="phút"
          min={0}
          placeholder="Cần cấu hình"
        />
        <NumberField
          control={control}
          name="overtimeRoundingMinutes"
          label="Đơn vị làm tròn tối thiểu"
          addonAfter="phút"
          min={1}
          placeholder="Cần cấu hình"
        />
      </div>
      <div className={styles.previewCard}>
        <span className={styles.previewTitle}>Công thức tính phí phạt trễ hạn tự động:</span>
        <span className={styles.previewText}>
          {fee != null
            ? `Phí quá giờ = (số giờ trễ thực tế) × ${formatMoneyVnd(String(fee))}. Tính ở bước bàn trả xe.`
            : 'Chưa cấu hình phí mỗi giờ — phí quá giờ sẽ thoả thuận thủ công ở bước bàn trả xe.'}
        </span>
      </div>
      <p className={styles.footnote}>
        * Việc điều chỉnh thủ công phí quá giờ do sự cố đột xuất hoặc lý do bất khả kháng thuộc quy
        trình trả xe thực tế, không cấu hình tại đây.
      </p>
    </section>
  );
}

function DiscountSection({
  control,
  title,
  legacyTiers,
}: {
  control: Control<PolicyFormValues>;
  title: string;
  legacyTiers?: readonly LegacyTierView[];
}) {
  const enabled = useWatch({ control, name: 'discountEnabled' });
  const tiers = useWatch({ control, name: 'discountTiers' }) ?? [];
  const { errors } = useFormState({ control, name: 'discountTiers' });
  const { fields, append, remove } = useFieldArray({ control, name: 'discountTiers' });

  /*
   * Mốc là một GÓI THUÊ, không phải số tháng tự do: gói 4 hay 5 tháng không tồn tại nên mốc ở
   * đó cũng vô nghĩa. Mỗi ô chỉ liệt kê gói CHƯA dùng ở mốc khác (cộng gói của chính nó) — trùng
   * mốc trở thành không chọn được, thay vì để người dùng gõ rồi mới bị báo lỗi.
   */
  const optionsFor = (index: number) =>
    LONG_TERM_PACKAGE_MONTHS.filter(
      (m) => m === tiers[index]?.minMonths || !tiers.some((t) => t?.minMonths === m),
    ).map((m) => ({ value: String(m), label: longTermPackageLabel(m) }));
  const nextUnusedMonths =
    LONG_TERM_PACKAGE_MONTHS.find((m) => !tiers.some((t) => t?.minMonths === m)) ?? null;

  const tierErrors = errors.discountTiers as
    { root?: { message?: string }; message?: string } | undefined;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <SwitchField
          control={control}
          name="discountEnabled"
          label={enabled ? 'Đang bật' : 'Đang tắt'}
        />
      </div>

      {enabled ? (
        <>
          <div className={styles.tierTable} role="group" aria-label="Mốc ưu đãi thuê dài hạn">
            <div className={styles.discountHead}>
              <span>Gói thuê từ</span>
              <span>Mức giảm (%)</span>
              <span>Ghi chú</span>
              <span className={styles.tierActionHead}>Thao tác</span>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className={styles.discountRow}>
                <SelectField
                  control={control}
                  name={`discountTiers.${index}.minMonths`}
                  label={`Mốc gói của bậc ${index + 1}`}
                  options={optionsFor(index)}
                  placeholder="Chọn gói"
                />
                <NumberField
                  control={control}
                  name={`discountTiers.${index}.percent`}
                  label={`Mức giảm của mốc ${index + 1}`}
                  percent
                />
                <TextField
                  control={control}
                  name={`discountTiers.${index}.note`}
                  label={`Ghi chú mốc ${index + 1}`}
                  placeholder="Ưu đãi gói 3 tháng…"
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined aria-hidden />}
                  aria-label={`Xóa mốc ưu đãi ${index + 1}`}
                  onClick={() => remove(index)}
                >
                  Xóa
                </Button>
              </div>
            ))}
          </div>

          <div className={styles.tierFooter}>
            <Button
              icon={<PlusOutlined aria-hidden />}
              disabled={nextUnusedMonths == null}
              onClick={() => append({ minMonths: nextUnusedMonths, percent: null, note: '' })}
            >
              Thêm mốc ưu đãi
            </Button>
            {crossError ? (
              <span className={styles.tierError} role="alert">
                ⚠ {crossError}
              </span>
            ) : null}
          </div>

          <Alert
            type="info"
            showIcon
            message="Ưu đãi này CHỈ áp dụng cho dịch vụ THUÊ DÀI HẠN — thuê tự lái/có tài xế theo ngày không được giảm. Khách mua gói nào thì hưởng mốc CAO NHẤT mà gói đó đạt tới, không cộng dồn: gói 2 tháng hưởng mốc 1 tháng, gói 9 và 12 tháng hưởng mốc 6 tháng nếu không có mốc cao hơn."
          />
          {legacyTiers?.length ? (
            <Alert
              type="warning"
              showIcon
              message={`${legacyTiers.length} mốc ưu đãi cũ theo NGÀY chưa quy đổi được sang gói`}
              description={
                <>
                  <span>
                    {legacyTiers.map((t) => `từ ${t.minDays} ngày giảm ${t.percent}%`).join(' · ')}
                  </span>
                  <br />
                  <span>
                    Các mốc này KHÔNG còn được tính giá. Chọn lại mốc theo gói ở bảng trên rồi lưu —
                    hệ thống cố ý không tự quy đổi để không đổi giá sau lưng bạn.
                  </span>
                </>
              }
            />
          ) : null}
          <div className={styles.previewCard}>
            <span className={styles.previewTitle}>Công thức tính giá gói:</span>
            <span className={styles.previewText}>
              giá_gói = giá_tháng × số_tháng − (giá_tháng × số_tháng × phần_trăm_giảm)
            </span>
          </div>
        </>
      ) : (
        <p className={styles.disabledNote}>Đang tắt — mọi lượt đặt tính nguyên giá thuê cơ bản.</p>
      )}
    </section>
  );
}
