# 개발과 운영

[문서 목차](README.md) · [구조와 데이터 모델](architecture.md) · [Proposal 협업](proposals.md)

명령은 저장소 루트에서 실행합니다. 환경 변수는 [.env.example](../.env.example), 실행 명령은 [package.json](../package.json), CI의 서비스·검증 구성은 [ci.yml](../.github/workflows/ci.yml)을 기준으로 확인합니다. 아래는 코드·설정에 따른 절차이며 서버 기동·DB 마이그레이션·배포를 수행한 결과가 아닙니다.

## 로컬 준비

Node.js 20.9 이상, npm, PostgreSQL 16, S3 호환 저장소가 필요합니다. CI는 Node 20과 PostgreSQL 16, MinIO를 사용합니다.

```sh
cp .env.example .env
npm ci
npx prisma generate
```

PowerShell의 파일 복사는 `Copy-Item .env.example .env`입니다. 기존 설정 파일이 있으면 덮어쓰지 말고 필요한 항목을 대조합니다. `.env*`는 `.env.example`을 제외하고 git에서 무시됩니다.

### 환경 변수

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | 앱·Prisma가 사용할 PostgreSQL 연결 |
| `BETTER_AUTH_SECRET` | 인증용 비밀값. 예제의 placeholder를 실제 운영값으로 사용하지 않음 |
| `BETTER_AUTH_URL` | 사용자가 접근하는 앱 기준 URL |
| `ADMIN_EMAILS` | 관리자 접근을 허용할 이메일, 쉼표 구분 |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | 둘 다 있을 때 GitHub OAuth 활성화 |
| `S3_ENDPOINT` | MinIO·R2 등 호환 서비스 주소. 앱에서 지정하면 path-style 사용 |
| `S3_REGION`, `S3_BUCKET` | 저장 지역과 비공개 버킷 |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | 저장소 인증. 앱은 두 값이 없으면 AWS SDK 기본 자격 증명 경로 사용 |
| `TEST_DATABASE_URL` | Revision DB 통합 테스트용 별도 연결 |
| `RUN_PROPOSAL_CONCURRENCY_TEST=1` | Project 행 잠금 경합 테스트 활성화. `DATABASE_URL`도 필요 |
| `E2E_INTEGRATION=1` | 실제 PostgreSQL·S3를 사용하는 MVP 브라우저 테스트 활성화 |
| `PLAYWRIGHT_BASE_URL` | 이미 실행 중인 테스트 서버 사용. 없으면 Playwright가 dev 서버 실행 |

Next.js는 `.env.local`도 읽지만 Prisma CLI·일반 Node 스크립트·독립 테스트가 같은 방식으로 읽는다고 가정하지 않습니다. 이 문서에서는 Next.js와 Prisma에 `.env`를 사용하고, 독립 Node 명령은 `--env-file=.env`로 명시합니다. 기존 프로세스 환경 변수와 파일 값이 다르면 실제 전달 값을 확인하세요.

### DB·스토리지·앱

`DATABASE_URL`이 가리키는 로컬 개발 DB를 먼저 준비합니다. 예제 계정은 로컬 테스트용입니다. 저장소에 이미 마이그레이션 이력이 있으므로 초기 설치에서도 기존 이력을 적용합니다.

```sh
npx prisma migrate deploy
```

로컬 MinIO가 필요한 경우 CI와 같은 이미지로 실행할 수 있습니다.

```sh
docker run --detach --rm --name odr-docs-minio --publish 9000:9000 --env MINIO_ROOT_USER=minioadmin --env MINIO_ROOT_PASSWORD=minioadmin docker.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z server /data
node --env-file=.env scripts/prepare-test-storage.mjs
npm run dev
```

이 MinIO 예시는 볼륨이 없는 일회용 개발 환경입니다. 이미 운영 중인 저장소가 있다면 새 컨테이너를 만들 필요가 없습니다. 준비 스크립트는 버킷이 없을 때만 생성하며, 다른 오류는 실패로 반환합니다. 앱은 `http://localhost:3000`, 로그인은 `/login`에서 확인합니다. 정리는 앱에서 Ctrl+C, 이 예시 컨테이너는 `docker stop odr-docs-minio`입니다.

## 검증 명령과 실제 범위

