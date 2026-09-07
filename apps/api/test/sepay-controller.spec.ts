import {
  ServiceUnavailableException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { SepayController } from '../src/modules/sepay/sepay.controller';
import { SepayService } from '../src/modules/sepay/sepay.service';

describe('SepayController · acknowledgement contract', () => {
  let app: INestApplication;

  const sepay = {
    assertApiKey: jest.fn(),
    ingest: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SepayController],
      providers: [{ provide: SepayService, useValue: sepay }],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    // Giống runtime thật: route raw phải thoát lớp bọc `{ data }` toàn cục.
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    sepay.ingest.mockResolvedValue({
      received: true,
      duplicate: false,
      matched: true,
      note: 'activated',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('trả đúng raw JSON mà SePay yêu cầu sau khi xử lý thành công', async () => {
    const payload = {
      id: 92704,
      transferType: 'in',
      transferAmount: 1_990_000,
      content: 'XPGWS4BS2TG',
    };

    const response = await request(app.getHttpServer())
      .post('/sepay/webhook')
      .set('Authorization', 'Apikey test-sepay-key-0123456789abcdef')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json\b/);
    expect(response.text).toBe('{"success": true}');
    expect(sepay.assertApiKey).toHaveBeenCalledWith('Apikey test-sepay-key-0123456789abcdef');
    expect(sepay.ingest).toHaveBeenCalledWith(payload);
  });

  it('không trả success khi xử lý giao dịch thất bại', async () => {
    sepay.ingest.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app.getHttpServer())
      .post('/sepay/webhook')
      .set('Authorization', 'Apikey test-sepay-key-0123456789abcdef')
      .send({ id: 92705, transferType: 'in', transferAmount: 100_000 });

    expect(response.status).toBe(500);
    expect(response.text).not.toBe('{"success": true}');
  });

  it.each([
    ['API key sai', new UnauthorizedException(), 401],
    ['SePay chưa cấu hình', new ServiceUnavailableException(), 503],
  ])('giữ nguyên lỗi %s và không nhận giao dịch', async (_case, error, status) => {
    sepay.assertApiKey.mockImplementationOnce(() => {
      throw error;
    });

    const response = await request(app.getHttpServer())
      .post('/sepay/webhook')
      .set('Authorization', 'Apikey invalid-test-key')
      .send({ id: 92706, transferType: 'in', transferAmount: 100_000 });

    expect(response.status).toBe(status);
    expect(response.text).not.toBe('{"success": true}');
    expect(sepay.ingest).not.toHaveBeenCalled();
  });
});
