import {
  analysePass,
  approximateFind,
  fold,
  mergePasses,
  readClassToken,
  toIsoDate,
  type OcrLine,
  type PassFindings,
} from '../src/modules/driver-licences/reader/licence-text';

/**
 * Chữ → trường bằng lái (ADR 0057 điều 2b) — thuần, không Tesseract, không ảnh.
 *
 * Chữ mẫu ở đây là chữ Tesseract ĐÃ THẬT SỰ trả về trên bộ ảnh mẫu (kể cả lỗi đọc), để test khoá
 * đúng những lỗi mà bộ tách trường phải chịu được.
 */

/** Một khối chữ → các dòng OCR, mọi từ cùng một độ tin cậy. */
function ocr(text: string, confidence = 90): OcrLine[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/).map((word) => ({ text: word, confidence })));
}

/** Lượt đọc ảnh gốc mặt trước PET B2 — "45/03" cho "15/03", hạng tách thành dòng riêng. */
const PET_B2_RAW = `CỌNG HÒA XÃ HỌI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
GIÁY PHÉP LAI XE
DRIVER'S LICENSE
sáNo: 790123456789
Họ tên/Full name: 6
NGUYÊN VĂN MẪU
Ngã sinhiDate.of Bflth: 12/04/1990
Quácfể¡Nafốnahy: VIỆT NAM
B2
Hạng/Class: ĐÁ
Có giá trị đến/EXBireS: 45/03/2031
Ngày trúng tuyển/BÉginning date: 02/2021 'TP. Hồ Chí Minh, ngày 15 tháng 03 năm 2021`;

const CITIZEN_ID = `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
CĂN CƯỚC CÔNG DÂN
Citizen Identity Card
Số/No: 079090001234
Họ và tên/Full name:
NGUYỄN VĂN MẪU
Ngày sinh/Date of birth: 12/04/1990
Quốc tịch/Nationality: Việt Nam
Có giá trị đến/Date of expiry: 12/04/2030`;

const BACK_SIDE = `CÁC LOẠI XE CƠ GIỚI ĐƯỢC ĐIỀU KHIỂN
A1 Xe mô tô hai bánh có dung tích xi-lanh từ 50 cm3 đến dưới 175 cm3
A2 Xe mô tô hai bánh có dung tích xi-lanh từ 175 cm3 trở lên
B1 Ô tô chở người đến 9 chỗ ngồi, không kinh doanh vận tải`;

const RECEIPT = `CỬA HÀNG TIỆN LỢI MẪU
HOÁ ĐƠN BẢN LẺ 08/10/2026 14:32
Nước suối 500ml 2 x 6.000
Bánh mì sandwich 1 x 25.000
Cà phê sữa đá 1 x 29.000
TỔNG CỘNG: 66.000 đ
Cảm ơn quý khách!`;

const IDP = `INTERNATIONAL DRIVING PERMIT
Convention on Road Traffic of 8 November 1968 - Issued in: FEDERAL REPUBLIC OF GERMANY
1. Surname: MUSTER
2. Given names: ERIKA
3. Date of birth: 14.02.1988
Permit No: DE-IDP-2024-778899
Valid until: 01.09.2027`;

const US_LICENCE = `STATE OF EXAMPLE DRIVER LICENSE
DL D1234567
CLASS C
EXP 08/14/2029 ISS 08/14/2021
FN JOHN TEST`;

const merge = (passes: PassFindings[]) => mergePasses(passes, { qualityIssues: [], rotation: 0 });

describe('chuẩn hoá và so khớp gần đúng', () => {
  it('fold bỏ dấu, đ → D, chỉ giữ chữ và số', () => {
    expect(fold('Giấy phép lái xe / Đồng Nai')).toBe('GIAY PHEP LAI XE DONG NAI');
  });

  it('tìm nhãn đọc sai vài chữ trong một dòng dài', () => {
    expect(approximateFind('COGIATRIDENEXBIRES4503', 'EXPIRES')).toMatchObject({
      distance: 1,
      end: 18,
    });
  });
});

