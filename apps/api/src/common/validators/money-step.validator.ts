import { isThousandStep, MONEY_STEP_VND } from '@xeprime/types';
import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Số tiền phải là BỘI của bước giá 1.000đ (ADR 0064) — cho mọi số tiền CẤU HÌNH có thể đi tới mã
 * QR hoặc tổng khách trả: giá xe (ngày, cuối tuần, tháng, có tài xế theo lộ trình, giờ, giá riêng
 * theo ngày), bậc phí giao xe (trọn gói và theo km), mã khuyến mãi (giảm tiền cố định, trần giảm).
 *
 * Vì sao chặn ở mép vào chứ không làm tròn hộ: phép tính chỉ làm tròn phần nó CHIA TỶ LỆ, còn số
 * cấu hình đi thẳng vào tiền. Một giá ngày 333.333đ là một số lẻ trên mọi đơn của chiếc xe đó —
 * và lặng lẽ làm tròn nó thành 333.000đ là đổi giá của chủ xe mà họ không biết.
 *
 * Chỉ kiểm khi CÓ giá trị: `null`/`undefined` là việc của `@IsOptional`/`@ValidateIf` đứng cạnh.
 * Đặt SAU decorator kiểm hình dạng (`@Matches(MONEY_PATTERN)`) để chuỗi rác nhận câu lỗi hình dạng.
 */
export function IsMoneyStep(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMoneyStep',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} phải là bội của ${MONEY_STEP_VND.toLocaleString('vi-VN')}đ`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          value == null ||
          ((typeof value === 'string' || typeof value === 'number') && isThousandStep(value)),
      },
    });
  };
}
