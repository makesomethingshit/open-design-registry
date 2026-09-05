# Open Design Registry

**디자인계의 GitHub — 다 같이 만드는 디자인 프로젝트.**

Open Design Registry는 디자인 프로젝트를 중심으로 사람들이 작업을 공개하고, 문제를 논의하고, 변경안을 제출·리뷰·반영하며 기여 이력을 쌓는 협업 플랫폼을 지향합니다. 서로 다른 제작 도구를 쓰는 사람들이 하나의 디자인 프로젝트를 함께 발전시키는 것이 목표입니다. 원본·미리보기·변경 이력·출처 보존은 공동 제작을 신뢰할 수 있게 하는 기반입니다.

현재 MVP는 로그인, 공개·비공개 프로젝트, Revision 발행·비교·복원, Issue·댓글, Fork, 알림과 신고 검토를 제공합니다. Fork는 선택한 Revision을 새 프로젝트의 첫 Revision으로 발행합니다. 프로젝트의 Contributions에서 Fork의 개선안을 제출하고, 댓글·수정 요청·재제출·채택·거절을 진행할 수 있습니다. 채택하면 제안자와 반영자를 기록한 새 Revision을 발행합니다.

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

## 기여 제안과 리뷰

1. 공개 프로젝트를 Fork하고 자신의 Fork에 개선 Revision을 발행합니다.
2. 원래 프로젝트의 **Contributions → Propose a change**에서 개선 버전과 설명을 제출합니다. 발행 권리를 확인한 제안은 해당 프로젝트의 공개 범위로 리뷰 이력에 보존됩니다.
3. 로그인한 사용자는 댓글을 남기고, 프로젝트 소유자는 수정 요청 또는 거절을 할 수 있습니다. 제안자는 개선 버전을 발행한 뒤 최신 원본과 비교하고 재제출합니다.
4. 소유자는 제안의 파일과 라이선스를 검토해 **Accept proposal**로 반영합니다. 현재 구현은 제안된 전체 디자인 스냅샷을 새 Revision으로 발행합니다.
5. 반영된 Revision에서 제안·리뷰 이력, 기여자와 반영자를 확인할 수 있습니다.

보존·동시 작업 규칙:

- 검토한 이후 원본 Revision이나 제안 버전이 바뀌면 반영 요청은 `409`로 거절합니다. 최신 기준으로 비교·재제출하고 다시 검토해야 합니다.
- 수정 요청 상태에서는 재제출 전 반영할 수 없습니다. 이미 반영된 요청을 다시 보내도 같은 Revision을 반환합니다.
- 제안 라이선스와 현재 프로젝트 라이선스가 정확히 같아야 반영합니다. 범용 라이선스 호환성 판정은 하지 않습니다.
- 제안자가 Fork를 비공개로 바꿔도 제출한 버전과 이전 제안 버전은 리뷰 이력에 남습니다. 대상 프로젝트가 비공개로 바뀌면 제안·스냅샷은 그 소유자에게만 보입니다. 다른 공개 프로젝트가 같은 파일을 참조하면 그 공개 사본을 통한 접근은 유지됩니다.
- 반영된 Revision, 제안 상태, 리뷰 이벤트와 알림은 같은 DB 트랜잭션으로 저장합니다. 부분 실패는 모두 취소됩니다.
- 최초 제안 설명, 리뷰 이벤트와 반영된 기여자 이름은 과거 기록으로 보존합니다. 제안·리뷰 이력 삭제는 지원하지 않습니다.

API: `GET/POST /api/projects/:slug/contributions`, `GET/PATCH /api/projects/:slug/contributions/:id`.
`PATCH` 동작은 `comment`, `request_changes`, `update`, `accept`, `reject`이며 댓글을 제외한 변경은 `expectedVersion`을 받습니다. 목록은 커서 기반 20개, 상세 리뷰 이력은 30개씩 반환합니다.

팀별 공동 관리자, 여러 파일의 선택 반영, 자동 병합, 기여자 프로필, Issue와 제안의 구조화된 연결, 최초 제출 요청의 중복 방지는 후속 단계입니다. 현재 리뷰·반영 권한은 프로젝트 소유자에게 있습니다.