describe('toIsoDate — chỉ sửa khi giá trị KHÔNG THỂ đúng', () => {
  it.each([
    [['15', '03', '2031'], '2031-03-15'],
    [['45', '03', '2031'], '2031-03-15'], // `1` đọc thành `4`
    [['40', '06', '2035'], '2035-06-10'],
    [['12', '04', '4996'], '1996-04-12'],
    [['12', '41', '1990'], '1990-11-12'],
    [['31', '02', '2031'], null], // có hình nhưng không có thật trên lịch
    [['55', '03', '2031'], null], // không có cách sửa nào đã biết
  ] as const)('%j ⇒ %s', ([d, m, y], expected) => {
    expect(toIsoDate(d, m, y)).toBe(expected);
  });
});

describe('readClassToken', () => {
  it.each([
    ['B2', 'B2'],
    ['82', 'B2'],
    ['Al', 'A1'],
    ['A,', 'A'],
    ['F.B2', 'FB2'],
    ['ĐÁ', null],
    ['CLASS', null],
    ['Z5', null],
  ])('%s ⇒ %s', (token, expected) => {
    expect(readClassToken(token)).toBe(expected);
  });
});

describe('analysePass — một lượt đọc mặt trước GPLX', () => {
  const pass = analysePass(ocr(PET_B2_RAW));

  it('đọc đủ số bằng, họ tên, ngày sinh, hạng, hạn, ngày cấp dù nhãn đọc sai', () => {
    expect(pass.licenceNumber?.value).toBe('790123456789');
    expect(pass.fullName?.value).toBe('NGUYÊN VĂN MẪU');
    expect(pass.dateOfBirth?.value).toBe('1990-04-12');
    expect(pass.classes?.value).toEqual(['B2']); // hạng in to, Tesseract tách ra dòng trên nhãn
    expect(pass.expiresOn?.value).toBe('2031-03-15'); // "45/03" đã sửa
    expect(pass.issuedOn?.value).toBe('2021-03-15'); // "ngày 15 tháng 03 năm 2021"
    expect(pass.noExpiry).toBeNull();
    expect(pass.anchors).toMatchObject({ vnTitle: true, vnState: true, otherDocument: false });
  });

  it('"Không thời hạn" là câu trả lời cho hạn', () => {
    const noExpiry = analysePass(
      ocr(PET_B2_RAW.replace('45/03/2031', 'Không thời hạn').replace('B2\n', 'A1\n')),
    );
    expect(noExpiry.noExpiry).not.toBeNull();
    expect(noExpiry.expiresOn).toBeNull();
    expect(noExpiry.classes?.value).toEqual(['A1']);
  });

  it('nhãn hạn đọc hỏng hẳn ⇒ đường lui cấu trúc: ngày muộn nhất là hạn, sớm nhất là ngày sinh', () => {
    const garbled = analysePass(
      ocr(
        PET_B2_RAW.replace('Có giá trị đến/EXBireS:', 'xx').replace(
          'Ngã sinhiDate.of Bflth:',
          'yy',
        ),
      ),
    );
    expect(garbled.expiresOn?.value).toBe('2031-03-15');
    expect(garbled.dateOfBirth?.value).toBe('1990-04-12');
  });

  it('chữ "Hạnh phúc" KHÔNG phải nhãn hạng', () => {
    expect(analysePass(ocr('Độc lập - Tự do - Hạnh phúc\nA')).classes).toBeNull();
  });
});

