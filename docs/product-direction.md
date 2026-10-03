# 제품 방향

[문서 목차](README.md) · [Vision](../VISION.md) · [Philosophy](../PHILOSOPHY.md) · [로드맵](../ROADMAP.md)

ODR의 장기 목표는 [Vision](../VISION.md), 그 목표를 지탱하는 관점은 [Philosophy](../PHILOSOPHY.md)를 참고한다. 이 문서는 이를 제품 결정으로 번역한 현재의 원칙을 설명한다. 기능의 구현 여부는 [현재 기능과 제품 경계](current-capabilities.md)에서 확인하고 남은 작업은 로드맵에서 구분한다.

## 핵심 사용자

초기 핵심 사용자는 자신의 프로젝트를 공개하고 기여를 받는 개인 디자이너와 오픈소스 프로젝트의 UI·UX·브랜딩·디자인 시스템에 참여하는 사람이다. 두 집단이 만나는 작업에서 시작한다. 커뮤니티는 프로젝트의 실제 협업에서 형성된다.

## 프로젝트 모델

기본 단위는 **Repository형 Project**다. 프로젝트에는 원본 디자인과 Preview, 불변 Revision, 출처가 함께 있다. 특정 제작 도구의 내부 형식이나 자체 편집기를 중심에 두지 않는다.

- **Revision**은 프로젝트의 실제 변화를 보존하는 불변 기록이다.
- **Release**는 여러 Revision을 현재 시점의 디자인 방향을 보여 주는 판본으로 묶는다. 완료 선언은 아니다.
- 프로젝트 상태는 완성도가 아닌 활동 상태로 표현한다(예: Active, Paused, Archived). `Completed`·`Final`·`Stable`을 제품의 중심 상태로 삼지 않는다.

## 협업 모델

프로젝트에는 협업을 위한 Issue·Discussion·Design Request·Fork·Proposal·Review가 연결되고, 의미 있는 변화를 묶는 Release가 연결된다.

대표적인 흐름은 다음과 같다.

> 공개 → Discussion / Issue / Design Request → Fork → Proposal → Review → 일부 또는 전체 적용 → 새 Revision

이 순서는 필수가 아니다. Discussion은 방향·해석·아이디어를 자유롭게 논의하는 공간이고, Issue는 해결할 구체적 문제다. Design Request는 프로젝트 관리자가 외부에 요청하는 명확한 디자인 작업이다. Discussion에서 Issue나 Request가 생길 수 있고, 그 과정 없이 Proposal을 제출하거나 Fork에서 독립적인 해석을 이어갈 수도 있다.

초기 공식 Contributor 범주는 **채택된 Proposal의 작성자와 그 Proposal의 Reviewer**로 한정한다. Discussion 참여, Issue 제보, 조언, 참고 자료 제공 등은 필요하면 Proposal이나 Revision 설명에서 인정한다. 활동마다 별도 Contributor 유형을 만들지 않는다.

## 발견과 커뮤니티

사람 사이의 관계보다 **사람과 프로젝트의 관계**를 중심에 둔다. Star는 관심·응원·다시 보기의 표현으로 두되, Star 수로 강한 인기 순위나 품질 점수를 만들지 않는다. 사람 Follow 대신 프로젝트 Watch를 중심에 둔다. 현재 Watch는 새 Revision·Release 발행을 알린다. Proposal의 제출·리뷰·적용 알림은 Watch가 아니라 직접 당사자에게 전달되며, 세부 조건은 [Proposal 협업 가이드](proposals.md#proposal-알림)를 따른다.

전역 Feed는 조용하게 유지하고 Revision·Release처럼 프로젝트에 실질적인 변화가 생긴 결과를 주로 보여 준다. 프로젝트 상세에서는 Proposal·Discussion·Issue·Design Request·Review까지 과정과 맥락을 볼 수 있게 한다. 게시물이나 활동도 가능하면 Project·Revision·Release·Proposal과 연결한다. 목적은 콘텐츠 소비보다 프로젝트 발견·이해·참여다.

## 공개 탐색과 개인 작업 공간

`/`는 제품 소개, `/explore`는 공개 프로젝트 탐색, `/projects`는 로그인 사용자의 My projects다. 로그인 여부가 공개 URL의 역할을 바꾸지 않는다. Explore 링크와 전역 검색은 `/explore`로 연결한다.

Explore는 제목, 한 문장 설명, 검색·필터, 실제 프로젝트 목록, 보조 행동 순서로 구성한다. 프로젝트의 원본·Revision·기여 맥락은 유지한다.

## 제품 경계

ODR은 완성작 인기 경쟁을 위한 포트폴리오 SNS, 사람 Follow와 개인 브랜딩 중심의 일반 SNS, 자체 디자인 편집기, 단순 파일 저장소를 목표로 하지 않는다. 도구가 달라도 프로젝트의 원본·변경·출처·기여를 이어 갈 수 있어야 한다.
