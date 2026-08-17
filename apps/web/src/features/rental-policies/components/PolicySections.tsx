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
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { formatMoneyVnd } from '@/lib/money';
import { deliverySummaryText } from '../form';
import type { PolicyFormValues } from '../schema';

import styles from './PolicySections.module.css';

interface PolicySectionsProps {
  control: Control<PolicyFormValues>;
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
export function PolicySections({ control, depositHint, numbered = true }: PolicySectionsProps) {
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
        title={n(4, 'Ưu đãi thuê dài hạn theo tháng')}
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
}: {
  control: Control<PolicyFormValues>;
  title: string;
}) {
  const enabled = useWatch({ control, name: 'discountEnabled' });
  const { errors } = useFormState({ control, name: 'discountTiers' });
  const { fields, append, remove } = useFieldArray({ control, name: 'discountTiers' });

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
              <span>Thuê từ (tháng)</span>
              <span>Mức giảm (%)</span>
              <span>Ghi chú</span>
              <span className={styles.tierActionHead}>Thao tác</span>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className={styles.discountRow}>
                <NumberField
                  control={control}
                  name={`discountTiers.${index}.minMonths`}
                  label={`Số tháng tối thiểu của mốc ${index + 1}`}
                  addonAfter="tháng"
                  min={1}
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
              onClick={() => append({ minMonths: null, percent: null, note: '' })}
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
            message="Ưu đãi này CHỈ áp dụng cho dịch vụ THUÊ DÀI HẠN (gói 1 tháng, 3 tháng…) — thuê ngắn theo ngày không được giảm. Mức giảm tính trên tiền thuê cơ bản; không áp lên tiền cọc, phí giao nhận, phí quá giờ hay phụ phí khác."
          />
          <div className={styles.previewCard}>
            <span className={styles.previewTitle}>Công thức tính giá thuê thực tế:</span>
            <span className={styles.previewText}>
              tiền_thuê_sau_giảm = tiền_thuê_cơ_bản − (tiền_thuê_cơ_bản × phần_trăm_giảm)
            </span>
          </div>
        </>
      ) : (
        <p className={styles.disabledNote}>Đang tắt — mọi lượt đặt tính nguyên giá thuê cơ bản.</p>
      )}
    </section>
  );
}