describe('mergePasses — loại giấy tờ', () => {
  it('ba lượt đọc GPLX khớp nhau ⇒ vn, mặt trước, tin cậy cao', () => {
    const pass = analysePass(ocr(PET_B2_RAW));
    expect(merge([pass, pass, pass])).toMatchObject({
      isDriverLicence: true,
      documentKind: 'vn',
      side: 'front',
      readable: true,
      confidence: 'high',
      licenceNumber: '790123456789',
      classes: ['B2'],
      expiresOn: '2031-03-15',
      noExpiry: false,
      issuingCountry: 'VN',
    });
  });

  it('CCCD — cùng quốc hiệu, cùng số 12 chữ số, cùng "Có giá trị đến" — là not_a_licence', () => {
    const pass = analysePass(ocr(CITIZEN_ID));
    expect(pass.anchors.otherDocument).toBe(true);
    expect(merge([pass, pass, pass])).toMatchObject({
      isDriverLicence: false,
      documentKind: 'not_a_licence',
    });
  });

  it('mặt sau: bảng hạng xe, không số bằng, không họ tên', () => {
    const pass = analysePass(ocr(BACK_SIDE));
    expect(merge([pass, pass, pass])).toMatchObject({ documentKind: 'vn', side: 'back' });
  });

  it('đọc rõ nhiều chữ mà không có dấu hiệu giấy tờ nào ⇒ not_a_licence', () => {
    const pass = analysePass(ocr(RECEIPT));
    expect(merge([pass, pass, pass]).documentKind).toBe('not_a_licence');
  });

  it('không một dấu hiệu bằng lái nào (ảnh trống, chữ nước ngoài đọc ra rác) ⇒ not_a_licence', () => {
    // Từ chối NGAY và không cho nhờ xem lại: hàng đợi duyệt tay không phải chỗ cho ảnh linh tinh.
    const empty = analysePass([]);
    expect(merge([empty, empty, empty]).documentKind).toBe('not_a_licence');
    const garbage = analysePass(
      ocr('欢迎光临 今日特价\n환영합니다 오늘의 메뉴\nДобро пожаловать', 30),
    );
    expect(merge([garbage, garbage, garbage]).documentKind).toBe('not_a_licence');
  });

  it('CÓ dấu hiệu bằng lái nhưng không đọc chắc ⇒ "chụp lại cho rõ" (được nhờ xem lại)', () => {
    const partial = analysePass(ocr('Họ tên/Full name:\nxx yy\nHạng/Class:', 40));
    expect(merge([partial, partial, partial])).toMatchObject({
      isDriverLicence: true,
      documentKind: 'vn',
      readable: false,
    });
  });

  it('IDP có ngày tháng + mã số giấy tờ ⇒ nhận ra là bằng lái; hạng/hạn không bị đoán', () => {
    const pass = analysePass(ocr(IDP));
    expect(merge([pass, pass, pass])).toMatchObject({
      documentKind: 'international_permit',
      readable: true,
      licenceNumber: 'DE-IDP-2024-778899',
      classes: [],
      expiresOn: null,
      noExpiry: false,
    });
  });

  it('bằng nước ngoài (Mỹ) ⇒ foreign, đọc được — mã số lấy từ dòng có nhãn DL', () => {
    const pass = analysePass(ocr(US_LICENCE));
    expect(merge([pass, pass, pass])).toMatchObject({
      documentKind: 'foreign',
      readable: true,
      licenceNumber: 'D1234567',
    });
  });

  it('chỉ có chữ "DRIVER LICENSE", không ngày tháng / mã số ⇒ chưa đủ để là một tấm bằng', () => {
    const pass = analysePass(ocr('DRIVER LICENSE\nSTATE OF EXAMPLE'));
    expect(merge([pass, pass, pass])).toMatchObject({ documentKind: 'foreign', readable: false });
  });

  it('cả một trang chữ NÓI VỀ bằng lái ⇒ not_a_licence, không phải bằng nước ngoài', () => {
    const sentence =
      'Visitors should carry their national driver license and the permit at all times';
    const page = Array.from({ length: 14 }, () => sentence).join('\n');
    const pass = analysePass(ocr(`DRIVER LICENSE GUIDE 08/10/2026\nRef AB123456\n${page}`));
    expect(merge([pass, pass, pass]).documentKind).toBe('not_a_licence');
  });
});

