# Open Design Registry 로드맵

[Vision](VISION.md) · [Philosophy](PHILOSOPHY.md) · [제품 방향](docs/product-direction.md) · [현재 지원 범위](README.md#현재-지원-범위)

ODR이 장기적으로 만들려는 디자인 생태계는 [Vision](VISION.md)을 참고한다. 아래는 저장소에 구현된 기능과 앞으로 검증할 제품 방향을 구분한다. 항목의 순서는 출시 일정이나 배포 약속이 아니다.

## 현재 코드의 기준선

- 공개·비공개 Project, 원본과 Preview, 불변 Revision 발행·비교·복원, Issue·댓글, Fork와 기본 프로젝트 검색
- 작성자 소유 프로젝트의 개선 Revision을 바탕으로 한 Proposal, 변경별 Review, 승인된 변경의 일부 또는 전체 적용과 새 Revision 발행
- 번들 파일·유닛 단위 변경, 유닛 의존성 기록과 누락 의존성 검사, 기준 Revision 변경 시 충돌 확인
- Revision 발행자와 Proposal 작성자·Reviewer·적용 결과의 출처 연결, 라이선스와 원본 자산 보존
- Release v0: 프로젝트 소유자가 같은 프로젝트의 발행된 Revision 1–50개를 번호가 있는 기록으로 묶어 발행·조회; 수정·삭제는 미지원

이 기준선은 코드 기능을 뜻한다. 실제 서비스의 배포·운영 상태는 별도로 확인해야 한다. Discussion은 현재 Proposal 안의 댓글과 다르고, 아래의 프로젝트 Discussion·Watch 등은 아직 제품 방향이다.

## 다음 제품 단계 — 프로젝트의 대화와 기여 요청

- 프로젝트의 방향과 해석을 논의하는 **Discussion**, 해결할 문제를 다루는 **Issue**, 관리자가 외부에 요청하는 명확한 작업인 **Design Request**를 구분한다.
- Discussion에서 Issue나 Design Request로 구체화하고 Proposal로 이어질 수 있게 한다. 기존 Issue나 Fork 없이 시작하는 Proposal도 허용하는 협업 원칙을 유지한다.
- 프로젝트 안에서 Proposal·Review·Revision·출처를 함께 이해하고, 기여를 시작할 작업을 발견할 수 있게 한다.
- 초기 공식 Contributor는 채택된 Proposal 작성자와 해당 Proposal의 Reviewer로 한정한다. 다른 도움은 설명에서 인정하되 유형을 계속 늘리지 않는다.

완료 판단은 서로 다른 사용자가 프로젝트의 맥락을 이해하고 제안·리뷰·채택을 수행할 수 있는지, 채택된 Revision에서 기여와 출처를 추적할 수 있는지로 한다.

## 다음 제품 단계 — 변화의 기록과 발견

- 프로젝트 상태는 완료도가 아닌 활동 상태로 표현한다(예: Active, Paused, Archived). `Completed`·`Final`·`Stable`을 중심 상태로 삼지 않는다.
- 사람 Follow 대신 프로젝트 Follow/Watch로 Revision·Release·Proposal 등의 변화를 따라가게 한다. Star는 관심·응원·다시 보기의 표현으로 다루고 인기·품질 점수로 삼지 않는다.
- 전역 Feed는 Revision·Release 같은 실제 변화를 중심으로 조용하게 유지한다. 프로젝트 안에서는 Discussion·Issue·Design Request·Proposal·Review까지 과정과 맥락을 보여 준다.
- 태그·도구·라이선스 검색에 기여 가능한 작업 발견을 연결하고, 원본·라이선스·출처를 확인할 수 있게 한다.

이 단계의 우선순위와 화면 구성은 실제 사용자가 프로젝트를 발견하고 참여하는 흐름을 확인하며 정한다.

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
