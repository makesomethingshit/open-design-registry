# Open Design Registry 로드맵

[Vision](VISION.md) · [Philosophy](PHILOSOPHY.md) · [제품 방향](docs/product-direction.md) · [현재 지원 범위](README.md#현재-지원-범위)

ODR이 장기적으로 만들려는 디자인 생태계는 [Vision](VISION.md)을 참고한다. 아래는 저장소에 구현된 기능과 앞으로 검증할 제품 방향을 구분한다. 항목의 순서는 출시 일정이나 배포 약속이 아니다.

## 현재 코드의 기준선

- 공개·비공개 Project, 원본과 Preview, 불변 Revision 발행·비교·복원, Issue·댓글, Fork와 기본 프로젝트 검색
- 작성자 소유 프로젝트의 개선 Revision을 바탕으로 한 Proposal, 변경별 Review, 승인된 변경의 일부 또는 전체 적용과 새 Revision 발행
- 번들 파일·유닛 단위 변경, 유닛 의존성 기록과 누락 의존성 검사, 기준 Revision 변경 시 충돌 확인
- Revision 발행자와 Proposal 작성자·Reviewer·적용 결과의 출처 연결, 라이선스와 원본 자산 보존
- Release v0: 프로젝트 소유자가 같은 프로젝트의 발행된 Revision 1–50개를 번호가 있는 기록으로 묶어 발행·조회; 수정·삭제는 미지원
- 활동 상태(Active/Paused/Archived; 표시 전용): 프로젝트 카드·헤더에 표시

이 기준선은 코드 기능을 뜻한다. 실제 서비스의 배포·운영 상태는 별도로 확인해야 한다. 프로젝트 Discussion과 자체 댓글은 구현되어 있으며, 여기서 시작한 Issue·Design Request는 Proposal 및 적용 Revision의 출처로 연결된다.

## 구현 완료 (#43–#48) — 프로젝트의 대화와 기여 요청

- 프로젝트마다 별도 **Discussion**과 댓글을 제공하며, 작업 항목인 **Issue**와 **Design Request**를 구분한다.
- Discussion에서 Issue나 Design Request를 만들고 출처를 연결할 수 있으며, 해당 작업 항목에 연결된 Proposal로 이어진다. 기존 Issue나 Fork 없이 시작하는 Proposal도 허용한다.
- 프로젝트와 적용 Revision에서 Proposal·Review·Revision 및 Discussion까지 이어지는 출처를 확인할 수 있다.
- 초기 공식 Contributor는 채택된 Proposal 작성자와 해당 Proposal의 Reviewer로 한정한다. 다른 도움은 설명에서 인정하되 유형을 계속 늘리지 않는다.

완료 판단은 서로 다른 사용자가 프로젝트의 맥락을 이해하고 제안·리뷰·채택을 수행할 수 있는지, 채택된 Revision에서 기여와 출처를 추적할 수 있는지로 한다.

## 구현 완료 — 프로젝트 재방문과 기여 발견

- **Star**는 공개 프로젝트에 대한 관심·다시 보기로, **Watch**는 해당 프로젝트의 새 Revision·Release 발행 알림으로 제공한다. Proposal이나 토론 활동은 Watch 알림 대상이 아니다.
- `/contribute`에서 공개 Active 프로젝트의 열린 Design Request를 검색하고 도구·태그·라이선스로 좁혀 프로젝트의 Issue 영역으로 이동할 수 있다.
- `/feed`에서 공개 프로젝트에 발행된 Revision·Release를 시간순으로 탐색한다. 사람 활동이나 개인별 추천은 포함하지 않는다.

실제 사용자가 프로젝트를 발견하고 참여하는 흐름을 확인하며 다음 우선순위를 정한다.

## 계속 필요한 운영 기반

- 업로드 실패의 고아 객체, DB 성공 뒤 응답 유실, 알림 실패를 관측하고 안전하게 재처리한다.
- 발행·Fork의 중복 요청을 안전하게 처리하고, 목록 상한·커서·검색 인덱스를 실제 데이터로 검증한다.
- 의존성 취약점 검사, 배포 마이그레이션, 백업·복구, 비공개 자산 접근과 신고 운영 절차를 갖춘다.
- 실제 DB·스토리지를 포함한 발행→복원→Fork→Proposal→Review→적용 흐름을 검증한다. 현재 CI의 통합 브라우저 검증 범위는 [운영 문서](docs/operations.md)를 따른다.

## 장기 검토

반복되는 수동 작업과 사용 증거가 있을 때 공개 API·변경 피드·webhook, 얇은 업로더, 도구별 export/import 어댑터, 조직·팀 소유권, 대용량 자산 최적화와 데이터 이동성을 검토한다.

자체 디자인 편집기, 제작 프로그램별 상시 자동 동기화, 모든 파일 내부 객체의 범용 자동 병합, 사람 Follow와 개인 콘텐츠 중심의 SNS는 현재 목표에 포함하지 않는다.

## 우선순위 판단

기능 수보다 발행 신뢰성, 원본·미리보기 접근성, 공개 프로젝트의 발견→Fork→제안→채택, 기여자 재참여, 신고 처리와 저장·전송 비용의 병목을 먼저 본다. 새 기능은 이 흐름의 실제 문제를 해결할 때 구체화한다.
