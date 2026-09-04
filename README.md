# Open Design Registry

도구 중립적인 공개 디자인 프로젝트 저장소의 1단계 수직 슬라이스입니다. 이메일/비밀번호 로그인, 선택적 GitHub OAuth, 프로젝트 생성과 공개·비공개 열람을 제공합니다.

## 시작하기

요구 사항: Node.js 20+, PostgreSQL 16, S3 호환 스토리지(MinIO 또는 R2).

```bash
cp .env.example .env.local
npm install
npx prisma migrate dev --name init
npm run dev
```

최소 검증은 `npm test`, 프로덕션 빌드는 `npm run build`입니다. `.env.local`의 `DATABASE_URL`과 S3 값을 환경에 맞게 바꾸세요. GitHub OAuth는 두 `GITHUB_*` 값이 모두 있을 때만 활성화됩니다.

## 권한 규칙

- 익명 사용자는 공개 프로젝트만 목록·상세에서 볼 수 있습니다.
- 로그인 사용자는 공개 프로젝트를 만들 수 있으며 자신의 비공개 프로젝트도 볼 수 있습니다.
- 비공개 프로젝트를 다른 사용자가 요청하면 존재 여부를 노출하지 않고 `404`를 반환합니다.
- 대표 이미지는 PNG/JPG만 허용하며 10MB를 넘을 수 없습니다.

## 실제 서비스 통합 테스트

CI는 PostgreSQL과 고정 버전의 MinIO를 띄운 뒤 가입 → 프로젝트 생성 → Revision 발행·복원 → Issue·Fork 전체 흐름을 Chromium에서 검증합니다.

로컬에서는 PostgreSQL을 실행하고 MinIO를 다음처럼 시작합니다. 아래 계정은 로컬·CI 테스트 전용입니다.

```bash
docker run --detach --rm --name open-design-registry-minio --publish 9000:9000 \
  --env MINIO_ROOT_USER=minioadmin --env MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio:RELEASE.2025-09-07T16-13-09Z server /data
```

`.env.local` 값을 환경 변수로 내보낸 뒤 아래 명령을 실행하세요. `test:storage:prepare`는 버킷이 없을 때만 생성합니다.

```bash
npm run test:storage:prepare
npx prisma migrate deploy
E2E_INTEGRATION=1 npm run test:e2e
```

PowerShell에서는 마지막 명령 대신 다음을 사용합니다.

```powershell
$env:E2E_INTEGRATION = "1"
npm run test:e2e
```

테스트가 끝나면 `docker stop open-design-registry-minio`로 MinIO를 정리할 수 있습니다.
