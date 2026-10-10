# Open Design Registry 로드맵

[문서 목차](docs/README.md) · [현재 기능](docs/current-capabilities.md) · [제품 방향](docs/product-direction.md) · [Vision](VISION.md)

이 문서는 앞으로 검증하거나 개선할 작업을 다룹니다. 이미 구현된 기능은 [현재 기능과 제품 경계](docs/current-capabilities.md)에서 확인합니다. 항목의 순서는 출시 일정이나 배포 약속이 아닙니다.

## 제품 사용성 검증

- 처음 방문한 사용자가 공개 프로젝트와 기여 요청을 발견하고, 원본·변경 이력·문서에서 맥락을 이해할 수 있는지 확인합니다.
- 다른 사용자들이 제안·리뷰·채택을 수행하고 채택된 Revision에서 기여와 출처를 추적할 수 있는지 확인합니다.
- 프로젝트 재방문과 기여 발견의 실제 사용을 관찰해 다음 개선 순서를 정합니다.

화면별 남은 문제와 완료 기준은 [저장소의 열린 이슈](https://github.com/makesomethingshit/open-design-registry/issues)에 기록합니다. 기능의 구현과 사용자의 이해도·시각 품질 검증을 구분합니다.

## 제품 확장 방향 (검토안)

ODR의 기본 단위는 **Project**이며, 목표는 더 많은 게시물 생성이 아니라 디자인의 **발견 → 기여 → 시각적 검토 → 채택 → 계보와 이동성**을 개선하는 것입니다. 아래 기능은 검토 후보이며 아직 구현 완료·릴리스 일정·배포 약속을 뜻하지 않습니다. 실제 지원 범위는 [현재 기능](docs/current-capabilities.md)을 따릅니다.

### A. 발견과 참여의 진입 장벽 낮추기

- **Project Entry Point** ([#155](https://github.com/makesomethingshit/open-design-registry/issues/155)): 기존 Overview에서 목적·최신 작업물·열린 요청·다음 행동을 연결합니다. #92·#75의 완료 범위를 반복하지 않습니다.
- **Contribution Brief** ([#156](https://github.com/makesomethingshit/open-design-registry/issues/156)): Design Request에 목적·제약·기대 산출물·검토 기준을 선택적으로 안내합니다. 초기에는 기존 `Issue.body`와 관련 경로를 재사용합니다.
- **Open Questions** ([#158](https://github.com/makesomethingshit/open-design-registry/issues/158)): 결정이 필요한 디자인 논점을 기존 Discussion·Issue와 연결해 발견합니다. 무엇을 '미결정'으로 표시할지는 사람의 제품 결정이 우선입니다.
- **Project Health**: 발행·미해결 요청·리뷰 대기처럼 실제 저장된 상태를 요약하되 근거 없는 건강 점수나 인기도 순위를 만들지 않습니다.

### B. 디자인 변경과 판단의 맥락 강화

- **Visual Proposal Review** ([#157](https://github.com/makesomethingshit/open-design-registry/issues/157)): 이미 구현된 Side-by-side·Overlay·Zoom을 복제하지 않고, stale Proposal의 기준/base·제안/source·최신/latest 비교 맥락을 검토합니다.
- **Review Criteria**: 변경의 종류별 검토 기준을 읽기 쉽게 전달하고, 승인/선택 적용의 기존 책임 경계를 유지합니다.
- **Design Decision Log**: 왜 변경을 채택하거나 보류했는지 판단 근거를 이력으로 연결합니다. 불변 Revision을 수정하지 않습니다.
- **매체별 Preview·Review**: 그래픽·타이포그래피·영상·편집디자인에 적합한 미리보기를 점진적으로 탐색합니다. 지원하지 않는 포맷을 지원하는 것처럼 표시하지 않습니다.

### C. 변경의 계보와 판본 이해하기

- **Fork Upstream Status**: 원본에 새 Revision이 발행되면 출처 대비 변경을 안내하되 자동 병합을 의미하지 않습니다.
- **Release Story**: Release의 주요 변경·시각 결과·참여자 및 결정 이유를 보여주되 Release를 완료/안정 판정으로 취급하지 않습니다.
- **Design Lineage Graph**: 직접 Fork, 참고, 영향, 재해석 같은 관계를 구별하고, 확인할 수 없는 출처를 자동으로 추정하지 않습니다.

### D. 공개 생태계와 이동성 확장

- **Portable Design Package**: 파일·Preview·Revision·출처·라이선스를 버전 있는 패키지로 내보내며 비공개 자산 권한과 권리 고지를 유지합니다.
- **Tool Connectors**: 제작 도구의 산출물을 ODR Revision 발행으로 연결하는 얇은 통합을 우선 검토합니다. 실시간 공동 편집·범용 파일 내부 병합은 범위 밖입니다.
- **Curated Collections**: 목적·분야·문제에 따라 공개 Project를 묶되 사람 중심 SNS나 인기순 랭킹으로 발전시키지 않습니다.

### 개발 순서와 검증 기준

1. 먼저 #155·#156의 최소 UI 개선과 실제 신규 기여자 관찰을 진행합니다. #157·#158은 해당 이슈의 **P1 의사결정**을 완료한 뒤 구현 범위를 확정합니다.
2. 기존 Project / Issue / Discussion / Proposal / Revision 데이터와 권한 경계를 우선 재사용합니다. 새로운 모델은 기존 책임으로 표현할 수 없는 요구가 입증될 때만 도입합니다.
3. 각 작업은 독립적으로 테스트·리뷰·머지할 수 있는 PR로 나눕니다. UI 결과는 모바일/키보드/실제 작업 사례로 확인하고, 권한·이력·자산 변경은 실제 DB·S3 경계를 별도로 검증합니다.
4. Contributor Canvas([#129](https://github.com/makesomethingshit/open-design-registry/issues/129)–[#132](https://github.com/makesomethingshit/open-design-registry/issues/132))는 별개 Epic으로 유지하며, 논의용 가변 작업 공간을 정식 Proposal·Revision의 승인/불변 기록으로 혼동하지 않습니다.

## 계속 필요한 운영 기반

- 업로드 실패의 고아 객체, DB 성공 뒤 응답 유실, 알림 실패를 관측하고 안전하게 재처리합니다.
- 발행·Fork의 중복 요청을 안전하게 처리하고, 목록 상한·커서·검색 인덱스를 실제 데이터로 검증합니다. 기존 빈 Fork를 복구할 절차도 별도로 필요합니다.
- 의존성 취약점 검사, 배포 마이그레이션, 백업·복구, 비공개 자산 접근과 신고 운영 절차를 갖춥니다.
- 실제 DB·스토리지로 발행 → 복원 → Fork → Proposal → Review → 적용 흐름을 검증합니다. 현재 CI의 검증 범위와 남은 확인은 [개발과 운영](docs/operations.md)을 따릅니다.

## 장기 검토

반복되는 수동 작업과 사용 증거가 있을 때 공개 API, 변경 피드의 외부 연동과 webhook, 얇은 업로더, 도구별 export/import 어댑터, 조직·팀 소유권, 대용량 자산 최적화와 데이터 이동성을 검토합니다.

자체 디자인 편집기, 제작 프로그램별 상시 자동 동기화, 모든 파일 내부 객체의 범용 자동 병합, 사람 Follow와 개인 콘텐츠 중심 SNS는 현재 목표에 포함하지 않습니다.

## 작업 순서 판단

기능 수보다 발행 신뢰성, 원본·미리보기 접근성, 공개 프로젝트의 발견 → Fork → 제안 → 채택, 기여자 재참여, 신고 처리와 저장·전송 비용의 병목을 먼저 봅니다. 새 기능은 이 흐름의 실제 문제를 해결할 때 구체화합니다.

GitHub 이슈·PR의 P1~P3 검토 분류는 [기여 가이드](CONTRIBUTING.md)를 따릅니다. 작업의 긴급도나 구현량과 사람의 결정·검토 필요성을 구분합니다.