describe('hạng — nhiễu của Tesseract không được thành hạng ô tô', () => {
  /** Một tấm A1 (chỉ xe máy) — hạng là thứ duy nhất đổi giữa các ca dưới. */
  const a1 = (classBlock: string) =>
    analysePass(ocr(PET_B2_RAW.replace('B2\nHạng/Class: ĐÁ', classBlock)));

  it('"Hạng/Class: A1 e" — chữ thường lẻ sau hạng là nhiễu, không phải hạng E', () => {
    expect(a1('Hạng/Class: A1 e').classes?.value).toEqual(['A1']);
    const reading = merge([a1('Hạng/Class: A1 e'), a1('Hạng/Class: A1 e'), a1('Hạng/Class: A1')]);
    expect(reading.classes).toEqual(['A1']);
  });

  it('dòng nhiễu "e" phía trên nhãn không thắng dòng hạng thật phía dưới', () => {
    expect(a1('e\nHạng/Class:\nA1').classes?.value).toEqual(['A1']);
  });

  it('chỉ lấy dãy hạng liền sau nhãn — dừng ở cụm đầu tiên không phải hạng', () => {
    expect(a1('Hạng/Class: A1 xe mô tô C').classes?.value).toEqual(['A1']);
  });

  it('hai dòng kề đều "chỉ gồm hạng" ⇒ không đoán', () => {
    expect(a1('A1\nHạng/Class:\nB2').classes).toBeNull();
  });

  it('cụm hạng Tesseract tự chấm thấp là nhiễu', () => {
    const lines = ocr(PET_B2_RAW.replace('B2\nHạng/Class: ĐÁ', 'Hạng/Class: C'));
    const classLine = lines.find((l) => l[0]?.text === 'Hạng/Class:');
    for (const word of classLine ?? []) if (word.text === 'C') word.confidence = 30;
    expect(analysePass(lines).classes).toBeNull();
  });
});

describe('mergePasses — bỏ phiếu', () => {
  const variant = (number: string) => analysePass(ocr(PET_B2_RAW.replace('790123456789', number)));

  it('hai lượt khớp, một lượt lệch ⇒ lấy đa số, tin cậy vừa', () => {
    const reading = merge([
      variant('790123456789'),
      variant('790123456789'),
      variant('790123456780'),
    ]);
    expect(reading.licenceNumber).toBe('790123456789');
    expect(reading.confidence).toBe('medium');
  });

  it('chỉ MỘT lượt thấy hạng (hai lượt kia không) ⇒ tin cậy thấp, dù Tesseract chấm cao', () => {
    const withClass = analysePass(ocr(PET_B2_RAW));
    const noClass = analysePass(ocr(PET_B2_RAW.replace('B2\nHạng/Class: ĐÁ', 'Hạng/Class: ĐÁ')));
    const reading = merge([withClass, noClass, noClass]);
    expect(reading.classes).toEqual(['B2']);
    expect(reading.confidence).toBe('low');
  });

  it('ba lượt khớp nhau nhưng Tesseract đều chấm thấp ⇒ chưa phải "cao"', () => {
    const weak = analysePass(ocr(PET_B2_RAW, 55));
    expect(merge([weak, weak, weak]).confidence).toBe('medium');
  });

  it('ba lượt ba số khác nhau ⇒ tin cậy thấp (người duyệt)', () => {
    const reading = merge([
      variant('790123456789'),
      variant('790123456780'),
      variant('790123456781'),
    ]);
    expect(reading.confidence).toBe('low');
  });

  it('"Không thời hạn" và một ngày hết hạn bỏ phiếu chung', () => {
    const dated = analysePass(ocr(PET_B2_RAW));
    const unlimited = analysePass(ocr(PET_B2_RAW.replace('45/03/2031', 'Không thời hạn')));
    expect(merge([unlimited, unlimited, dated])).toMatchObject({
      noExpiry: true,
      expiresOn: null,
      confidence: 'medium',
    });
  });

  it('hạng B1 (đổi nghĩa theo ngày cấp) ⇒ ngày cấp lệch giữa các lượt kéo tin cậy xuống thấp', () => {
    const b1 = (year: string) =>
      analysePass(ocr(PET_B2_RAW.replace('B2\n', 'B1\n').replace('năm 2021', `năm ${year}`)));
    expect(merge([b1('2021'), b1('2025'), b1('2015')]).confidence).toBe('low');
    expect(merge([b1('2021'), b1('2021'), b1('2021')]).confidence).toBe('high');
  });
});
