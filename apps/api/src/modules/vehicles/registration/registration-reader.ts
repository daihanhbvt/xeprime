import { Logger } from '@nestjs/common';
import type { VehicleRegistrationReading } from '@xeprime/types';
import {
  DEFAULT_LIMITS,
  LANGUAGE,
  TesseractEngine,
  packageVersion,
  prepareImage,
  variantBinary,
  variantGrey,
  variantOriginal,
  type TesseractReaderLimits,
} from '../../driver-licences/reader/tesseract-driver-licence-reader';
import {
  analyseRegistrationPass,
  mergeRegistrationPasses,
  registrationLabelScore,
} from './registration-text';

/**
 * Bộ đọc ảnh cà vẹt — khớp nối trung lập nhà cung cấp (ADR 0089). Bộ đọc chỉ KỂ LẠI; mọi quyết
 * định (đủ để lưu hay phải nhập tay) nằm ở `assessRegistrationReading` và ở lượt tạo xe.
 */
export const VEHICLE_REGISTRATION_READER = 'VEHICLE_REGISTRATION_READER';

export interface VehicleRegistrationReader {
  readonly name: string;
  read(image: Uint8Array): Promise<VehicleRegistrationReading>;
  dispose(): Promise<void>;
}

/** Ảnh có ít hơn chừng này nhãn cà vẹt ở chiều gốc thì thử các chiều xoay khác. */
const UPRIGHT_MIN_LABELS = 2;

/**
 * Tesseract chạy trong tiến trình API — cùng bộ máy với bộ đọc bằng lái (ADR 0057 điều 2b): không
 * gọi ra ngoài, không phí theo lượt, ảnh không rời máy chủ. Một worker RIÊNG (khởi động lười, rảnh
 * thì tự tắt), để hàng đợi cà vẹt không chặn lượt đọc bằng lái của khách.
 */
export class TesseractVehicleRegistrationReader implements VehicleRegistrationReader {
  readonly name = `tesseract.js ${packageVersion('tesseract.js')} · ${LANGUAGE} best_int`;
  private readonly limits: TesseractReaderLimits;
  private readonly engine: TesseractEngine;

  constructor(limits: Partial<TesseractReaderLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.engine = new TesseractEngine(
      new Logger(TesseractVehicleRegistrationReader.name),
      this.limits,
    );
  }

  read(image: Uint8Array): Promise<VehicleRegistrationReading> {
    return this.engine.exclusive(this.limits.readTimeoutMs, async (recognize) => {
      const prepared = await prepareImage(image);

      // 1) Chiều gốc; thấy quá ít nhãn ⇒ thử ảnh xoay (chụp dọc một tấm cà vẹt nằm ngang).
      let rotation = 0;
      let firstLines = await recognize(await variantOriginal(prepared, 0));
      let bestScore = registrationLabelScore(firstLines);
      if (bestScore < UPRIGHT_MIN_LABELS) {
        for (const angle of [90, 270, 180]) {
          const lines = await recognize(await variantOriginal(prepared, angle));
          const score = registrationLabelScore(lines);
          if (score > bestScore) {
            bestScore = score;
            firstLines = lines;
            rotation = angle;
          }
          if (bestScore >= UPRIGHT_MIN_LABELS) break;
        }
      }
      // 2) Hai lượt nữa ở đúng chiều đó, mỗi lượt một cách xử lý ảnh — để bỏ phiếu.
      return mergeRegistrationPasses([
        analyseRegistrationPass(firstLines),
        analyseRegistrationPass(await recognize(await variantGrey(prepared, rotation))),
        analyseRegistrationPass(await recognize(await variantBinary(prepared, rotation))),
      ]);
    });
  }

  dispose(): Promise<void> {
    this.engine.dispose();
    return Promise.resolve();
  }
}

/** `VEHICLE_REGISTRATION_OCR=off` hoặc cài thiếu dữ liệu ngôn ngữ — chủ xe nhập tay mọi trường. */
export class NotConfiguredVehicleRegistrationReader implements VehicleRegistrationReader {
  readonly name = 'not_configured';

  read(): Promise<VehicleRegistrationReading> {
    return Promise.reject(new Error('Bộ đọc cà vẹt đang tắt'));
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}
