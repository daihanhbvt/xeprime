import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Thiết lập "Có hỗ trợ xuất hoá đơn VAT" của gian hàng / chủ xe (ADR 0059) — áp cho MỌI xe.
 *
 * THÔNG TIN công bố cho khách: hai bên tự thoả thuận và xác nhận trực tiếp; XePrime không xuất
 * hoá đơn thay chủ xe, và cờ không đổi giá, phí, thuế khấu trừ hay điều kiện đặt xe.
 */
export class VatInvoiceSettingDto {
  @ApiProperty({
    description:
      'Gian hàng / chủ xe hỗ trợ xuất hoá đơn VAT cho tiền thuê — áp cho mọi xe, khách lọc được ' +
      'trên chợ. XePrime không xuất hoá đơn thay chủ xe.',
  })
  vatInvoiceSupported!: boolean;
}

/**
 * `PATCH /tenants/current/vat-invoice` — chỉ nhận boolean THẬT (`ValidationPipe` không ép kiểu
 * ngầm, nên `"false"` bị từ chối thay vì lặng lẽ thành `true`).
 */
export class SetVatInvoiceSupportDto {
  @ApiProperty({
    description:
      'true = hỗ trợ xuất hoá đơn VAT cho tiền thuê của mọi xe; false = không công bố. Không đổi ' +
      'giá, phí, thuế hay điều kiện đặt xe.',
  })
  @IsBoolean()
  supported!: boolean;
}
