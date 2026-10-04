# 현재 기능과 제품 경계

[문서 목차](README.md) · [제품 방향](product-direction.md) · [로드맵](../ROADMAP.md)

이 문서는 저장소에 구현된 기능과 제한을 정리합니다. 실제 서비스의 배포·운영 상태나 모든 시나리오의 테스트 통과를 뜻하지 않습니다. 기능 여부는 해당 화면·API·데이터 모델과 함께 확인합니다.

## 프로젝트와 협업

| 범위 | 현재 지원 |
| --- | --- |
| Project | 로그인 사용자의 공개·비공개 프로젝트, 원본·Preview·라이선스·설명과 Project document |
| Revision | 불변 기록의 발행·비교·복원, 발행자와 출처 연결 |
| Release | 소유자가 같은 프로젝트의 발행된 Revision 1–50개를 번호 있는 판본으로 묶어 발행·조회. 수정·삭제·초안은 미지원 |
| Discussion·Issue·Design request | 프로젝트의 대화와 댓글, 구체적인 작업 항목과 외부 기여 요청. Discussion에서 작업 항목을 만들고 출처 연결 |
| Fork | 선택한 Revision에서 새 Project와 첫 Revision을 만들고 원본·라이선스·출처 보존 |
| Proposal·Review·선택 적용 | 작성자 소유 프로젝트의 수정 Revision을 제안하고, 변경별로 리뷰·승인한 뒤 일부 또는 전체를 적용해 새 Revision 발행 |
| 기여 출처 | 채택된 Proposal·작성자·Reviewer와 적용 Revision, 관련 Issue·Discussion의 연결. 비공개 정보는 가시성 규칙을 따름 |
| 활동 상태 | Active·Paused·Archived를 카드·헤더에 표시. 완료 상태나 권한 제어는 아님 |
| Star·Watch | 공개 프로젝트의 관심·다시 보기, 새 Revision·Release 발행 알림 |
| Notifications·Reports | 직접 관련된 Issue·Discussion·Fork·Proposal 알림, Watch 대상 발행 알림, 신고와 관리자 검토 |

대표적인 기여 흐름은 요청 발견 → Fork 또는 작성자 소유 프로젝트에서 수정본 준비 → Revision 발행 → Proposal → Review → 선택 적용입니다. Discussion·Issue·Fork를 반드시 거쳐야 하는 것은 아니며 source Revision의 소유권·발행 상태·가시성 조건은 유지됩니다. 구체적인 조건은 [Proposal 협업 가이드](proposals.md)를 따릅니다.

## 파일과 변경 단위

| 범위 | 현재 지원 |
| --- | --- |
| 전체 문서 | `REPLACE_DOCUMENT` 변경의 리뷰·채택과 새 Revision 발행 |
| Design Manifest | 번들 v2의 stable ID·이름·kind를 이용한 파일·유닛 추가·수정·제거·이름 변경 |
| 유닛 의존성 | 번들 v3의 의존성 기록과 제안·선택 적용 시 누락 의존성 검사 |
| Capability·어댑터 | 구조화·전체 문서·기록 없음 구분, SVG 파일 종류 제안과 신뢰도 표시 |
| 충돌·승인 해제 | 최신 Revision의 의존성·checksum 대조, 확인 불가 시 차단, 다른 Proposal 적용에 따른 승인 해제 이력 |

`STRUCTURED`는 ODR 번들의 파일·유닛을 선택할 수 있다는 뜻입니다. PSD·SVG·Penpot 파일 내부 레이어나 객체를 모두 이해한다는 뜻은 아닙니다. 번들 형식과 발행·Fork·라이선스·자산 보존 규칙은 [구조와 데이터 모델](architecture.md)에 있습니다.

## 화면과 탐색

| URL | 역할 |
| --- | --- |
| `/` | ODR 소개와 탐색·프로젝트 생성 안내. 랜딩의 Aster는 예시 콘텐츠 |
| `/explore` | 공개 프로젝트 검색과 도구·태그·라이선스 필터. 전역 검색 목적지 |
| `/projects` | 로그인 사용자의 My projects |
| `/contribute` | 공개 프로젝트의 열린 Design request 검색·필터·페이지 이동 |
| `/feed` | 공개 프로젝트에 발행된 Revision·Release를 시간순으로 탐색 |
| `/stars` | 로그인 사용자가 Star한 공개 프로젝트 |
| `/notifications` | 로그인 사용자의 개인 알림 |

프로젝트의 `/projects/{slug}`는 작품·About·프로젝트 가이드와 기여 요약을 읽는 Overview입니다. Revisions·Releases·Discussions·Issues·Proposals·Contributors·Forks는 각각 `/projects/{slug}/{탭 이름의 소문자}` 경로를 가지며 직접 열기·새로고침·브라우저 뒤로 가기를 지원합니다. Revision 발행은 Revisions, 소유자의 프로젝트 설정은 `/projects/{slug}/settings`에서 처리합니다. 기존 section hash와 기여 복귀 query는 해당 경로로 이동하며 관련 Issue·대상 프로젝트·기준 Revision을 보존합니다.

Feed는 사람 활동이나 개인 추천을 제공하지 않습니다. Watch의 알림 대상은 Revision·Release 발행이며 Proposal 알림은 직접 당사자에게 전달됩니다.

## 지원하지 않는 범위

- Penpot 내부 객체 분해, 제작 도구와의 상시 자동 동기화, 범용 Git식 merge.
- Proposal 초안 저장·재오픈·내용 수정 API. 스키마의 `DRAFT` 값만으로 지원 여부를 판단하지 않습니다.
- Release 수정·삭제, 완료·안정 상태 판정.
- 사람 Follow, 개인별 추천이나 개인 콘텐츠 중심 SNS.

발행·Fork의 중복 요청과 기존 빈 Fork 복구 등 남은 운영 과제는 [로드맵](../ROADMAP.md)에 있습니다. 테스트 범위와 운영 전 확인은 [개발과 운영](operations.md)을 따릅니다.
