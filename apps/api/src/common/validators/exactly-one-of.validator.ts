import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Body phải mang ĐÚNG MỘT trong các khoá `keys` — "có mặt" là khác `undefined` (một `null` gửi
 * tường minh vẫn tính là có mặt, vì nó mang nghĩa: `driverId: null` là BỎ GÁN).
 *
 * Gắn lên MỘT thuộc tính của nhóm, và thuộc tính đó phải được kiểm cả khi vắng mặt (không
 * `@IsOptional`; nếu có `@ValidateIf` thì điều kiện phải bật khi các khoá còn lại cũng vắng) — nếu
 * không, body rỗng lọt qua. Dùng cho các endpoint nhận một trong vài hình dạng loại trừ nhau.
 */
export function ExactlyOneOf(keys: readonly string[], options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'exactlyOneOf',
      target: object.constructor,
      propertyName,
      constraints: [keys],
      options: {
        message: `Gửi đúng một trong: ${keys.join(', ')}`,
        ...options,
      },
      validator: {
        validate: (_value: unknown, args: ValidationArguments) => {
          const body = args.object as Record<string, unknown>;
          return keys.filter((key) => body[key] !== undefined).length === 1;
        },
      },
    });
  };
}
