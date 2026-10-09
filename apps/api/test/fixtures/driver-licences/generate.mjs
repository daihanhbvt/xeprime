#!/usr/bin/env node
/* global process, console */
/* eslint-disable no-console -- công cụ dòng lệnh: in tiến độ ra terminal là việc của nó */
/**
 * Sinh bộ ẢNH MẪU bằng lái để thử bộ đọc ảnh (ADR 0057).
 *
 *   node apps/api/test/fixtures/driver-licences/generate.mjs
 *
 * Mỗi mẫu là một trang HTML vẽ một tấm thẻ đặt trên mặt bàn (như ảnh chụp điện thoại), rồi Chrome
 * headless chụp thành PNG. Chạy lại được bất cứ lúc nào — chỉ cần Chrome/Edge (hoặc `CHROME_PATH`).
 *
 * ⚠️ Đây KHÔNG phải bản sao giấy tờ thật: dữ liệu hư cấu, không quốc huy, không hoa văn bảo an,
 * và mọi tấm đều đóng dấu "MẪU THỬ / SPECIMEN". Chúng chỉ đủ giống về BỐ CỤC THÔNG TIN (số bằng,
 * họ tên, hạng, hạn) để kiểm luồng đọc → quyết định — không dùng được vào việc gì khác.
 *
 * Kết quả mong đợi của từng mẫu nằm ở `samples.json` — `try-reader.ts` đọc file đó để so.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('Không tìm thấy Chrome/Edge — đặt CHROME_PATH rồi chạy lại.');
  return found;
}

const PORTRAIT = `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="150" fill="#cfd8e3"/><circle cx="60" cy="56" r="28" fill="#8a9bb0"/><path d="M14 150c4-36 24-52 46-52s42 16 46 52z" fill="#8a9bb0"/></svg>`;

const CARD_BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; width: 1400px; height: 1000px; display: grid; place-items: center;
    background: radial-gradient(circle at 30% 20%, #8b6b4a, #5a4330 70%); font-family: Arial, Helvetica, sans-serif; }
  .card { position: relative; width: 856px; height: 540px; border-radius: 26px; overflow: hidden;
    transform: rotate(-2.2deg); box-shadow: 0 30px 60px rgba(0,0,0,.45); }
  .specimen { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
  .specimen span { transform: rotate(-24deg); font-size: 64px; font-weight: 900; letter-spacing: 6px;
    color: rgba(220, 30, 30, .28); border: 8px solid rgba(220, 30, 30, .28); padding: 6px 26px; border-radius: 14px; }
  .label { font-size: 15px; color: #444; }
  .value { font-size: 23px; font-weight: 700; color: #111; }
  .row { margin: 7px 0; }
`;

function page(cardHtml, extraCss = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CARD_BASE_CSS}${extraCss}</style></head>
<body><div class="card">${cardHtml}<div class="specimen"><span>MẪU THỬ · SPECIMEN</span></div></div></body></html>`;
}

/** Thẻ kiểu GPLX Việt Nam (bố cục thông tin, KHÔNG phải mẫu phôi thật). */
function vnFront({ number, name, dob, classes, expires, issued, place, beginning }) {
  return `
<div style="position:absolute;inset:0;background:linear-gradient(135deg,#fdf1d6,#f6d9a8 55%,#efc98d)"></div>
<div style="position:absolute;left:0;right:0;top:18px;text-align:center">
  <div style="font-size:15px;font-weight:700;color:#7a1b0c">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
  <div style="font-size:13px;color:#7a1b0c">Độc lập - Tự do - Hạnh phúc</div>
  <div style="margin-top:8px;font-size:27px;font-weight:900;color:#b3261e">GIẤY PHÉP LÁI XE</div>
  <div style="font-size:16px;font-weight:700;color:#b3261e">DRIVER'S LICENSE</div>
</div>
<div style="position:absolute;left:34px;top:150px;width:150px;height:190px;border:2px solid #9a7b4f;background:#fff">${PORTRAIT}</div>
<div style="position:absolute;left:210px;top:140px;right:30px">
  <div class="row"><span class="label">Số/No:</span> <span class="value" style="color:#b3261e">${number}</span></div>
  <div class="row"><span class="label">Họ tên/Full name:</span><br><span class="value">${name}</span></div>
  <div class="row"><span class="label">Ngày sinh/Date of Birth:</span> <span class="value">${dob}</span></div>
  <div class="row"><span class="label">Quốc tịch/Nationality:</span> <span class="value">VIỆT NAM</span></div>
  <div class="row"><span class="label">Hạng/Class:</span> <span class="value" style="font-size:30px;color:#b3261e">${classes}</span></div>
  <div class="row"><span class="label">Có giá trị đến/Expires:</span> <span class="value">${expires}</span></div>
</div>
<div style="position:absolute;left:34px;bottom:26px;font-size:14px;color:#333">Ngày trúng tuyển/Beginning date: ${beginning}</div>
<div style="position:absolute;right:30px;bottom:26px;font-size:15px;color:#333;text-align:right">${place}, ${issued}</div>`;
}