| 명령 | 검증 범위 |
| --- | --- |
| `npm test` | Vitest 전체 탐색. 환경 조건이 없는 단위·라우트 테스트 중심 |
| `npx tsc --noEmit` | TypeScript 타입 검사. Prisma Client 선행 생성 필요 |
| `npm run build` | Prisma Client 생성 후 Next.js 프로덕션 빌드 |
| `npm run test:e2e` | Playwright Chromium. 실제 서비스 시나리오는 `E2E_INTEGRATION` 필요 |
| `npx prisma migrate status` | 대상 DB의 마이그레이션 적용 상태 확인 |

`npm test` 성공에 DB·스토리지·브라우저 검증이 모두 포함된다고 해석하지 않습니다. `TEST_DATABASE_URL`이 없으면 Revision DB 통합 테스트가 SKIP되고, Proposal 경합 테스트는 플래그와 DB 연결이 모두 필요합니다. CI에서는 `TEST_DATABASE_URL`이 없으면 테스트가 오류를 냅니다.

### DB 통합 검사

개발·운영 DB와 분리한 테스트 DB에 마이그레이션을 먼저 적용합니다. 아래 두 검사는 목적이 다릅니다.

POSIX 셸:

```sh
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/open_design_registry_test'
export TEST_DATABASE_URL="$DATABASE_URL"
export RUN_PROPOSAL_CONCURRENCY_TEST=1
npx prisma migrate deploy
npm test -- prisma/revision.integration.test.ts src/lib/proposal-concurrency.integration.test.ts
```

PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/open_design_registry_test'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:RUN_PROPOSAL_CONCURRENCY_TEST = '1'
npx prisma migrate deploy
npm test -- prisma/revision.integration.test.ts src/lib/proposal-concurrency.integration.test.ts
```

두 URL은 동일한 격리 테스트 DB를 가리키도록 맞춥니다. Revision 테스트는 동시 발행·원본 XOR·불변성 제약을 검증합니다. Proposal 경합 테스트는 **Project 행을 공유하는 두 상태 작성자의 잠금 순서**를 검증하며, 실제 Apply HTTP 요청 전체의 동시 실행을 검증하는 것은 아닙니다. 테스트 데이터가 남을 수 있으므로 일회용 테스트 DB를 사용합니다.

### 브라우저 통합 검사

Design Request의 참여 의향은 공개·열린 요청에서 여러 사용자가 독립적으로 등록·철회하는 관계입니다. `POST /api/issues/[id]/participation`은 신규 201, 재요청 200, 닫힌 요청 409를 반환합니다. `DELETE`는 본인 기록만 철회하며 이미 없거나 닫힌 요청에서도 멱등 204입니다. 비가시·일반 Issue는 404, 미인증은 401입니다. 요청 종료는 같은 Issue 행 잠금과 트랜잭션에서 참여를 삭제하며 재오픈해도 복원하지 않습니다.

`TEST_DATABASE_URL`을 설정한 `npm test`는 `src/lib/design-request-participation-race.integration.test.ts`의 실제 PostgreSQL 가입·종료 경합도 실행합니다. `E2E_INTEGRATION=1`의 `e2e/design-request-participation.integration.spec.ts`는 익명 표시, 이름 공개 안내, 모바일·키보드 등록/철회, 두 참가자, 종료/재오픈을 확인합니다. CI에서 화면 증거는 `participation-screenshots` artifact로 제공됩니다.

`.env`에 테스트 DB·스토리지 설정을 맞춥니다. [Playwright 설정](../playwright.config.ts)의 기본 주소는 `http://127.0.0.1:3000`이므로 브라우저 통합 검사에서는 `BETTER_AUTH_URL`도 이 값으로 맞춥니다. `.env.example`의 로컬 개발 기본값인 `http://localhost:3000`을 그대로 두지 않습니다. `PLAYWRIGHT_BASE_URL`로 기존 서버를 지정하면 인증 URL과 서버의 DB·스토리지 설정도 해당 서버에 맞춥니다.

```sh
npx prisma migrate deploy
node --env-file=.env scripts/prepare-test-storage.mjs
npx playwright install chromium
```

`.env`에 `E2E_INTEGRATION=1`을 추가하거나 현재 셸 환경 변수로 설정한 뒤 실행합니다.

```sh
node --env-file=.env scripts/run-playwright.mjs
```

