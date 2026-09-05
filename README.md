# Open Design Registry

**다 같이 만드는 디자인 프로젝트.**

Open Design Registry는 서로 다른 제작 도구를 쓰는 사람들이 하나의 디자인 프로젝트를 함께 발전시키기 위한 서비스입니다. 원본·미리보기·변경 이력·출처 보존은 공동 제작을 신뢰할 수 있게 하는 기반입니다.

현재 MVP는 로그인, 공개·비공개 프로젝트, Revision 발행·비교·복원, Issue·댓글, Fork, 알림과 신고 검토를 제공합니다. Fork는 선택한 Revision을 새 프로젝트의 첫 Revision으로 발행합니다. 다음 핵심 단계는 Fork의 개선안을 원래 프로젝트에 제안하고, 검토·채택해 기여 기록을 남기는 흐름입니다. 아직 개선안 제안·채택 기능은 구현되지 않았습니다.

## 발행과 Fork의 보존 규칙

- 새 Revision은 발행 시 프로젝트 라이선스를 고정합니다. 프로젝트 설정을 바꿔도 과거 Revision의 라이선스는 바뀌지 않습니다.
- 기존 Revision의 발행 당시 라이선스는 추정하지 않고 `null`(기록 없음)로 남깁니다. 복원도 이 값을 보존합니다.
- Fork는 선택한 Revision의 원본, 미리보기, 도구·태그·체크섬과 라이선스를 첫 Revision으로 이어받습니다. 라이선스가 없는 기존 Revision은 권리 확인 후 현재 프로젝트 라이선스로 새로 발행하며, 출처의 과거 라이선스는 계속 기록 없음으로 표시합니다.
- 업로드된 파일은 불변 저장 객체를 공유하되 각 프로젝트가 독립적으로 참조합니다. 원본 프로젝트가 비공개로 바뀌어도 공개 Fork의 파일은 열립니다. 모든 참조 프로젝트가 비공개이면 소유자만 접근할 수 있습니다.
- 외부 원본 링크는 URL을 보존합니다. 외부 서비스 파일의 변경·삭제·접근 권한까지 보장하지는 않습니다.
- Fork 프로젝트, 첫 Revision, 소유자 알림은 하나의 DB 트랜잭션으로 저장됩니다. 하나라도 실패하면 모두 취소됩니다. 커밋 후 응답 유실에 대한 중복 요청 방지는 별도 후속 과제입니다.
- 새 마이그레이션은 기존 Fork를 소급해 채우지 않습니다. 기존 빈 Fork의 복구에는 별도 절차가 필요합니다.

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
