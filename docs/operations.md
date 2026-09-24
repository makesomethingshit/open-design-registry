# 개발과 운영

[README](../README.md) · [구조와 데이터 모델](architecture.md) · [Proposal 협업](proposals.md)

기준: 2026-09-24, main `5d5e0fbb215e7b823f65ca6b42c206d65f7c498c`. 명령은 저장소 루트에서 실행합니다. 기존 코드·설정과 대조한 절차이며, 이번 문서 작업에서 서버 기동·DB 마이그레이션·배포를 수행하지는 않았습니다.

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

`.env`에 테스트 DB·스토리지 설정을 맞추고 앱 기준 URL도 테스트 호스트와 일치시킵니다. Playwright 기본 주소는 `http://127.0.0.1:3000`입니다.

```sh
npx prisma migrate deploy
node --env-file=.env scripts/prepare-test-storage.mjs
npx playwright install chromium
```

`.env`에 `E2E_INTEGRATION=1`을 추가하거나 현재 셸 환경 변수로 설정한 뒤 실행합니다.

```sh
node --env-file=.env node_modules/@playwright/test/cli.js test
```

기존 서버를 재사용하면 그 서버의 DB·스토리지 설정이 이번 테스트 설정과 같은지 확인합니다. 현재 `e2e/mvp.integration.spec.ts`의 통합 경로는 가입·프로젝트·Revision·복원·Issue·Fork 등 MVP 흐름입니다. **Proposal v0.5 전체가 브라우저 E2E로 검증된다고 확대 해석하지 않습니다.**

### 현재 CI에서 빠지는 것

`.github/workflows/ci.yml`은 test·typecheck·build·e2e 작업을 정의합니다. test 작업에는 PostgreSQL과 `TEST_DATABASE_URL`이 있어 Revision DB 테스트가 활성화됩니다. **test 작업에는 `RUN_PROPOSAL_CONCURRENCY_TEST: "1"`이 설정되어 있어 Proposal 경합 테스트도 CI에서 실행됩니다.**

## 운영 전 확인

1. 배포할 커밋 SHA와 환경을 고정하고 해당 코드의 마이그레이션 상태를 확인합니다. 테스트 기록의 SHA와 다르면 같은 결과로 취급하지 않습니다.
2. DB와 S3 객체를 함께 복구할 수 있는 백업을 확보하고 격리 환경에서 마이그레이션을 검증합니다. `prisma db push`는 SQL 트리거를 포함한 마이그레이션 이력의 대체가 아닙니다.
3. 로그인·공개/비공개 자산 접근·Revision 발행·Fork·Proposal 리뷰·선택 적용을 확인합니다. 원본 key·캐시로 비공개 접근이 우회되지 않아야 합니다.
4. stale·충돌·CHECK_UNAVAILABLE·부분 적용 후 재검토·409 복구를 확인합니다. mock 기반 통과와 실제 DB 행 롤백·브라우저 포커스 검증을 구별합니다.
5. 배포 후 `npm run build` 산출물을 `npm start`로 실행하는 환경의 로그와 오류를 확인합니다. 배포 성공 여부는 코드 병합 이력만으로 판단하지 않습니다.

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

기준 코드에서는 contribute-dialog, `/contribute`, `/proposals/new`, Discussions의 로그인 유도가 `/login?next=...`를 사용함을 확인했습니다. 이번 문서 작업에서는 로그인 흐름을 브라우저에서 실행하지 않았습니다.

기준 코드: [CI](https://github.com/makesomethingshit/open-design-registry/blob/5d5e0fbb215e7b823f65ca6b42c206d65f7c498c/.github/workflows/ci.yml), [환경 예제](https://github.com/makesomethingshit/open-design-registry/blob/5d5e0fbb215e7b823f65ca6b42c206d65f7c498c/.env.example), [테스트 설정](https://github.com/makesomethingshit/open-design-registry/blob/5d5e0fbb215e7b823f65ca6b42c206d65f7c498c/playwright.config.ts).
