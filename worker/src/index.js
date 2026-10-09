// NAGAGO 신호 API 프록시 (Cloudflare Worker)
//
// 하는 일: 브라우저 대신 공공데이터포털 신호 API를 호출하고, 응답을 잠시 캐싱한다.
// 인증키는 코드에 넣지 않는다. Cloudflare의 "변수 및 시크릿"에 DATA_GO_KR_KEY로 추가한다.
// (선택) ALLOWED_ORIGIN 변수에 프론트 주소를 넣으면 그 주소에서만 호출할 수 있다.
//
// 호출 예:
//   GET /api/health
//   GET /api/signal/crsrd_map_info?stdgCd=1100000000&pageNo=1&numOfRows=1000
//   GET /api/signal/tl_drct_info?...   (파라미터 이름은 포털의 활용가이드 기준)

const UPSTREAM = 'https://apis.data.go.kr/B551982/rti';

// 허용하는 API와 캐시 시간(초). 목록에 없는 경로는 막는다.
const ROUTES = {
  crsrd_map_info: 86400, // 교차로 목록은 거의 안 바뀌므로 하루
  tl_drct_info: 5, // 실시간 잔여시간은 5초만 재사용
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, cors);
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, hasKey: Boolean(env.DATA_GO_KR_KEY) }, 200, cors);
    }

    const match = url.pathname.match(/^\/api\/signal\/([a-z_]+)$/);
    const fn = match && match[1];
    if (!fn || !Object.hasOwn(ROUTES, fn)) {
      return json({ error: 'not found' }, 404, cors);
    }
    if (!env.DATA_GO_KR_KEY) {
      return json({ error: 'server key not set' }, 500, cors);
    }

    // 사용자가 보낸 파라미터를 그대로 넘기되, 인증키는 서버 것만 쓴다.
    const query = new URLSearchParams(url.searchParams);
    query.delete('serviceKey');
    if (!query.has('type')) query.set('type', 'JSON');
    if (Number(query.get('numOfRows')) > 1000) query.set('numOfRows', '1000');
    query.sort();

    // 캐시 키에는 인증키가 들어가지 않는다.
    const cacheKey = new Request(`https://cache.nagago.local/${fn}?${query}`);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      return withHeaders(cached, { ...cors, 'X-Cache': 'HIT' });
    }

    const upstreamUrl = `${UPSTREAM}/${fn}?${new URLSearchParams({ serviceKey: env.DATA_GO_KR_KEY })}&${query}`;
    let upstream;
    try {
      upstream = await fetch(upstreamUrl);
    } catch {
      return json({ error: 'upstream unreachable' }, 502, cors);
    }

    const body = await upstream.text();
    const response = new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ROUTES[fn]}`,
      },
    });

    if (upstream.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return withHeaders(response, { ...cors, 'X-Cache': 'MISS' });
  },
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    };
  }
  return {};
}

function withHeaders(response, extra) {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

function json(data, status, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
