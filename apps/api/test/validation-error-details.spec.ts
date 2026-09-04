import 'reflect-metadata';
import { Body, Controller, HttpCode, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNumber, Max, Min, ValidateNested } from 'class-validator';
import { API_ERROR_CODE } from '@xeprime/types';
import request from 'supertest';
import { createValidationPipe } from '../src/bootstrap';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * `error.details` phải chỉ được ĐÚNG Ô NHẬP nào sai.
 *
 * Đây là nửa server của một lỗi có thật ở giao diện: nhập mức tiêu thụ `1.233` (cột
 * `Decimal(6, 2)`) thì form chỉ nhận một toast "Dữ liệu gửi lên không hợp lệ" và người dùng
 * phải tự dò ô sai trên một form vài chục ô. Web gắn lỗi vào ô bằng `details[].field`, nên
 * trường đó phải (a) có mặt và (b) là ĐƯỜNG DẪN đầy đủ tới ô — kể cả khi ô nằm trong mảng lồng.
 *
 * Bản `exceptionFactory` trước chỉ đọc `property` của tầng ngoài cùng và bỏ hẳn `children`: mọi
 * lỗi bên trong `deliveryTiers` đều quay về `{ field: 'deliveryTiers', constraints: [] }` — đúng
 * thứ không dùng được để chỉ ô.
 */
class TierDto {
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(500)
  toKm!: number;
}

class SampleDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999)
  fuelConsumptionCity!: number;

  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TierDto)
  deliveryTiers!: TierDto[];
}

@Controller('sample')
class SampleController {
  @Post()
  @HttpCode(200)
  create(@Body() dto: SampleDto): SampleDto {
    return dto;
  }
}

interface FieldDetail {
  field: string;
  constraints: string[];
}

describe('ValidationPipe → error.details chỉ đúng ô nhập', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [SampleController] }).compile();
    app = moduleRef.createNestApplication();
    // Dùng CHÍNH cấu hình production, không chép lại — xem ghi chú ở `createValidationPipe`.
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter(false));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('nhận giá trị đúng số chữ số thập phân', async () => {
    await request(app.getHttpServer())
      .post('/sample')
      .send({ fuelConsumptionCity: 1.23, deliveryTiers: [{ toKm: 10.5 }] })
      .expect(200);
  });

  it('trường phẳng sai → details nêu đúng tên trường', async () => {
    const res = await request(app.getHttpServer())
      .post('/sample')
      .send({ fuelConsumptionCity: 1.233, deliveryTiers: [] })
      .expect(400);

    expect(res.body.error.code).toBe(API_ERROR_CODE.VALIDATION_FAILED);
    const details = res.body.error.details as FieldDetail[];
    expect(details.map((d) => d.field)).toContain('fuelConsumptionCity');
    expect(details.find((d) => d.field === 'fuelConsumptionCity')!.constraints.length).toBeGreaterThan(0);
  });

  it('trường LỒNG trong mảng sai → details nêu đường dẫn chấm tới đúng ô', async () => {
    const res = await request(app.getHttpServer())
      .post('/sample')
      .send({ fuelConsumptionCity: 1.2, deliveryTiers: [{ toKm: 1 }, { toKm: 2.25 }] })
      .expect(400);

    const details = res.body.error.details as FieldDetail[];
    // `deliveryTiers.1.toKm`, không phải `deliveryTiers` — đây là cú pháp tên field của RHF.
    expect(details.map((d) => d.field)).toContain('deliveryTiers.1.toKm');
    expect(details.every((d) => d.constraints.length > 0)).toBe(true);
  });
});
