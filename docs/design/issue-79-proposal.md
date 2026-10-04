# #79 P1 디자인 결정 제안

상태: **구현 전 사람의 선택 필요**

범위: Project card cover interaction과 Landing/Contribute action hierarchy

제안: **A2 + B1**

이 문서는 구현 PR이 아니다. 현재 코드가 허용하는 선택지를 좁히고, 구현 전에 결정할 조합을 제안한다. A와 B는 결정 후에도 별도 PR로 유지한다.

## 현재 코드에서 확인한 제약

- [`ProjectCard`](../../src/components/design/project-card.tsx#L20-L38)는 4:3 media 안에 원본 이미지를 `contain`으로 보여 주고, cover에는 [`mediaLink`](../../src/components/design/project-card.tsx#L24-L28) 하나만 둔다. 현재 cover hover/focus 상태는 없고, 제목 링크와 권리·버전 관련 metadata는 cover 밖에 있다.
- [`project-card.module.css`](../../src/components/design/project-card.module.css#L1-L14)의 frame이 이미 `aspect-ratio: 4 / 3`과 `overflow: hidden`을 보장한다. interaction은 이 frame 안에서만 일어나야 한다.
- Landing은 [`Explore projects`](../../app/page.tsx#L7-L19)를 `primary`, `Create a project`를 `secondary`로 이미 구분한다. 모바일에서는 두 링크가 같은 폭으로 줄어들기 때문에 순서와 세로 배치가 결정 대상이다.
- Contribute의 [`Search`](../../app/contribute/page.tsx#L81-L95)는 기본값인 `primary` Button을 사용한다. 각 request의 [`View request`](../../app/contribute/page.tsx#L102-L125)는 현재 보이는 문구만 있고 실제 링크가 아니다. 제목은 같은 request URL로 연결된다.
- 선택지는 [`button.module.css`](../../src/components/ui/button.module.css#L1-L51)의 기존 `primary`, `secondary`, `ghost`, `danger`와 [`tokens.css`](../../src/styles/tokens.css#L54-L155)의 의미 토큰 안에서 해결한다. 새 variant, 전역 header 변경, route 변경은 필요하지 않다.

## A. Project card cover interaction

모든 안은 다음을 고정한다.

- cover의 기존 링크와 제목·상태·설명·owner·license·tag metadata를 보존한다.
- frame의 4:3 크기와 카드의 문서 흐름을 바꾸지 않는다. hover/focus 중에도 bounding box, grid track, 주변 카드 위치가 바뀌지 않는다.
- pointer hover와 `:focus-visible`이 같은 의미인 “프로젝트 상세 열기”를 보여 준다.
- `prefers-reduced-motion: reduce`에서는 transition과 transform을 제거한다. 터치 환경에는 hover만으로 정보를 숨기지 않는다.

### A1 — Frame emphasis

hover/focus에서 frame border를 accent로 바꾸고 이미지에 작은 contained scale을 적용한다. 별도의 문구나 overlay는 두지 않는다.

장점은 가장 조용하고 현재 작업물 이미지를 가장 그대로 보인다는 점이다. 단점은 사용자가 무엇을 할 수 있는지의 문구가 없고, 카드 interaction이 현재의 제목 underline과 비슷하게 읽힐 수 있다는 점이다.

### A2 — Contained reveal label **(추천)**

hover/focus에서 frame 안쪽 아래에만 짧은 scrim과 `Open project ↗` label을 reveal한다. 이미지는 frame 밖으로 커지지 않는다. `:focus-visible`은 같은 label을 보여 주고, coarse pointer에서는 label을 기본 표시해 touch에 hover를 요구하지 않는다.

작업물의 표면을 가리지 않으면서 상세 진입의 이유와 결과를 가장 분명하게 전달한다. 변화는 frame 내부의 opacity와 border뿐이므로 layout shift를 피하기 쉽고, 현재 media link 구조를 그대로 사용할 수 있다.

### A3 — Active media surface

hover/focus에서 이미지 위에 accent-soft tint와 frame outline을 적용하고 `View project` label을 중앙에 둔다. A2보다 눈에 잘 띄지만 cover가 많은 탐색 화면에서는 모든 카드가 동시에 강해져 작업물보다 control이 앞설 위험이 있다.

## B. Landing / Contribute action hierarchy

### B1 — 명확한 두 단계 **(추천)**

- Landing: `Explore projects`는 `primary`, `Create a project`는 `secondary`를 유지한다. desktop은 현재의 가로 순서, mobile은 primary를 먼저 둔 세로 stack으로 확인한다.
- Contribute: 검색은 목록 필터를 실행하는 utility이므로 `secondary`로 낮춘다. `View request`는 현재 request URL을 가리키는 실제 link로 만들고 `secondary` control 표현을 사용한다. 제목 link와 같은 목적지를 가지되, 반복 목록에서 별도 진입점으로 읽히게 한다.
- `Clear filters`, project title, pagination 같은 보조 탐색은 `TextLink`로 유지한다.

`Search`처럼 화면 안에서 실행되는 Button은 기존 disabled/loading 상태를 그대로 사용한다. `Explore projects`, `Create a project`, `View request`는 페이지 이동 link이므로 hover/focus와 keyboard activation을 확인하고, 동작하지 않는 loading 상태를 만들어내지 않는다.

현재 variant와 token을 재사용하면서 landing의 진입 행동과 request 목록의 진입 행동을 구별한다. Contribute 카드마다 강한 검정 primary를 반복하지 않아 작업물과 request 내용이 앞에 남는다.

### B2 — Quiet secondary

Landing의 `Explore projects`만 `primary`로 두고 `Create a project`는 `ghost`로 낮춘다. Contribute의 `View request`는 실제 `TextLink`로 만들고 검색은 `secondary`로 둔다.

화면은 가장 가벼워지지만, Create와 View request의 행동성이 약해지고 #81의 “중요한 행동과 보조 행동의 위계가 약하다”는 문제를 충분히 해결하지 못할 수 있다.

### B3 — Action-led request cards

Landing은 B1과 같게 두고, Contribute의 `View request`를 `primary` control로 강조한다. request를 바로 여는 목적은 분명하지만, 목록의 모든 카드가 같은 강한 control을 가지므로 작업물 중심 원칙과 충돌할 수 있다.

## 추천 조합과 이유

**A2 + B1**을 권한다.

A2는 cover 자체를 상세 진입의 affordance로 만들되 이미지 비율·카드 높이·metadata를 건드리지 않는다. A1은 조용하지만 행동을 설명하지 않고, A3은 작업물보다 overlay가 앞설 가능성이 있다.

B1은 기존 variant 체계를 실제 사용 맥락에 맞춘다. Landing의 두 행동은 이미 올바른 관계를 가지고 있으므로 mobile 순서와 폭만 명시하면 된다. Contribute는 `Search`가 현재 primary인 반면 `View request`가 실제 link가 아니라는 구체적인 불일치가 있어, 새 디자인 언어를 만들기보다 기존 secondary 표현과 실제 link semantics로 정리하는 편이 가장 작다.

## Acceptance mapping

| #79 기준 | 결정할 내용 | 구현 PR에서 확인할 증거 |
| --- | --- | --- |
| A: cover hover/focus로 작업물과 상세 진입 강조 | A2의 contained scrim + `Open project` label | 실제 ProjectCard 이미지에서 pointer hover와 keyboard focus 상태 캡처 |
| A: 권리·버전 정보와 탐색 유지 | media 내부만 변경, content/metadata와 기존 href 유지 | `ProjectCard` static markup 및 Explore route 확인 |
| A: 위치·크기/layout shift 없음 | 4:3 frame, grid, 카드 높이의 base geometry 유지 | desktop 2/3열과 mobile 1열의 bounding box 비교 |
| A: keyboard parity | media link의 `:focus-visible`이 hover와 같은 label을 표시 | Tab 순서, focus ring, Enter 이동 확인 |
| A: reduced motion·성능 | transform/transition 제거, 이미지 요청 방식 유지 | reduced-motion browser check와 기존 lazy/eager 동작 확인 |
| B: Landing hierarchy | `Explore projects` primary, `Create a project` secondary; mobile primary-first stack | default/hover/focus/disabled/loading은 공통 Button 기준으로 확인하고, link focus는 별도 확인 |
| B: Contribute hierarchy | Search secondary, `View request`는 requestHref로 가는 실제 secondary link | title link와 View request의 목적지·keyboard activation 확인 |
| B: 기존 variants/tokens 우선 | 새 variant·임의 색·새 전역 component 없음 | diff 범위를 `app/page*`, `app/contribute/page*`와 필요한 테스트로 확인 |
| B: desktop/mobile 순서·강조·간격 | desktop 가로, mobile primary-first stack과 touch target | 1440px 및 390px 실제 화면 확인 |

## 구현 경계

결정 후 A는 `src/components/design/project-card.tsx`/`.module.css`와 해당 테스트, B는 `app/page.tsx`/`.module.css`, `app/contribute/page.tsx`/`.module.css`와 해당 테스트에 한정한다. 새 route, API, 데이터 필드, global header, page transition, 다른 화면의 버튼 일괄 변경은 포함하지 않는다.

실제 작업물 이미지로 desktop/mobile을 확인해야 한다. 이 문서와 preview의 Aster asset은 방향을 비교하기 위한 기존 로컬 asset이며 제품 acceptance의 시각 품질 증거를 대신하지 않는다.

## 결정이 필요한 질문

1. Cover는 **A2 (추천)**, A1, A3 중 어느 안으로 구현할 것인가?
2. Action hierarchy는 **B1 (추천)**, B2, B3 중 어느 안으로 구현할 것인가?

추천 조합을 채택하면 다음 구현 단위는 **A2 cover PR**과 **B1 action PR** 두 개다. 선택이 남아 있는 동안에는 구현하지 않는다.

## 편집 가능한 Penpot 비교 시안

- [데스크톱 / 1440](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-bd7e111f873d)
- [모바일 / 390](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-bd7e9a9c5e3a)

A1/A2/A3의 기본·hover/focus 표현과 B1/B2/B3의 Landing·Contribute 버튼 위계를 같은 작업물로 비교한다. 모바일 A2는 touch에서 label을 표시한다. 기존 Aster 벡터와 버튼 component instance를 재사용하며, 모든 텍스트와 도형은 편집 가능하다. PNG는 PR 코멘트에 첨부한다. HTML preview는 보조 자료로 유지한다.

시안의 보드 범위와 PNG 표시를 확인한다. 실제 제품의 keyboard·reduced-motion·라우팅과 layout shift 검증은 방향 결정 후 구현 PR에서 수행한다. 선택은 여전히 미정이다.
