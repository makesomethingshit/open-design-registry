# Open Design Registry

**디자인계의 GitHub — 다 같이 만드는 디자인 프로젝트.**

Open Design Registry는 공개된 디자인 프로젝트를 여러 사람이 계속 해석하고 발전시키는 협업 플랫폼을 지향합니다. 개인 디자이너와 오픈소스 디자인 참여자가 프로젝트를 중심으로 만나고, 원본·미리보기·변경 이력·출처를 보존하며 기여합니다. 장기적으로 무엇을 만들려 하는지는 [Vision](VISION.md), 그 방향의 철학적 배경은 [Philosophy](PHILOSOPHY.md), 구체적인 제품 원칙은 [제품 방향](docs/product-direction.md)에서 설명합니다.

현재는 로그인, 공개·비공개 프로젝트, Revision 발행·비교·복원, Release, Issue·댓글, Fork, 알림·신고 검토에 더해 **Proposal → 변경별 리뷰 → 선택 적용 → 새 Revision** 흐름을 제공합니다. Release v0에서는 프로젝트 소유자가 같은 프로젝트의 발행된 Revision 1–50개를 번호가 있는 판본으로 묶어 조회할 수 있습니다. 수정·삭제는 지원하지 않습니다. 원본 파일을 ODR 번들로 발행하면 파일·유닛 단위 변경을 제안할 수 있고, 전체 문서 교체도 지원합니다.

아래 현재 지원 범위는 저장소 코드 기준이며 실제 서비스 배포 여부와는 별개입니다. `package.json` 버전은 `0.1.0`입니다.

## 문서 안내

| 문서 | 읽는 목적 |
| --- | --- |
| [Vision](VISION.md) | ODR이 장기적으로 만들려는 디자인 생태계 이해 |
| [Philosophy](PHILOSOPHY.md) | 출처·저자성·공개·fork를 중요하게 보는 이유 이해 |
| [제품 방향](docs/product-direction.md) | 비전을 실제 제품 원칙으로 번역한 기준 이해 |
| [로드맵](ROADMAP.md) | 구현된 기능과 다음 제품 단계 구분 |
| [구조와 데이터 모델](docs/architecture.md) | 코드 위치, Revision·번들·권한·저장소 경계 이해 |
| [Proposal 협업 가이드](docs/proposals.md) | 기여·리뷰·선택 적용, API 입력, 충돌·승인 해제 이해 |
| [개발과 운영](docs/operations.md) | 로컬 실행, 환경 변수, 테스트, 마이그레이션·배포 전 확인 |

## 현재 지원 범위

| 범위 | 현재 상태 |
| --- | --- |
| Overview·Revisions·Releases·Issues·Proposals·Forks | 프로젝트 상세의 섹션과 탐색 제공 |
| Release v0 | 같은 프로젝트의 published Revision을 묶는 owner 발행·조회 기록 |
| 전체 문서 Proposal | `REPLACE_DOCUMENT` 리뷰·채택, 새 Revision 발행 |
| 선택 적용 | 승인된 파일·유닛만 적용, 부분 채택과 잔여 변경 재검토 |
| Design Manifest | 번들 v2의 stable ID·이름·kind, 추가·수정·제거·이름 변경 |
| 선택 적용 의존성 | 번들 v3의 유닛 의존성 기록, 제안·적용 시 누락 의존성 확인 |
| Capability·어댑터 | 구조화/전체 문서 표시, SVG 파일 종류 제안과 신뢰도 표시 |
| 충돌·승인 해제 | 최신 Revision과 checksum 비교, 확인 불가 시 차단, Proposal 적용에 따른 승인 해제 이력 |
| 향후 제품 방향 | 활동 상태, 프로젝트 Watch·Star, 변화 중심 Feed |
| 미구현 기술 범위 | Penpot 내부 객체 분해, 편집기 자동 동기화, 범용 Git식 merge |

`STRUCTURED`는 ODR이 번들의 파일·유닛을 선택할 수 있다는 뜻입니다. PSD·SVG·Penpot 파일 내부의 레이어나 객체를 모두 이해한다는 뜻은 아닙니다.

## 발행과 Fork의 보존 규칙

- 새 Revision은 발행 시 프로젝트 라이선스를 고정합니다. 프로젝트 설정을 바꿔도 과거 Revision의 라이선스는 바뀌지 않습니다.
- 기존 Revision의 발행 당시 라이선스는 추정하지 않고 `null`(기록 없음)로 남깁니다. 복원도 이 값을 보존합니다.
- Fork는 선택한 Revision의 원본, 미리보기, 도구·태그·체크섬과 라이선스를 첫 Revision으로 이어받습니다. 라이선스가 없는 기존 Revision은 권리 확인 후 현재 프로젝트 라이선스로 새로 발행하며, 출처의 과거 라이선스는 계속 기록 없음으로 표시합니다.
- 업로드된 파일은 불변 저장 객체를 공유하되 각 프로젝트가 독립적으로 참조합니다. 원본 프로젝트가 비공개로 바뀌어도 공개 Fork의 파일은 열립니다. 모든 참조 프로젝트가 비공개이면 소유자만 접근할 수 있습니다.
- 외부 원본 링크는 URL을 보존합니다. 외부 서비스 파일의 변경·삭제·접근 권한까지 보장하지는 않습니다.
- Fork 프로젝트, 첫 Revision, 소유자 알림은 하나의 DB 트랜잭션으로 저장됩니다. 하나라도 실패하면 모두 취소됩니다. 커밋 후 응답 유실에 대한 중복 요청 방지는 별도 후속 과제입니다.
- 새 마이그레이션은 기존 Fork를 소급해 채우지 않습니다. 기존 빈 Fork의 복구에는 별도 절차가 필요합니다.

## 시작하기

요구 사항: Node.js 20.9 이상(CI는 Node 20), PostgreSQL 16, 접근 가능한 비공개 S3 호환 버킷. 잠금 파일 기준 설치는 `npm ci`를 사용합니다.

```bash
cp .env.example .env
# .env의 DB·인증·스토리지 값을 로컬 환경에 맞게 설정한 뒤 실행
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

PowerShell에서는 첫 명령을 `Copy-Item .env.example .env`로 바꾸면 됩니다. 로그인 화면은 `/login`입니다. Next.js와 Prisma CLI가 함께 읽을 수 있도록 `.env`를 기준으로 설명합니다. 기존 `.env.local`을 사용한다면 Prisma·독립 테스트 프로세스에도 필요한 변수를 별도로 전달하세요. GitHub OAuth는 두 `GITHUB_*` 값이 모두 있을 때만 활성화됩니다.

최소 검증은 `npm test`, 타입 검사는 `npx tsc --noEmit`, 프로덕션 빌드는 `npm run build`입니다. DB 통합 테스트에는 별도 환경 변수가 필요하므로 [검증 절차](docs/operations.md)를 확인하세요. 저장소의 기존 마이그레이션을 적용할 때는 새 `init` 마이그레이션을 만들지 않습니다.

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
  quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z server /data
```

스토리지·DB 값을 현재 프로세스의 환경 변수로 내보낸 뒤 아래 명령을 실행하세요. `test:storage:prepare`는 버킷이 없을 때만 생성합니다. `.env`를 사용하는 상세 명령은 [개발과 운영](docs/operations.md)에 있습니다.

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
