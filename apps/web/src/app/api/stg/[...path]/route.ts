import type { NextRequest } from 'next/server';

/**
 * Proxy DEV: cho `localhost:3000` dùng API + database của môi trường staging.
 *
 * VÌ SAO CẦN NÓ. Gọi thẳng `https://api-stg.xeprime.vn` từ `localhost` vướng hai bức tường, cả
 * hai đều là quyết định cố ý ở nơi khác:
 *
 *  1. CORS — `env.schema.ts` từ chối mọi origin không phải https khi `NODE_ENV=production`, mà
 *     staging chạy đúng như vậy. Thêm `http://localhost:3000` vào `CORS_ORIGINS` là làm API
 *     staging KHÔNG BOOT được.
 *  2. Cookie phiên — `session.service.ts` đặt cứng `sameSite: 'lax'`. Request từ origin
 *     `localhost` sang `xeprime.vn` là cross-site, và Lax chặn cookie ở request không phải điều
 *     hướng. Đổi sang `'none'` thì cookie thành cookie-bên-thứ-ba: Safari chặn thẳng, Firefox
 *     phân vùng, Chrome đang siết — sửa code, hạ mức chống CSRF, mà vẫn có thể không đăng nhập
 *     được.
 *
 * Proxy này bỏ qua cả hai mà KHÔNG đụng gì tới staging: với trình duyệt, mọi thứ là same-origin
 * (`localhost:3000`), nên không có CORS và không có cookie cross-site. Chặng `localhost → staging`
 * là server-to-server, nơi CORS không tồn tại.
 *
 * CÁCH DÙNG — trong `.env` ở gốc repo:
 *
 *     NEXT_PUBLIC_API_URL=http://localhost:3000/api/stg
 *     STG_PROXY_TARGET=https://api-stg.xeprime.vn
 *
 * rồi `pnpm --filter @xeprime/web dev`. Không cần Docker, không cần Postgres, không cần API local.
 *
 * KHÔNG DÙNG ĐƯỢC CHO: đăng nhập Google/Facebook. Vòng OAuth kết thúc bằng redirect tới
 * `APP_WEB_URL` của staging (`https://stg.xeprime.vn`), không phải localhost. Ở local dùng đăng
 * nhập mật khẩu hoặc OTP — staging đang `OTP_MODE=mock` nên mã trả luôn trong response.
 *
 * Upload ảnh cũng không đi qua đây: trình duyệt `PUT` thẳng lên R2 bằng presigned URL. Muốn
 * upload từ local thì thêm `http://localhost:3000` vào CORS policy của hai bucket R2.
 */

/** Không bao giờ trả về bản dựng tĩnh: mỗi request phải đi thật sang staging. */
export const dynamic = 'force-dynamic';

const TARGET = process.env.STG_PROXY_TARGET?.replace(/\/+$/, '');

/**
 * Header không được chuyển tiếp NGUYÊN VẸN lên staging.
 *
 * `host` phải để `fetch` tự đặt theo đích, nếu không Caddy nhận `Host: localhost:3000` và không
 * biết định tuyến cho site nào.
 *
 * `origin` và `referer` bị bỏ vì chặng này là server-to-server: giữ lại thì middleware CORS của
 * Nest thấy một origin lạ và có thể từ chối — đúng thứ proxy sinh ra để tránh.
 */
const STRIP_REQUEST_HEADERS = ['host', 'connection', 'origin', 'referer', 'content-length'];

/**
 * `fetch` đã giải nén sẵn thân phản hồi. Chuyển tiếp `content-encoding: gzip` kèm nội dung đã
 * giải nén là bảo trình duyệt giải nén lần thứ hai — nó sẽ hỏng ở đúng byte đầu tiên.
 * `content-length` cũng sai theo, và `transfer-encoding` là chuyện của tầng dưới.
 */
const STRIP_RESPONSE_HEADERS = ['content-encoding', 'content-length', 'transfer-encoding'];

/**
 * Viết lại một `Set-Cookie` của staging cho vừa với localhost.
 *
 * Đây là phần LÕI của proxy. API staging phát cookie kèm `Domain=.xeprime.vn` và `Secure`:
 *
 *  • `Domain=.xeprime.vn` — trình duyệt VỨT BỎ cookie này khi nó đến từ phản hồi của
 *    `localhost`, vì tên miền không khớp. Bỏ thuộc tính đó đi thì nó thành cookie host-only của
 *    chính localhost, và mọi request sau đó mang nó theo.
 *  • `Secure` — localhost chạy http, nên cookie Secure không bao giờ được gửi lại.
 *
 * Giữ nguyên `HttpOnly` (ADR 0002: JS không được đọc cookie phiên) và `SameSite=Lax` — giờ mọi
 * thứ là same-origin nên Lax không cản gì.
 */
function rewriteSetCookie(raw: string): string {
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const name = part.split('=')[0]?.toLowerCase();
      return name !== 'domain' && name !== 'secure';
    })
    .join('; ');
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  // Chốt chặn cứng. Route này chỉ tồn tại cho máy dev; có mặt trong một bản dựng production là
  // một đường vòng qua CORS mà không ai chủ đích mở.
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }

  if (!TARGET) {
    return Response.json(
      {
        error: {
          code: 'STG_PROXY_NOT_CONFIGURED',
          message:
            'Thiếu STG_PROXY_TARGET trong .env. Ví dụ: STG_PROXY_TARGET=https://api-stg.xeprime.vn',
        },
      },
      { status: 500 },
    );
  }

  const { path } = await context.params;
  const url = new URL(`${TARGET}/${path.join('/')}`);
  url.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  for (const name of STRIP_REQUEST_HEADERS) headers.delete(name);

  const method = request.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      // `manual`: giữ nguyên 3xx để TRÌNH DUYỆT quyết định đi đâu. Tự đi theo redirect ở đây sẽ
      // nuốt mất chặng chuyển hướng sang Google của luồng OAuth và trả về một trang HTML lạ.
      redirect: 'manual',
    });
  } catch (cause) {
    return Response.json(
      {
        error: {
          code: 'STG_PROXY_UNREACHABLE',
          message: `Không gọi được ${TARGET}: ${cause instanceof Error ? cause.message : 'lỗi mạng'}`,
        },
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const name of STRIP_RESPONSE_HEADERS) responseHeaders.delete(name);

  // `getSetCookie()` trả về TỪNG cookie riêng. Đọc bằng `headers.get('set-cookie')` sẽ nối nhiều
  // cookie thành một chuỗi ngăn bằng dấu phẩy, mà giá trị cookie cũng có thể chứa dấu phẩy —
  // tách lại là đoán mò.
  const cookies = upstream.headers.getSetCookie();
  if (cookies.length > 0) {
    responseHeaders.delete('set-cookie');
    for (const cookie of cookies) responseHeaders.append('set-cookie', rewriteSetCookie(cookie));
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
