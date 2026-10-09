// 신호 API 호출 확인 스크립트 (게이트 1용)
//
// 준비:
//   export DATA_GO_KR_KEY="포털의 Decoding 인증키"   (Windows PowerShell: $env:DATA_GO_KR_KEY="...")
//
// 사용:
//   node check-signal.mjs crsrd_map_info              교차로 맵 정보
//   node check-signal.mjs tl_drct_info                신호잔여시간 정보
//   node check-signal.mjs crsrd_map_info key=value    추가 파라미터는 key=value로 붙임
//   node check-signal.mjs crsrd_map_info --refresh    캐시를 무시하고 새로 호출
//
// 파라미터 이름(교차로 ID, 지자체 코드 등)은 포털의 활용가이드나 "미리보기"에서 확인해서
// key=value로 붙이면 된다. 같은 요청은 cache/ 폴더에 저장해 두고 재사용해서 일 5,000건 한도를 아낀다.
// 인증키는 코드에 넣지 말고 환경변수로만 쓴다.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BASE = 'https://apis.data.go.kr/B551982/rti';
const key = process.env.DATA_GO_KR_KEY;

if (!key) {
  console.error('DATA_GO_KR_KEY 환경변수를 먼저 설정하세요.');
  process.exit(1);
}

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const [endpoint, ...rest] = args.filter((a) => a !== '--refresh');

if (!endpoint) {
  console.error('사용법: node check-signal.mjs <crsrd_map_info | tl_drct_info> [key=value ...] [--refresh]');
  process.exit(1);
}

const extra = Object.fromEntries(
  rest
    .filter((a) => a.includes('='))
    .map((a) => {
      const i = a.indexOf('=');
      return [a.slice(0, i), a.slice(i + 1)];
    }),
);

// 기본 파라미터. 이름이 포털 문서와 다르면 key=value로 덮어쓴다.
const query = { pageNo: '1', numOfRows: '10', type: 'JSON', ...extra };

const params = new URLSearchParams({ serviceKey: key, ...query });
const url = `${BASE}/${endpoint}?${params}`;
const maskedUrl = url.replace(key, '***');

// 캐시 이름에는 인증키를 넣지 않는다.
const hash = createHash('sha1')
  .update(endpoint + JSON.stringify(query))
  .digest('hex')
  .slice(0, 10);
const cacheFile = `cache/${endpoint}-${hash}.txt`;

let status = 'cache';
let body;

try {
  if (refresh) throw new Error('refresh');
  body = await readFile(cacheFile, 'utf8');
} catch {
  console.log(`호출: ${maskedUrl}`);
  const res = await fetch(url);
  status = String(res.status);
  body = await res.text();
  if (res.ok) {
    await mkdir('cache', { recursive: true });
    await writeFile(cacheFile, body);
  }
}

console.log(`상태: ${status}`);

let data;
try {
  data = JSON.parse(body);
} catch {
  console.log('JSON이 아닌 응답입니다. 인증키나 파라미터 오류 메시지일 수 있어요. 앞부분:');
  console.log(body.slice(0, 600));
  process.exit(0);
}

// 응답 안에서 처음 나오는 배열(목록)을 찾아 앞 3개를 보여준다.
function findList(node) {
  if (Array.isArray(node)) return node;
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) {
      const found = findList(value);
      if (found) return found;
    }
  }
  return null;
}

console.log('최상위 키:', Object.keys(data).join(', '));

const list = findList(data);
if (!list) {
  console.log('목록을 찾지 못했어요. 전체 응답:');
  console.log(JSON.stringify(data, null, 2).slice(0, 1500));
} else {
  console.log(`항목 ${list.length}개 중 앞 3개:`);
  console.log(JSON.stringify(list.slice(0, 3), null, 2));
}