기존 서버를 재사용하면 그 서버의 DB·스토리지 설정이 이번 테스트 설정과 같은지 확인합니다. [MVP 통합 시나리오](../e2e/mvp.integration.spec.ts)는 가입·프로젝트·Revision·복원·Issue·Fork 외에 공개 Design request → 로그인 복귀 → Fork → 수정본 발행 → Proposal → 수정 요청 → 새 Proposal → 승인·적용을 실제 DB·스토리지로 검증합니다. 데스크톱·모바일에서 단계별 안내와 결과 링크도 확인합니다. **이 한 흐름으로 모든 충돌·부분 적용·동시성 조합이나 실제 신규 디자이너의 이해도까지 검증됐다고 확대 해석하지 않습니다.**

### 실제 서비스 검사와 fixture 검사

`E2E_INTEGRATION=1`은 [인증](../e2e/auth.spec.ts), [Landing·Explore](../e2e/landing-explore.integration.spec.ts), [MVP 협업](../e2e/mvp.integration.spec.ts)의 실제 DB·스토리지 시나리오를 활성화합니다. 다른 UI 회귀 파일은 fixture·요청 mock·정적 화면 등을 사용합니다. 같은 Playwright 명령으로 실행하더라도 fixture 통과와 실제 서비스 통합 검증을 구별합니다.

### CI 구성과 확인할 범위

일반 PR의 opened·reopened·synchronize 이벤트와 Draft를 ready for review로 바꾸는 이벤트는 PR 제목 형식, test·typecheck·build·e2e를 검사합니다. PR 제목·본문 등 메타데이터 수정은 CI를 다시 실행하지 않습니다. 제목 검사는 다음 PR 실행 시 새 제목을 검사합니다. test 작업에는 PostgreSQL과 `TEST_DATABASE_URL`이 있어 Revision DB 테스트가 활성화되며, `RUN_PROPOSAL_CONCURRENCY_TEST: "1"`로 Proposal·Canvas 트랜잭션 테스트도 실행합니다.

전체 Playwright E2E는 PR·`main` push·`workflow_dispatch`에서 격리 PostgreSQL·MinIO와 브라우저를 준비해 실행합니다. PR 로그에서 checkout한 SHA와 브라우저 테스트의 passed·skipped·failed 결과를 확인합니다. PR E2E가 skipped 또는 실패했다면 성공으로 취급하지 않습니다. 높은 위험 변경은 병합 전에 실제 브라우저 검증 범위가 요구사항을 포함하는지 확인하고, 별도 수동 실행도 최신 PR SHA를 지정해 수행합니다. main 실행 결과는 병합 후 검증이며 병합 전 검증을 대신하지 않습니다.

이 워크플로가 기본 브랜치에 반영된 뒤 GitHub Actions의 CI → Run workflow에서 `ref`에 검증할 PR의 최신 커밋 SHA를 입력하거나 다음 명령을 사용합니다.

```sh
gh workflow run ci.yml --repo makesomethingshit/open-design-registry -f ref=<PR_HEAD_SHA>
```

수동 실행의 test·typecheck·build·e2e는 모두 지정한 ref를 checkout합니다. 실행 로그의 checkout SHA가 검토한 PR HEAD와 같은지 확인하고, 모든 검사가 통과했는지 따로 확인합니다. 수동 실행은 PR 체크에 자동 연결되지 않으므로 PR 본문에 검증 SHA와 Actions run 링크를 기록합니다. 이후 HEAD가 바뀌면 다시 실행합니다. PR·push·수동 실행의 concurrency 그룹을 분리해 수동 검증이 PR 기본 검사를 취소하지 않게 합니다.

E2E는 격리 PostgreSQL·MinIO와 테스트 버킷을 준비하고 `E2E_INTEGRATION=1`로 실행합니다. CI의 Playwright worker는 2개이며 실패 테스트는 최대 1회 재시도합니다. line 로그와 HTML/JSON 결과는 failed·flaky·passed를 구분합니다. 프로젝트 문서에는 수동 검증용 이미지 정리 DB 테스트도 포함합니다. 브라우저 보고서와 실패 trace에는 세션 토큰이 포함될 수 있어 CI artifact로 업로드하지 않습니다. Actions의 line 로그에서 실패·재시도 결과를 확인하고, 상세 trace가 필요하면 같은 SHA를 격리된 로컬 테스트 환경에서 재현합니다. 로컬 보고서·trace도 공개 첨부 전에 인증 정보와 개인정보를 제거해야 합니다. 최종 실패는 job 실패로 남으며 무시하지 않습니다.