/** Một tấm B2 còn hạn — dùng lại cho các biến thể "ảnh chụp điện thoại". */
const VN_B2 = {
  number: '790123456789',
  name: 'NGUYỄN VĂN MẪU',
  dob: '12/04/1990',
  classes: 'B2',
  expires: '15/03/2031',
  issued: 'ngày 15 tháng 03 năm 2021',
  place: 'TP. Hồ Chí Minh',
  beginning: '02/2021',
};

/** Thẻ kiểu CCCD — giấy tờ hay bị nộp NHẦM nhất: cùng quốc hiệu, cùng số 12 chữ số với GPLX. */
function citizenId() {
  return `
<div style="position:absolute;inset:0;background:linear-gradient(135deg,#e8f1fb,#c9def3)"></div>
<div style="position:absolute;left:0;right:0;top:18px;text-align:center">
  <div style="font-size:15px;font-weight:700;color:#0b3d75">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
  <div style="font-size:13px;color:#0b3d75">Độc lập - Tự do - Hạnh phúc</div>
  <div style="margin-top:8px;font-size:27px;font-weight:900;color:#b3261e">CĂN CƯỚC CÔNG DÂN</div>
  <div style="font-size:16px;font-weight:700;color:#0b3d75">Citizen Identity Card</div>
</div>
<div style="position:absolute;left:34px;top:150px;width:150px;height:190px;border:2px solid #0b3d75;background:#fff">${PORTRAIT}</div>
<div style="position:absolute;left:210px;top:140px;right:30px">
  <div class="row"><span class="label">Số/No:</span> <span class="value">079090001234</span></div>
  <div class="row"><span class="label">Họ và tên/Full name:</span><br><span class="value">NGUYỄN VĂN MẪU</span></div>
  <div class="row"><span class="label">Ngày sinh/Date of birth:</span> <span class="value">12/04/1990</span></div>
  <div class="row"><span class="label">Quốc tịch/Nationality:</span> <span class="value">Việt Nam</span></div>
  <div class="row"><span class="label">Có giá trị đến/Date of expiry:</span> <span class="value">12/04/2030</span></div>
</div>`;
}

