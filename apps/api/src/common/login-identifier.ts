import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import {
  detectLoginIdentifierKind,
  isValidLoginIdentifier,
  LOGIN_IDENTIFIER_KIND,
} from '@xeprime/types';

/**
 * Ô "Email hoặc số điện thoại" ở `POST /auth/login` và `POST /auth/mobile/login`.
 *
 * Luật nằm ở `@xeprime/types` — cùng một hàm mà yup của web/app native gọi (`@xeprime/validators`)
 * — nên ba client không thể lệch nhau về tập giá trị được nhận. Lớp yup chỉ báo sớm cho người
 * dùng; lớp này mới là lớp chặn thật (CLAUDE.md mục 4).
 *
 * Trước đó ô này chỉ có `@MinLength(1)`: mọi chuỗi rác đều đi thẳng vào `WHERE phone = ...` rồi
 * quay về `INVALID_CREDENTIALS` — cùng một câu với "sai mật khẩu", nên người gõ nhầm địa chỉ
 * email không có cách nào biết mình gõ nhầm.
 */
function messageFor(value: unknown): string {
  if (typeof value !== 'string') return 'Vui lòng nhập email hoặc số điện thoại';
  switch (detectLoginIdentifierKind(value)) {
    case LOGIN_IDENTIFIER_KIND.EMAIL:
      return 'Email không hợp lệ';
    case LOGIN_IDENTIFIER_KIND.PHONE:
      return 'Số điện thoại không hợp lệ';
    default:
      return 'Nhập email (vd ban@congty.vn) hoặc số điện thoại (vd 0901234567)';
  }
}

/** Decorator DTO: chặn định danh đăng nhập sai định dạng ngay ở mép vào (400 chỉ đúng ô sai). */
export function IsLoginIdentifier(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLoginIdentifier',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidLoginIdentifier(value),
        defaultMessage: (args?: ValidationArguments) => messageFor(args?.value),
      },
    });
  };
}