현재 브라우저 서버는 `next dev`를 유지합니다. timeout이 발생하면 테스트명·원인 로그·trace로 서버 시작 지연, 컴파일 또는 실제 요청 지연을 구분합니다. 개발 서버가 원인으로 확인되면 별도 검증 후 production build와 `next start` 실행을 검토합니다.

CI가 구성한 검사 범위와 특정 커밋에서 실제 통과한 결과를 구분합니다. UI fixture나 잠금 경합 테스트의 통과만으로 모든 실제 Apply 요청의 동시 실행·DB 롤백·브라우저 상태가 검증됐다고 판단하지 않습니다.

## 운영 전 확인

### 미참조 문서 이미지 정리

문서 에디터 업로드는 본문 저장 전에 객체를 생성합니다. 취소·부분 업로드 실패·본문에서 제거한 이미지는 다음 수동 명령으로 정리합니다. 기본은 **dry-run**, 기본 유예 기간은 7일이며 최소 24시간입니다. 운영 DB/S3 설정으로 dry-run 결과를 먼저 확인하고, 유지할 오래된 초안은 본문에 저장하거나 별도로 보관합니다.

```sh
node --env-file=.env scripts/document-image-cleanup.mjs
node --env-file=.env scripts/document-image-cleanup.mjs --apply
node --env-file=.env scripts/document-image-cleanup.mjs --grace-hours 336
```

정리 범위는 서버가 생성한 `project-documents/<projectId>/<UUID>.png|jpg` key뿐입니다. 객체 생성 시각이 유예 기간을 넘고, 저장된 모든 프로젝트 문서·커버·Revision 원본·preview·Proposal 변경 자산·권리 선언에서 참조하지 않을 때만 삭제합니다. 공개 여부는 삭제 기준이 아닙니다. 다른 프로젝트의 참조와 코드 예제의 참조도 보수적으로 보존합니다. 프로젝트가 삭제된 후 남은 이미지도 같은 기준을 적용합니다.

삭제 직전 DB 참조와 S3의 현재 수정 시각을 재확인합니다. 객체별 트랜잭션에서 문서 저장과 공통 advisory lock을 잡고 참조 테이블의 쓰기를 잠시 차단하므로 **트래픽이 낮은 시간에 실행**하세요. apply는 `DocumentImageDeletion`에 삭제 의도를 먼저 커밋한 뒤 S3 삭제를 실행합니다. 삭제 응답이 유실되거나 실패해도 해당 key의 늦은 저장은 거부되며, 다음 실행은 남은 객체 삭제를 재시도합니다. marker는 프로젝트 삭제 뒤에도 유지합니다. 삭제 실패는 key별 JSON 로그와 종료 코드 1로 보고합니다. dry-run은 marker를 쓰지 않으며 같은 참조 재확인을 적용합니다. S3 객체 삭제는 DB rollback으로 복구되지 않으므로 먼저 백업·dry-run을 확인해야 합니다.

본문 저장뿐 아니라 Revision 원본 URL·권리 선언의 sourceUrl, licenseUrl, sourceLicenseUrl 저장도 공통 shared advisory lock을 먼저 얻고 삭제 marker와 S3 객체 존재를 확인합니다. 정리가 먼저 완료된 오래된 초안을 늦게 저장하면 API가 409와 이미지 재업로드 안내를 반환합니다. 저장이 먼저 커밋되면 정리는 그 참조를 확인해 이미지를 보존합니다. 기존 절대 객체 URL과 asset API URL은 같은 key로 정규화하며 query·fragment·동등한 percent encoding을 허용합니다.

참조 검사는 DB에서 동등한 key encoding을 필터링하고 후보 URL만 정규화하므로 객체마다 모든 문서 본문을 내려받지 않습니다. AWS 객체 URL은 regional virtual-hosted·path-style 형식을 인식합니다. 절대 asset API URL은 `BETTER_AUTH_URL`과 origin이 같을 때만 로컬 객체로 취급하며, 다른 사이트의 이미지는 로컬 S3에서 검사하지 않습니다. 이미지 참조 저장 트랜잭션은 최대 60초이며, S3 HEAD는 최대 8개씩 병렬 실행하고 전체 25초 제한을 공유합니다. 상시 worker·자동 타이머는 추가하지 않습니다.

