import { BadRequestException } from '@nestjs/common';
import {
  API_ERROR_CODE,
  DEFAULT_LOCALE,
  isPaymentGatewayProvider,
  LOCALE_COOKIE_NAME,
  PAYMENT_GATEWAY_CLIENT,
  PAYMENT_GATEWAY_CLIENT_VALUES,
  SUPPORTED_LOCALES,
  type AppLocale,
  type PaymentGatewayClient,
} from '@xeprime/types';
import type { Request } from 'express';
import type { StartGatewayCheckoutDto } from './dto/payment-gateway.dto';
import type { CheckoutRequest } from './payment-gateway.service';

/**
 * Dựng yêu cầu mở phiên từ request HTTP — chung cho site khách và site đối tác.
 *
 * Ngôn ngữ: thân request → cookie ngôn ngữ của web (cùng origin, đi kèm sẵn) → `vi`. IP lấy từ
 * `req.ip` (Express đã tin đúng số lớp proxy theo `TRUST_PROXY_HOPS`), không từ header client tự khai.
 */
export function checkoutRequestFrom(
  req: Request,
  dto: StartGatewayCheckoutDto,
  actorUserId: string,
): CheckoutRequest {
  // DTO đã `@IsIn` — phép kiểm này chỉ để thu hẹp kiểu, không phải lớp bảo vệ thứ hai.
  if (!isPaymentGatewayProvider(dto.provider)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Cổng thanh toán không hợp lệ',
    });
  }
  return {
    provider: dto.provider,
    client: clientOf(dto.client),
    locale: localeOf(dto.locale, req),
    clientIp: req.ip ?? '',
    actorUserId,
  };
}

function clientOf(value: string | undefined): PaymentGatewayClient {
  return (PAYMENT_GATEWAY_CLIENT_VALUES as string[]).includes(value ?? '')
    ? (value as PaymentGatewayClient)
    : PAYMENT_GATEWAY_CLIENT.WEB;
}

function localeOf(value: string | undefined, req: Request): AppLocale {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const candidate = value ?? cookies?.[LOCALE_COOKIE_NAME];
  return (SUPPORTED_LOCALES as readonly string[]).includes(String(candidate))
    ? (candidate as AppLocale)
    : DEFAULT_LOCALE;
}
