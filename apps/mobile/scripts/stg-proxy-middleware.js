/**
 * Proxy DEV của Metro: cho bản WEB của app native (`expo start --web`, `localhost:8081`) dùng
 * API + database của môi trường staging.
 *
 * VÌ SAO CẦN NÓ — và vì sao chỉ web mới cần. Trên iOS/Android, `fetch` là fetch của hệ điều
 * hành: không có origin, không có CORS, trỏ thẳng `https://api-stg.xeprime.vn` là chạy. Bản web
 * chạy trong TRÌNH DUYỆT, nên nó vướng đúng bức tường mà `apps/web` đã vướng:
 *
 *   `env.schema.ts` từ chối mọi origin không phải https khi `NODE_ENV=production`, mà staging
 *   chạy đúng như vậy. Thêm `http://localhost:8081` vào `CORS_ORIGINS` của staging là làm API
 *   staging KHÔNG BOOT được — cửa chặn đó cố ý áp cho cả staging.
 *
 * Proxy này bỏ qua bức tường mà KHÔNG đụng gì tới staging: với trình duyệt mọi thứ là
 * same-origin (`localhost:8081`), nên không có CORS. Chặng `Metro → staging` là server-to-server,
 * nơi CORS không tồn tại. Đây là bản song sinh của `apps/web/src/app/api/stg/[...path]/route.ts`,
 * chỉ khác một điểm: app native xác thực bằng Bearer (ADR 0017) nên KHÔNG có cookie phiên để
 * viết lại — toàn bộ phần `Set-Cookie` của bản web không có lý do tồn tại ở đây.
 *
 * CÁCH DÙNG — trong `apps/mobile/.env`:
 *
 *     STG_PROXY_TARGET="https://api-stg.xeprime.vn"
 *     EXPO_PUBLIC_API_URL="/api/stg"
 *
 * `EXPO_PUBLIC_API_URL` bắt đầu bằng `/` nghĩa là "đường dẫn trên chính Metro dev server"
 * (`src/lib/api-base-url.ts`), nên MỘT giá trị chạy được cả ba nền tảng: web dùng
 * `http://localhost:8081/api/stg`, máy thật/emulator dùng `http://<host Metro>:8081/api/stg`.
 *
 * KHÔNG DÙNG ĐƯỢC CHO:
 *  • Đăng nhập Google/Facebook trên web — vòng OAuth kết thúc bằng deep link về app, không phải
 *    về tab trình duyệt. Dùng mật khẩu hoặc OTP (staging đang `OTP_MODE=mock`).
 *  • Giữ phiên qua lần tải lại trang — bản web CỐ Ý không lưu refresh token (`secure-storage.ts`,
 *    ADR 0017), nên F5 là đăng nhập lại. Đó là giới hạn sẵn có, proxy không liên quan.
 */

const PROXY_PREFIX = '/api/stg';

/** `host` phải để `fetch` tự đặt theo đích, nếu không Caddy nhận `Host: localhost:8081` và không
 * biết định tuyến cho site nào. `origin`/`referer` bị bỏ vì chặng này là server-to-server: giữ
 * lại thì middleware CORS của Nest thấy một origin lạ và có thể từ chối — đúng thứ proxy sinh ra
 * để tránh. */
const STRIP_REQUEST_HEADERS = ['host', 'connection', 'origin', 'referer', 'content-length'];

/** `fetch` đã giải nén sẵn thân phản hồi. Chuyển tiếp `content-encoding: gzip` kèm nội dung đã
 * giải nén là bảo trình duyệt giải nén lần thứ hai — nó hỏng ở đúng byte đầu tiên. */
const STRIP_RESPONSE_HEADERS = ['content-encoding', 'content-length', 'transfer-encoding'];

function sendJson(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.byteLength),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function forward(req, res, target) {
  // `req.url` của Metro luôn là đường dẫn tương đối; base chỉ để `URL` chịu parse.
  const incoming = new URL(req.url, 'http://localhost');
  const url = new URL(target + incoming.pathname.slice(PROXY_PREFIX.length) + incoming.search);

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || STRIP_REQUEST_HEADERS.includes(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  let upstream;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? await readBody(req) : undefined,
      // `manual`: giữ nguyên 3xx để CLIENT quyết định đi đâu, thay vì nuốt mất chặng chuyển
      // hướng và trả về một trang HTML lạ.
      redirect: 'manual',
    });
  } catch (cause) {
    sendJson(res, 502, {
      error: {
        code: 'STG_PROXY_UNREACHABLE',
        message: `Không gọi được ${target}: ${cause instanceof Error ? cause.message : 'lỗi mạng'}`,
      },
    });
    return;
  }

  const responseHeaders = {};
  for (const [name, value] of upstream.headers) {
    if (STRIP_RESPONSE_HEADERS.includes(name)) continue;
    responseHeaders[name] = value;
  }

  res.writeHead(upstream.status, responseHeaders);
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

/**
 * Trả về middleware connect-style. Đọc `STG_PROXY_TARGET` lúc CÓ REQUEST chứ không lúc nạp
 * module: Expo nạp `.env` ở một thời điểm khác với lúc đọc `metro.config.js`, và phụ thuộc vào
 * thứ tự đó là một lỗi chỉ hiện ra trên máy người khác.
 */
function createStgProxyMiddleware(nextMiddleware) {
  return function stgProxyMiddleware(req, res, next) {
    const path = (req.url ?? '').split('?')[0];
    if (path !== PROXY_PREFIX && !path.startsWith(`${PROXY_PREFIX}/`)) {
      return nextMiddleware(req, res, next);
    }

    const target = process.env.STG_PROXY_TARGET?.replace(/\/+$/, '');
    if (!target) {
      sendJson(res, 500, {
        error: {
          code: 'STG_PROXY_NOT_CONFIGURED',
          message:
            'Thiếu STG_PROXY_TARGET trong apps/mobile/.env. Ví dụ: STG_PROXY_TARGET=https://api-stg.xeprime.vn',
        },
      });
      return undefined;
    }

    // Middleware của connect không await được: lỗi lọt ra ngoài promise sẽ treo request thay vì
    // trả lỗi, và người dùng chỉ thấy app quay mãi.
    forward(req, res, target).catch((cause) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      sendJson(res, 502, {
        error: {
          code: 'STG_PROXY_UNREACHABLE',
          message: cause instanceof Error ? cause.message : 'lỗi proxy không xác định',
        },
      });
    });
    return undefined;
  };
}

module.exports = { createStgProxyMiddleware, PROXY_PREFIX };