격리 테스트 DB·스토리지에서 `RUN_DOCUMENT_IMAGE_CLEANUP_TEST=1 npx vitest run scripts/document-image-cleanup.integration.test.mjs`로 실제 객체 보존·삭제, 본문·권리 선언 저장과 정리의 양방향 경합, 잠금 대기 후 저장을 검증할 수 있습니다. CI의 e2e 작업은 PostgreSQL·MinIO 준비 후 이 테스트도 실행합니다.

1. 배포할 커밋 SHA와 환경을 고정하고 해당 코드의 마이그레이션 상태를 확인합니다. 테스트 기록의 SHA와 다르면 같은 결과로 취급하지 않습니다.
2. DB와 S3 객체를 함께 복구할 수 있는 백업을 확보하고 격리 환경에서 마이그레이션을 검증합니다. `prisma db push`는 SQL 트리거를 포함한 마이그레이션 이력의 대체가 아닙니다.
3. 로그인·공개/비공개 자산 접근·Revision 발행·Fork·Proposal 리뷰·선택 적용을 확인합니다. 원본 key·캐시로 비공개 접근이 우회되지 않아야 합니다.
4. stale·충돌·CHECK_UNAVAILABLE·부분 적용 후 재검토·409 복구를 확인합니다. mock 기반 통과와 실제 DB 행 롤백·브라우저 포커스 검증을 구별합니다.
5. 배포 후 `npm run build` 산출물을 `npm start`로 실행하는 환경의 로그와 오류를 확인합니다. 배포 성공 여부는 코드 병합 이력만으로 판단하지 않습니다.

### Release 발행 재시도

Release 발행 API는 선택적 UUID `requestId`를 받습니다. 같은 프로젝트·발행자·ID와 동일한 title/description/Revision 선택의 재전송은 기존 Release ID·number를 200으로 반환하고 알림을 다시 만들지 않습니다. 같은 ID에 다른 내용은 409, 새로운 ID는 같은 내용도 새 Release로 발행합니다. ID를 보내지 않거나 null로 보내는 기존 호출은 종전처럼 매번 발행합니다. 폼은 응답 유실 후 변경 없는 재시도에서 ID를 유지하며 내용을 편집하면 새 발행 의도로 ID를 갱신합니다. 이전 발행의 성공 여부가 불명확하면 내용 편집 전에 같은 폼으로 재시도하세요.

`TEST_DATABASE_URL`이 있는 `npm test`는 `src/lib/release-idempotency.integration.test.ts`의 동시 발행·알림·재시도·409 경합을 실행합니다. `E2E_INTEGRATION=1`의 `e2e/release-idempotency.integration.spec.ts`는 DB commit 뒤 HTTP 응답만 중단하고 같은 ID 재시도로 Release 하나에 도착하는 실제 브라우저 흐름을 검증합니다.

## 문제를 만났을 때

| 증상 | 우선 확인 |
| --- | --- |
| Prisma에서 DB 변수를 찾지 못함 | `.env` 또는 프로세스 환경에 `DATABASE_URL`이 있는지. `.env.local`만 수정했는지 |
| 자산이 404 | 프로젝트 가시성·세션·DB 참조·저장 객체 존재. 비공개 차단과 객체 누락을 구별 |
| Proposal을 상대가 볼 수 없음 | source가 비공개인지, base·source가 발행 상태인지 |
| 선택 적용 409 | 최신 Revision 재조회, 승인·충돌·대상 ID·미리보기 매핑·최소 1유닛 조건 |
| checksum 없는 기존 유닛이 막힘 | `CHECK_UNAVAILABLE` 정책. 기존 데이터를 추정 보강하거나 검사를 우회하지 않음 |
| 발행된 Revision 수정 SQL 실패 | 불변성 트리거가 의도대로 차단했는지. 새 Revision 발행 경로 사용 |
| HTML 미리보기가 일부 동작하지 않음 | 스크립트·네트워크 등을 제한하는 CSP와 미리보기 형식 |
| 기여 경로 로그인 복귀 | contribute-dialog, `/contribute`, `/proposals/new`, Discussions의 로그인 유도는 원래 작업 경로를 `/login?next=...`로 전달하는지 확인 |

