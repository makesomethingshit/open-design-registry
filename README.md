# Open Design Registry

**디자인계의 GitHub — 다 같이 만드는 디자인 프로젝트.**

Open Design Registry는 공개된 디자인 프로젝트를 여러 사람이 해석하고 발전시키는 협업 플랫폼입니다. 프로젝트를 중심으로 원본·미리보기·변경 이력·출처를 보존하며, 디자인 기여를 제안하고 검토해 새 Revision으로 남깁니다.

## 현재 지원 범위

공개·비공개 Project, Revision 발행·비교·복원, Release, Discussion·Issue·Design Request, Fork와 **Proposal → 변경별 Review → 선택 적용 → 새 Revision** 흐름을 제공합니다. 프로젝트 Star·Watch, 공개 프로젝트 탐색, 기여 요청 발견과 공개 변경 피드도 제공합니다.

구현된 기능과 제한은 [현재 기능과 제품 경계](docs/current-capabilities.md)가 기준입니다. 저장소에 구현되어 있다는 뜻이며 실제 서비스 배포 상태와는 별개입니다. ODR은 제작 도구의 내부 레이어를 모두 이해하는 자체 편집기나 범용 자동 병합 도구가 아닙니다.

## 시작하기

Node.js 20.9 이상, PostgreSQL 16과 S3 호환 저장소를 준비합니다. 명령은 저장소 루트에서 실행합니다. `.env` 복사는 처음 준비할 때만 하고 기존 파일이 있으면 필요한 항목을 대조합니다.

```sh
cp .env.example .env
# DB·인증·스토리지 값을 로컬 환경에 맞게 설정합니다.
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

PowerShell에서는 첫 명령을 `Copy-Item .env.example .env`로 바꿉니다. 앱은 `http://localhost:3000`, 로그인은 `/login`입니다. 기존 마이그레이션을 적용하며 새 `init` 마이그레이션을 만들지 않습니다.

환경 변수, 테스트 DB·스토리지 준비, 검증 명령과 배포 전 확인은 [개발과 운영](docs/operations.md)에 있습니다.

## 문서 찾기

| 하려는 일 | 기준 문서 |
| --- | --- |
| 현재 기능과 제한 확인 | [현재 기능과 제품 경계](docs/current-capabilities.md) |
| 프로젝트에 디자인 기여 | [Proposal 협업 가이드](docs/proposals.md) |
| 저장소 이슈·PR 작성과 검토 | [기여 가이드](CONTRIBUTING.md) |
| 로컬 실행·테스트·운영 | [개발과 운영](docs/operations.md) |
| 코드·데이터·권한 구조 이해 | [구조와 데이터 모델](docs/architecture.md) · [Proposal API](docs/proposal-api.md) |
| 화면 구현과 UI 문구 작성 | [디자인 시스템](docs/design-system.md) · [UI 용어집](docs/terminology.md) |
| 제품 방향과 앞으로의 작업 이해 | [제품 방향](docs/product-direction.md) · [로드맵](ROADMAP.md) |
| 장기 비전과 철학 이해 | [Vision](VISION.md) · [Philosophy](PHILOSOPHY.md) |

전체 문서의 역할과 읽기 경로는 [문서 목차](docs/README.md)를 참고합니다.
