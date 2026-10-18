# CI 비용과 병합 정책

이 문서는 `main`의 필수 검증과 GitHub 저장소 설정을 함께 설명합니다. 워크플로만으로는 Strict 정책을 해제할 수 없으므로, 보호 규칙 변경은 저장소 관리자가 GitHub Settings에서 수행합니다.

## 병합 정책

| 항목 | 설정 |
| --- | --- |
| Require status checks to pass | 유지 |
| Require branches to be up to date before merging | 해제 (`strict: false`) |
| Required checks | `pr-title`, `secrets`, `test`, `typecheck`, `build`, `e2e` |
| Require conversation resolution | 유지 |
| Enforce admins / force push / bypass | 유지, 허용하지 않음 |

Strict를 해제해도 각 PR HEAD의 필수 체크는 그대로 필요합니다. 다른 PR이 `main`에 병합됐다는 이유만으로 열린 PR의 체크를 다시 실행하지 않습니다. 같은 브랜치에 새 커밋을 push하면 `synchronize` 이벤트로 새 HEAD에서 다시 검증합니다.

서로 의존하는 PR은 Loose 정책과 별개로 통합 브랜치 또는 합쳐진 변경에서 추가 검증합니다. 개별 PR의 green만으로 상호작용을 보증하지 않습니다.

## 문서 전용 변경

`.github/workflows/ci.yml`의 `changes` job이 GitHub PR files API의 모든 페이지를 조회해 변경 파일을 분류합니다.

문서 전용으로 인정하는 경로는 다음뿐입니다.

- `docs/**/*.md`
- `README.md`
- `ROADMAP.md`

다음 중 하나라도 있으면 전체 CI입니다: 애플리케이션 소스, API, 테스트, Prisma, `package.json`, `package-lock.json`, `.github/workflows/**`, 배포·빌드·설정 파일, 문서 외 파일이 포함된 혼합 PR.

분류는 PR 제목, 작성자 설명, 커밋 메시지를 사용하지 않습니다. API 페이지 수와 `changed_files`가 다르거나, 중복 파일이 있거나, `changed_files`가 GitHub의 3000개 상한에 닿으면 문서 전용으로 판정하지 않습니다. 분류·조회·문서 검증이 실패하면 `docs_only=false`로 전체 job을 실행하고, 필수 `pr-title` job도 실패해 병합을 막습니다. `changes`를 새 필수 컨텍스트로 추가하지 않아도 이 경로가 fail-closed로 동작합니다.

## 실행 매트릭스

| Job | 문서 전용 PR | 코드 PR | `main` push |
| --- | --- | --- | --- |
| `changes` | 실행 | 실행 | 실행(전체 판정) |
| `pr-title` | 실행 | 실행 | 대상 아님 |
| `secrets` | 실행 | 실행 | 실행 |
| `test` | Skip | 실행 | 실행 |
| `typecheck` | Skip | 실행 | 실행 |
| `build` | Skip | 실행 | 실행 |
| `e2e` | Skip | 실행 | 실행 |

Skip은 workflow 전체 `paths`가 아니라 job 단위 `if`로 처리합니다. 문서 전용 PR의 `changes` job summary에 `SKIPPED: docs-only`와 건너뛴 job을 기록합니다. 필수 job 이름은 그대로 유지합니다.

문서 전용 PR에서는 변경된 Markdown의 상대 링크와 코드 펜스 균형을 `scripts/ci-pr-check.mjs`로 확인합니다. 분류 스크립트는 PR 체크아웃의 사본이 아니라 PR base SHA의 신뢰된 사본을 API로 읽어 실행하고, PR 체크아웃은 `--root`로만 읽습니다. base에 스크립트가 없거나 읽을 수 없으면 전체 CI를 실행합니다. 문서와 코드가 섞인 PR도 변경된 문서를 같은 방식으로 확인한 뒤 전체 CI를 실행합니다.

## Actions 승인과 권한

- 외부 fork PR은 `Require approval for all external contributors`로 설정되어 있어 검토 전 Actions가 실행되지 않습니다.
- 내부 기여자와 저장소 소유자의 PR은 자동 검증합니다. 모든 내부 PR에 environment 승인을 추가하지 않습니다.
- `sync-pr-labels.yml`은 `pull_request_target`에서 PR 코드를 checkout하지 않고, 제목·본문을 환경 변수로만 전달하며 `issues: read`, `pull-requests: write`만 사용합니다.
- 필수 `e2e`를 수동 승인 대기로 두지 않습니다. 별도 심층 검증이 필요하면 비필수 workflow로 분리합니다.
- workflow 권한은 `contents: read`, `pull-requests: read`로 유지합니다. 쓰기 권한이나 `continue-on-error`를 추가하지 않습니다.

## 보존하는 검증

`test`는 실제 PostgreSQL 16에서 Prisma migration과 Proposal 경합 테스트를 실행합니다. `e2e`는 PostgreSQL, MinIO, 실제 Chromium으로 문서 이미지 정리와 Canvas 자산을 검증합니다. `secrets`는 Gitleaks로 전체 git 이력을 검사합니다. 이 job들은 문서 전용 PR에서만 건너뜁니다.

## 운영 확인

`workflow_dispatch`는 전체 검증을 실행하며 `secrets` job summary에 요청한 ref와 실제 checkout SHA를 기록합니다. `main` push도 전체 검증을 실행합니다. 병합 후 전체 CI 실패는 별도 회귀로 조사합니다.