기여 준비와 Proposal 생성은 `/login?next=...`에 선택한 base·source Revision, 관련 요청과 선택 변경을 보존합니다. first-contributor 브라우저 시나리오에서 요청 링크의 가입 복귀와 준비된 Proposal의 재로그인 복귀를 검증합니다. Discussions 등 이 시나리오 밖의 로그인 경로는 별도 확인이 필요합니다.

관련 설정: [CI](../.github/workflows/ci.yml), [환경 예제](../.env.example), [Playwright](../playwright.config.ts), [Vitest](../vitest.config.ts), [테스트 스토리지 준비](../scripts/prepare-test-storage.mjs).

### 신고 삭제 후 moderation 복원

프로젝트 숨김과 공유 커버 차단은 별도 결정입니다. 동일 프로젝트에 다른 신고의 활성 숨김이 있으면 두 번째 숨김 요청은 409이며 해당 신고를 처리 완료로 바꾸지 않습니다. 관리자는 기존 숨김을 검토·복원한 뒤 두 번째 신고를 다시 판단합니다.

활성 결정은 신고·신고자·프로젝트 삭제만으로 해제되지 않습니다. 관리자 신고 화면의 **Retained decisions with deleted reports**에서 보존된 사유와 자산 key를 확인하고 복원합니다. 복원 API는 저장된 report ID의 hold·차단을 기준으로 동작하며 원본 신고나 현재 커버 URL을 요구하지 않습니다. 자산 복원은 해당 신고의 차단만 해제하고 다른 신고의 활성 차단은 유지합니다. 원래 비공개이거나 소유자가 비공개를 선택한 프로젝트는 공개되지 않습니다.

`ModerationEvent`는 신고 사유·상세·처리 메모를 복사해 보존합니다. 추가 마이그레이션은 남아 있는 신고 사유·상세로 기존 이벤트를 채우지만, 과거 처리 메모는 현재 결정의 메모로 추정하지 않으며, 이미 삭제된 원본 신고의 잃어버린 사유는 복구하지 못합니다. 이 경우 관리자 화면에 legacy 결정을 표시하고 남아 있는 차단 사유를 사용합니다.

### 레거시 숨김 이관과 감사 기록

이전 API는 `hide` 여부와 원래 공개 상태를 저장하지 않았습니다. `20261012000000_legacy_moderation_review`는 scope 마이그레이션 전에 처리된 RESOLVED 신고의 대상 또는 같은 커버를 쓰는 현재 비공개 프로젝트를 **레거시 검토 후보**로 보존합니다. 공개 프로젝트, 이미 활성 또는 해제된 hold가 있는 프로젝트, 새 API의 감사 이벤트가 있는 신고는 제외합니다. 원본 신고·현재 커버와 판단 근거를 감사 기록에 남기며 `wasPublic=false`로 저장하므로 관리자가 후보 hold를 해제해도 자동 공개되지 않습니다. 이후 소유자가 공개를 선택할 수 있습니다. 같은 빈 커버도 이전 API가 함께 숨겼으므로 후보가 될 수 있습니다.

이 이관은 실제 hide 결정을 확정하지 않습니다. 단순 검토된 신고, 커버 변경, 이미 삭제된 신고 때문에 과거 결정을 완전히 재구성할 수 없습니다. 관리자는 보존된 후보를 검토해야 하며, 삭제된 신고나 변경된 커버로 연결을 잃은 과거 숨김은 배포 전 별도 목록과 대조해야 합니다. 후보마다 별도 retained ID를 쓰므로 공유 커버 프로젝트도 독립적으로 해제합니다.

새 검토·기각은 각각 `REVIEW`·`DISMISS` 감사 이벤트를 남기며 반복 판단도 별도 기록합니다. 새 숨김·차단에 메모를 생략하면 이전 메모를 재사용하지 않습니다. 복원만 해당 원래 결정의 메모를 이어 받습니다. 설정 폼은 공개 체크박스를 사용자가 조작했을 때만 공개 여부를 보내므로 일반 메타데이터 저장은 moderation 복원 의도를 바꾸지 않습니다.
