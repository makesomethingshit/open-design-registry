# 제품 방향

[README](../README.md) · [로드맵](../ROADMAP.md)

이 문서는 ODR의 제품 방향을 설명한다. 기능의 구현 여부는 [README의 현재 지원 범위](../README.md#현재-지원-범위)와 로드맵에서 구분한다.

## 지향점과 사용자

ODR은 **디자인계의 GitHub**를 지향한다. 완성된 결과물을 전시하거나 파일을 보관하는 데 그치지 않고, 공개된 디자인 프로젝트를 여러 사람이 계속 해석하고 변경하고 기여하는 오픈소스 디자인 생태계 허브를 목표로 한다. 커뮤니티는 프로젝트의 실제 협업에서 형성된다.

초기 핵심 사용자는 자신의 프로젝트를 공개하고 기여를 받는 개인 디자이너와 오픈소스 프로젝트의 UI·UX·브랜딩·디자인 시스템에 참여하는 사람이다. 두 집단이 만나는 작업에서 시작한다.

## 프로젝트와 협업

기본 단위는 **Repository형 Project**다. 프로젝트에는 원본 디자인과 Preview, 불변 Revision, 출처가 함께 있고, 협업을 위한 Issue·Discussion·Design Request·Fork·Proposal·Review, 의미 있는 변화를 묶는 Release가 연결된다. 특정 제작 도구의 내부 형식이나 자체 편집기를 중심에 두지 않는다.

대표적인 흐름은 다음과 같다.

> 공개 → Discussion / Issue / Design Request → Fork → Proposal → Review → 일부 또는 전체 적용 → 새 Revision

이 순서는 필수가 아니다. Discussion은 방향·해석·아이디어를 자유롭게 논의하는 공간이고, Issue는 해결할 구체적 문제다. Design Request는 프로젝트 관리자가 외부에 요청하는 명확한 디자인 작업이다. Discussion에서 Issue나 Request가 생길 수 있고, 그 과정 없이 Proposal을 제출하거나 Fork에서 독립적인 해석을 이어갈 수도 있다.

Revision은 프로젝트의 실제 변화를 보존하는 불변 기록이다. Release는 여러 Revision을 **현재 시점의 디자인 방향을 보여 주는 판본**으로 묶는다. 완료 선언은 아니다. 프로젝트 상태도 완성도가 아닌 활동 상태를 표현한다(예: Active, Paused, Archived). `Completed`·`Final`·`Stable`을 제품의 중심 상태로 삼지 않는다.

초기 공식 Contributor 범주는 **채택된 Proposal의 작성자와 그 Proposal의 Reviewer**로 한정한다. Discussion 참여, Issue 제보, 조언, 참고 자료 제공 등은 필요하면 Proposal이나 Revision 설명에서 인정한다. 활동마다 별도 Contributor 유형을 만들지 않는다.

## 발견과 커뮤니티

사람 사이의 관계보다 **사람과 프로젝트의 관계**를 중심에 둔다. Star는 관심·응원·다시 보기의 표현으로 두되, Star 수로 강한 인기 순위나 품질 점수를 만들지 않는다. 사람 Follow 대신 프로젝트 Follow/Watch로 Revision·Release·Proposal 등의 변화를 따라가게 한다.

전역 Feed는 조용하게 유지하고 Revision·Release처럼 프로젝트에 실질적인 변화가 생긴 결과를 주로 보여 준다. 프로젝트 상세에서는 Proposal·Discussion·Issue·Design Request·Review까지 과정과 맥락을 볼 수 있게 한다. 게시물이나 활동도 가능하면 Project·Revision·Release·Proposal과 연결한다. 목적은 콘텐츠 소비보다 프로젝트 발견·이해·참여다.

## 제품 경계

ODR은 완성작 인기 경쟁을 위한 포트폴리오 SNS, 사람 Follow와 개인 브랜딩 중심의 일반 SNS, 자체 디자인 편집기, 단순 파일 저장소를 목표로 하지 않는다. 도구가 달라도 프로젝트의 원본·변경·출처·기여를 이어 갈 수 있어야 한다.
