# Proposal API와 오류 처리

[문서 목차](README.md) · [Proposal 협업 가이드](proposals.md) · [구조와 데이터 모델](architecture.md)

이 문서는 Proposal 생성·조회·리뷰·적용 요청과 응답 계약을 설명합니다. 사용자 작업 흐름, 변경 단위·권한·상태·충돌 정책은 [Proposal 협업 가이드](proposals.md)를 따릅니다. 필드 이름과 서버 상태 값은 UI 문구로 번역하지 않습니다.

## 핵심 API

아래 경로는 세션 쿠키를 사용하는 앱 API입니다. 별도의 공개 API 키 인증 체계가 있는 것으로 가정하지 않습니다. 전체 라우트 위치는 `app/api/`에서 확인할 수 있습니다.

| 메서드·경로 | 용도 |
| --- | --- |
| `GET /api/projects/{slug}/proposals` | 가시 Proposal 목록, `status=open|closed`, cursor·limit 지원 |
| `POST /api/projects/{slug}/proposals` | Proposal 생성 |
| `GET /api/proposals/{id}` | 상세 데이터 |
| `PATCH /api/proposals/{id}` | `{ "status": "CLOSED" }` |
| `POST /api/proposals/{id}/comments` | `{ "body": "..." }` |
| `PATCH /api/proposals/{id}/changes/{changeId}` | `status=APPROVED|CHANGES_REQUESTED`, `comment` |
| `POST /api/proposals/{id}/apply` | 승인된 `changeIds` 선택 적용 |

생성 예시입니다. ID는 실제 조회 결과로 치환하고 `requestId`는 한 생성 작업마다 UUID를 만듭니다.

```json
{
  "baseRevisionId": "base-revision-id",
  "sourceRevisionId": "source-revision-id",
  "title": "홈 화면과 로고 개선",
  "body": "간격을 조정하고 로고 파일을 교체했습니다.",
  "requestId": "7adb16e2-a3da-4569-9e04-48003f98b6dd",
  "changes": [
    { "action": "MODIFY_UNIT", "targetFileId": "home-unit-id", "sourceFileId": "updated-home-id" },
    { "action": "RENAME_UNIT", "targetFileId": "logo-unit-id", "newName": "Primary logo" }
  ]
}
```

`changes` 또는 기존 `files` 배열 중 하나만 보냅니다(1~10개). 둘 다 없으면 `REPLACE_DOCUMENT` 하나를 생성합니다. base는 대상 프로젝트의 발행 Revision, source는 작성자 소유 프로젝트의 발행 Revision이어야 하며 Fork 혈통 자체를 필수 조건으로 검사하지는 않습니다.

Contribution preparation uses whole-document mode when either revision lacks a structured unit bundle, including a structured base paired with a URL-only source.

Contribution scope is shown beside the project action and recalculated for each selected base/source pair. Structured pairs list the published source file-unit count; whole-document pairs submit the complete revision for review. Missing legacy capability metadata is labeled as unknown and does not claim selectable units or block whole-document preparation. Layers and objects are not selectable units.

서버는 base와 source가 같은 Revision인 Proposal을 거부합니다. 전체 문서 제안은 source 자산의 동일성 또는 검증된 checksum/번들 비교와 적용되는 metadata·Preview가 같다고 확인될 때만 무변경으로 거부하며, 비교 자료가 없는 legacy Revision은 추측해 차단하지 않습니다. `MODIFY_UNIT`도 checksum·의존성 비교 결과와 실제 적용되는 파일 metadata·Preview가 모두 같을 때 거부합니다.

생성은 `201`; 같은 `(projectId, authorId, requestId)` 재시도는 기존 Proposal과 `200`을 반환합니다. 서버는 이 조합의 기존 Proposal을 반환하며 요청 내용의 동일성을 대조하지 않습니다. 호출자는 같은 생성 작업의 재시도에만 같은 ID를 사용하고, 내용이 다른 새 제안에는 새 UUID를 생성해야 합니다.

적용 예시에서 stale이 아니라면 `changeIds`만 필요합니다. stale이면 사용자가 실제 확인한 최신 Revision과 선택 집합을 함께 보냅니다.

```json
{
  "changeIds": ["approved-change-id"],
  "reviewedLatestRevisionId": "latest-revision-id",
  "reviewedChangeIds": ["approved-change-id"]
}
```

이 값은 확인 기록이며 서버 재검사를 우회하지 않습니다. 적용은 새 Revision과 `201`, 선택이 이미 같은 Revision에 적용되어 있으면 기존 결과와 `200`을 반환합니다. 일부만 이미 적용되었거나 적용 Revision이 섞인 요청은 충돌할 수 있습니다.

## 오류 처리

| 응답 | 확인할 내용 |
| --- | --- |
| `400` | 필수 입력·실제 ID·배열 중복·source 소유권·변경 스키마·Proposal 생성 시 누락된 의존 유닛 |
| `401` | 로그인 세션 |
| `403` | 대상 프로젝트 소유자 등 필요한 행동 권한 |
| `404` | 실제 존재와 가시성 모두 확인. 비공개 여부를 추정해 노출하지 않음 |
| `409` | 최신 Revision 변경, 충돌/확인 불가, 승인 상태, 이미 적용, 제거된 대상, 마지막 유닛 제거, 선택 적용 후 누락된 의존 유닛 등 |
| `500` | 서버 로그·DB·스토리지 오류. 결과 저장 여부를 확인한 뒤 재시도 판단 |

Apply·Approve가 `409`이면 UI는 최신 상태를 다시 조회하고 비교 확인·모달을 초기화합니다. 응답에 유효한 `conflictChangeIds`가 있으면 그 선택을 해제합니다. payload가 없거나 잘못되었다고 무조건 전체 선택을 없애거나 자동 재적용하지 않습니다. API 소비자도 최신 데이터와 승인·선택 가능 여부를 다시 확인해야 합니다.

관련 코드: [Proposal 처리](../src/lib/proposal-handlers.ts), [충돌 판정](../src/lib/proposal-conflicts.ts), [번들·의존성](../src/lib/revision-bundle.ts), [입력 스키마](../src/lib/project-validation.ts).