const SAMPLES = [
  {
    file: 'vn-pet-b2-valid.jpg',
    html: page(vnFront(VN_B2)),
  },
  {
    // Cầm nghiêng điện thoại: phối cảnh, hơi nhoè, hơi tối.
    file: 'vn-pet-b2-tilted.jpg',
    html: page(
      vnFront(VN_B2),
      '.card { transform: perspective(1400px) rotateX(9deg) rotateY(-7deg) rotate(-5deg); filter: blur(0.6px) brightness(0.92); }',
    ),
  },
  {
    // Chụp dọc khi thẻ nằm ngang trên bàn: chữ quay 90°.
    file: 'vn-pet-b2-rotated.jpg',
    html: page(vnFront(VN_B2), '.card { transform: rotate(90deg) scale(0.95); }'),
  },
  {
    // Phòng tối — đo xem bộ đọc từ chối êm ("chụp lại") hay đoán bừa.
    file: 'vn-pet-b2-dim.jpg',
    html: page(
      vnFront(VN_B2),
      'body { background: #2a2018; } .card { filter: brightness(0.5) contrast(0.85); }',
    ),
  },
  {
    file: 'vn-citizen-id.jpg',
    html: page(citizenId()),
  },
  {
    file: 'vn-2025-a-b-valid.jpg',
    html: page(
      vnFront({
        number: '012345678901',
        name: 'TRẦN THỊ THỬ',
        dob: '03/09/1996',
        classes: 'A, B',
        expires: '10/06/2035',
        issued: 'ngày 10 tháng 06 năm 2025',
        place: 'Hà Nội',
        beginning: '05/2025',
      }),
    ),
  },
  {
    file: 'vn-a1-no-expiry.jpg',
    html: page(
      vnFront({
        number: '480987654321',
        name: 'LÊ VĂN VÔ HẠN',
        dob: '21/11/1985',
        classes: 'A1',
        expires: 'Không thời hạn',
        issued: 'ngày 08 tháng 08 năm 2016',
        place: 'Đà Nẵng',
        beginning: '07/2016',
      }),
    ),
  },
  {
    file: 'vn-pet-expired.jpg',
    html: page(
      vnFront({
        number: '790555666777',
        name: 'PHẠM QUÁ HẠN',
        dob: '01/01/1980',
        classes: 'B2',
        expires: '20/05/2024',
        issued: 'ngày 20 tháng 05 năm 2014',
        place: 'Cần Thơ',
        beginning: '04/2014',
      }),
    ),
  },
  {
    file: 'vn-pet-blurry.jpg',
    html: page(
      vnFront({
        number: '790123456789',
        name: 'NGUYỄN VĂN MẪU',
        dob: '12/04/1990',
        classes: 'B2',
        expires: '15/03/2031',
        issued: 'ngày 15 tháng 03 năm 2021',
        place: 'TP. Hồ Chí Minh',
        beginning: '02/2021',
      }),
      '.card { filter: blur(6px); }',
    ),
  },
  {
    file: 'vn-back-side.jpg',
    html: page(`
<div style="position:absolute;inset:0;background:linear-gradient(135deg,#fdf1d6,#f3d6a3)"></div>
<div style="position:absolute;left:30px;right:30px;top:26px">
  <div style="text-align:center;font-weight:900;font-size:20px;color:#7a1b0c">CÁC LOẠI XE CƠ GIỚI ĐƯỢC ĐIỀU KHIỂN</div>
  <table style="width:100%;margin-top:14px;border-collapse:collapse;font-size:15px">
    ${[
      ['A1', 'Xe mô tô hai bánh có dung tích xi-lanh từ 50 cm³ đến dưới 175 cm³'],
      ['A2', 'Xe mô tô hai bánh có dung tích xi-lanh từ 175 cm³ trở lên'],
      ['B1', 'Ô tô chở người đến 9 chỗ ngồi, không kinh doanh vận tải'],
      ['B2', 'Ô tô chở người đến 9 chỗ ngồi, ô tô tải dưới 3.500 kg'],
      ['C', 'Ô tô tải có trọng tải từ 3.500 kg trở lên'],
      ['D', 'Ô tô chở người từ 10 đến 30 chỗ'],
    ]
      .map(
        ([c, d]) =>
          `<tr><td style="border:1px solid #9a7b4f;padding:6px 10px;font-weight:700;width:70px">${c}</td><td style="border:1px solid #9a7b4f;padding:6px 10px">${d}</td></tr>`,
      )
      .join('')}
  </table>
</div>`),
  },
  {
    file: 'idp-b.jpg',
    html: page(`
<div style="position:absolute;inset:0;background:#f4f1e8"></div>
<div style="position:absolute;left:0;right:0;top:20px;text-align:center">
  <div style="font-size:24px;font-weight:900;letter-spacing:2px">INTERNATIONAL DRIVING PERMIT</div>
  <div style="font-size:14px;color:#555">Convention on Road Traffic of 8 November 1968 · Issued in: FEDERAL REPUBLIC OF GERMANY</div>
</div>
<div style="position:absolute;left:34px;top:110px;width:140px;height:178px;border:1px solid #888;background:#fff">${PORTRAIT}</div>
<div style="position:absolute;left:200px;top:100px;right:30px;font-size:18px">
  <div class="row">1. <span class="label">Surname:</span> <span class="value">MUSTER</span></div>
  <div class="row">2. <span class="label">Given names:</span> <span class="value">ERIKA</span></div>
  <div class="row">3. <span class="label">Date of birth:</span> <span class="value">14.02.1988</span></div>
  <div class="row"><span class="label">Permit No.:</span> <span class="value">DE-IDP-2024-778899</span></div>
  <div class="row"><span class="label">Valid until:</span> <span class="value">01.09.2027</span></div>
  <div class="row"><span class="label">Issued:</span> <span class="value">01.09.2024</span></div>
  <div class="row"><span class="label">Categories:</span> <span class="value">B</span>
    <span style="margin-left:18px;font-size:16px">A ✗ · B ✓ · C ✗ · D ✗ · BE ✗</span></div>
</div>`),
  },
  {
    file: 'foreign-us-class-c.jpg',
    html: page(`
<div style="position:absolute;inset:0;background:linear-gradient(120deg,#dfefff,#b9d8f7)"></div>
<div style="position:absolute;left:30px;top:22px;font-size:30px;font-weight:900;color:#0b3d75">STATE OF EXAMPLE</div>
<div style="position:absolute;right:30px;top:30px;font-size:20px;font-weight:700;color:#0b3d75">DRIVER LICENSE</div>
<div style="position:absolute;left:34px;top:100px;width:150px;height:190px;border:2px solid #0b3d75;background:#fff">${PORTRAIT}</div>
<div style="position:absolute;left:210px;top:96px;right:30px;font-size:18px">
  <div class="row"><span class="label">DL</span> <span class="value">D1234567</span></div>
  <div class="row"><span class="label">CLASS</span> <span class="value">C</span></div>
  <div class="row"><span class="label">EXP</span> <span class="value">08/14/2029</span> <span class="label" style="margin-left:20px">ISS</span> <span class="value">08/14/2021</span></div>
  <div class="row"><span class="label">LN</span> <span class="value">SAMPLE</span></div>
  <div class="row"><span class="label">FN</span> <span class="value">JOHN TEST</span></div>
  <div class="row"><span class="label">DOB</span> <span class="value">08/14/1990</span></div>
  <div class="row" style="font-size:14px;color:#333">123 MAIN STREET, EXAMPLE CITY, EX 00000</div>
</div>`),
  },
  {
    // Ảnh linh tinh CHỮ NƯỚC NGOÀI (Trung, Hàn, Nga, Thái) — bộ đọc tiếng Việt không đọc nổi, nhưng
    // phải từ chối ngay là "không nhận ra bằng lái", không được rơi vào hàng đợi duyệt tay.
    file: 'foreign-text-poster.jpg',
    html: page(`
<div style="position:absolute;inset:0;background:#fff7e6"></div>
<div style="position:absolute;left:40px;top:34px;right:40px;font-size:30px;line-height:1.5;color:#222">
  <div style="font-size:44px;font-weight:900;color:#b3261e">欢迎光临 · 今日特价</div>
  <div>牛肉面 35元 · 饺子 20元 · 豆浆 5元</div>
  <div style="font-size:36px;font-weight:700;margin-top:10px">환영합니다 오늘의 메뉴</div>
  <div>김치찌개 9000원 · 비빔밥 8000원</div>
  <div style="margin-top:10px">Добро пожаловать! Скидка 20% на всё</div>
  <div>ยินดีต้อนรับ ลดราคาพิเศษวันนี้</div>
</div>`),
  },
  {
    // Ảnh chụp một TRANG CHỮ nói về bằng lái — có chữ "driver license" nhưng không phải tấm bằng:
    // phải bị từ chối ngay, không được tự xác thực như một bằng nước ngoài.
    file: 'licence-article.jpg',
    html: `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; width: 1400px; height: 1000px; background: #ddd; font-family: Georgia, serif; }
  .sheet { margin: 30px auto; width: 1240px; height: 920px; background: #fff; padding: 36px 48px; box-sizing: border-box;
    font-size: 19px; line-height: 1.55; color: #222; }
  h1 { font-size: 34px; margin: 0 0 14px; }
</style></head><body><div class="sheet">
  <h1>Driver License Guide for Visitors</h1>
  <p>${"Every visitor who plans to rent a car should check the rules before the trip. A national driver license on its own is usually not enough, and the rental desk may ask for an international permit issued under the 1968 convention together with the original card. Keep both documents with you while driving, because police checks are common on main roads and the fines are high. Insurance companies may also refuse a claim when the driver did not hold a valid permit at the time of the accident. Every visitor who plans to rent a car should check the rules before the trip. A national driver license on its own is usually not enough, and the rental desk may ask for an international permit issued under the 1968 convention together with the original card. Keep both documents with you while driving, because police checks are common on main roads and the fines are high. Insurance companies may also refuse a claim when the driver did not hold a valid permit at the time of the accident. Every visitor who plans to rent a car should check the rules before the trip. A national driver license on its own is usually not enough, and the rental desk may ask for an international permit issued under the 1968 convention together with the original card. Keep both documents with you while driving, because police checks are common on main roads and the fines are high. Insurance companies may also refuse a claim when the driver did not hold a valid permit at the time of the accident. "}</p>
  <p>${"Every visitor who plans to rent a car should check the rules before the trip. A national driver license on its own is usually not enough, and the rental desk may ask for an international permit issued under the 1968 convention together with the original card. Keep both documents with you while driving, because police checks are common on main roads and the fines are high. Insurance companies may also refuse a claim when the driver did not hold a valid permit at the time of the accident. Every visitor who plans to rent a car should check the rules before the trip. A national driver license on its own is usually not enough, and the rental desk may ask for an international permit issued under the 1968 convention together with the original card. Keep both documents with you while driving, because police checks are common on main roads and the fines are high. Insurance companies may also refuse a claim when the driver did not hold a valid permit at the time of the accident. "}</p>
</div></body></html>`,
  },
  {
    file: 'not-a-licence.jpg',
    html: page(`
<div style="position:absolute;inset:0;background:#ffffff"></div>
<div style="position:absolute;left:40px;top:30px;right:40px;font-family:'Courier New',monospace;font-size:20px;color:#222">
  <div style="text-align:center;font-weight:900;font-size:26px">CỬA HÀNG TIỆN LỢI MẪU</div>
  <div style="text-align:center">HOÁ ĐƠN BÁN LẺ · 08/10/2026 14:32</div>
  <hr>
  <div>Nước suối 500ml .......... 2 x 6.000</div>
  <div>Bánh mì sandwich ......... 1 x 25.000</div>
  <div>Cà phê sữa đá ............ 1 x 29.000</div>
  <hr>
  <div style="font-weight:900">TỔNG CỘNG: 66.000 đ</div>
  <div style="margin-top:10px;text-align:center">Cảm ơn quý khách!</div>
</div>`),
  },
];

const chrome = findChrome();
const workDir = join(tmpdir(), 'xeprime-licence-samples');
mkdirSync(workDir, { recursive: true });

for (const sample of SAMPLES) {
  const htmlPath = join(workDir, sample.file.replace(/\.jpg$/, '.html'));
  writeFileSync(htmlPath, sample.html, 'utf8');
  const outPath = join(here, sample.file);
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1400,1000',
    `--screenshot=${outPath}`,
    pathToFileURL(htmlPath).href,
  ]);
  console.log('✓', sample.file);
}
