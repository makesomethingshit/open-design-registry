# #79 P1 디자인 결정 제안

상태: **A 결정 완료, B 결정 대기**

사용자 결정: [A2 cover interaction 수락](https://github.com/makesomethingshit/open-design-registry/pull/111#issuecomment-5988585777)

현재 B 방향: **B4 Work-first contextual actions 제안, 아직 미수락**

이 문서는 구현 PR이 아니다. A2는 구현 대상으로 기록하고, B4는 native Penpot 보드에서 확인할 다음 방향으로 남긴다. 제품 코드는 변경하지 않는다.

## 결정 기록

- **A2 — Contained reveal label:** 수락됨. Cover 안쪽 아래에만 짧은 scrim과 `Open project ↗` label을 reveal한다. 4:3 frame, 기존 링크, 작업물·상태·권리·버전 metadata는 유지한다.
- **B1/B2/B3:** 모두 거절됨. 이 세 안은 더 이상 선택지나 구현 대상으로 남기지 않는다. 아래 B4는 행동을 작업물의 맥락 안에 배치해 보는 새로운 제안이다.
- **B4 — Work-first contextual actions:** 새 제안이며 미수락이다. 최신 Penpot Landing·Contribute 보드에서 배치를 확인하고 결정한다.

## 현재 코드에서 지켜야 할 경계

- [`ProjectCard`](../../src/components/design/project-card.tsx#L20-L38)는 4:3 media 안에 원본 이미지를 `contain`으로 보여 주고, cover에는 [`mediaLink`](../../src/components/design/project-card.tsx#L24-L28) 하나만 둔다. 제목과 metadata는 cover 밖에 있다.
- [`project-card.module.css`](../../src/components/design/project-card.module.css#L1-L14)의 `aspect-ratio: 4 / 3`과 `overflow: hidden`을 유지한다. A2는 frame 안에서만 보이고, hover/focus 중 bounding box·grid track·주변 카드 위치를 바꾸지 않는다.
- Landing은 현재 [`Explore projects`](../../app/page.tsx#L7-L19)와 `Create a project`를 같은 hero row에 둔다. B4에서는 hero에 Explore 하나만 남기고, Create는 example 아래의 별도 생성 안내으로 옮긴다. URL `/explore`, `/projects/new`는 유지한다.
- Contribute의 [`Search`](../../app/contribute/page.tsx#L81-L95)는 현재 기본 `primary` Button이다. B4에서는 입력에 붙은 compact `secondary` utility로 보인다. 검색 query와 GET 경로는 바꾸지 않는다.
- 현재 request의 [`View request`](../../app/contribute/page.tsx#L102-L125)는 보이는 span이고 제목이 request URL로 연결된다. B4에서는 request content/title/rights·version metadata를 먼저 읽게 하고, 같은 request URL로 가는 inline `View request` link를 뒤에 둔다.
- 표현은 [`button.module.css`](../../src/components/ui/button.module.css#L1-L51)의 기존 `primary`, `secondary`, `ghost`, `danger`와 [`tokens.css`](../../src/styles/tokens.css#L54-L155)의 의미 토큰만 사용한다. 새 variant나 새 상태 모델은 만들지 않는다.

## A. 수락된 cover direction — A2

pointer hover와 `:focus-visible`에서 media frame 안쪽 아래에만 scrim과 `Open project ↗`를 표시한다. 이미지 자체는 frame 밖으로 커지지 않는다. coarse pointer에서는 hover를 전제로 하지 않도록 label을 표시할 수 있어야 하며, `prefers-reduced-motion: reduce`에서는 transition과 transform을 제거한다.

A1과 A3는 초기 비교안으로 닫혔다. 이후 선택을 요청하지 않는다.

### A acceptance mapping

| #79 기준 | A2 결정 | 구현 PR에서 확인할 증거 |
| --- | --- | --- |
| cover hover/focus로 작업물과 상세 진입 강조 | contained scrim + `Open project` label | 실제 ProjectCard 이미지의 pointer hover와 keyboard focus 캡처 |
| 권리·버전 정보와 탐색 유지 | media 내부만 변경, 기존 href·content·metadata 유지 | `ProjectCard` static markup 및 Explore route 확인 |
| 위치·크기/layout shift 없음 | 4:3 frame과 카드 문서 흐름 고정 | desktop 2/3열과 mobile 1열의 bounding box 비교 |
| keyboard parity | media link의 focus-visible이 hover와 같은 의미를 표시 | Tab 순서, focus ring, Enter 이동 확인 |
| reduced motion·성능 | motion 제거, 기존 lazy/eager 이미지 요청 유지 | reduced-motion browser check와 이미지 로딩 확인 |

## B. 새 제안 — B4 Work-first contextual actions

B4는 **작업물을 먼저 읽고, 다음 행동은 맥락 안에서 찾는** 방향이다. 아직 수락된 디자인이 아니며, 최신 Penpot 보드로 검토한다.

### Landing

- Hero에는 `Explore projects` **primary** 하나만 둔다.
- `Create a project`는 example 아래 별도 callout으로 옮긴다. callout은 modest한 surface와 기존 TextLink 표현을 사용하고, hero의 두 번째 큰 button처럼 보이지 않게 한다.
- example의 작업물, source/history 문맥, `/explore`와 `/projects/new` URL은 유지한다.

### Contribute

- 검색 input에 붙는 compact `Search` **secondary** utility로 표현한다. 독립적인 큰 검정 button이나 별도 panel을 추가하지 않는다.
- request card에서는 request content, title, rights·version metadata와 project context를 먼저 둔다.
- `View request`는 그 정보 뒤에 놓는 inline link로, 기존 `requestHref`를 사용한다. 제목 link의 중복 대형 control이 되지 않게 한다.
- `Clear filters`, project title, pagination 등 탐색 link는 기존 `TextLink` 역할을 유지한다.
- 기존 Filters의 tool·tag·license 조건, 결과 수·pagination, 요청 이미지의 linked Revision/project cover 출처는 유지한다. 시안의 예시 콘텐츠는 새 데이터 필드를 요구하지 않는다.

`Explore projects`, `Create a project`, `View request`는 페이지 이동 link이므로 hover/focus와 keyboard activation을 확인한다. `Search`처럼 화면 안에서 실행되는 Button만 기존 disabled/loading 상태를 사용한다. link에 동작하지 않는 disabled/loading 표현을 새로 만들지 않는다.

### B4가 해결하려는 것

현재 Landing은 hero에서 두 행동이 같은 row에 있고, Contribute는 Search가 기본 primary이며 View request가 실제 link가 아니다. B4는 새 컴포넌트나 새 variant를 추가하지 않고, primary는 사용자가 처음 탐색할 한 행동에만 쓰고 나머지는 작업물과 request 설명 뒤에 배치한다.

## Acceptance mapping

| #79 기준 | 현재 결정 | 구현 PR에서 확인할 증거 |
| --- | --- | --- |
| A: cover interaction | A2 수락 | A2 표와 별도 cover PR 검증 |
| A: no geometry/layout shift | 4:3 media frame과 카드 흐름 유지 | 실제 desktop/mobile geometry 비교 |
| A: keyboard/reduced motion | hover와 focus-visible 의미를 맞추고 reduced motion에서 동작을 단순화 | keyboard 및 reduced-motion browser check |
| A: 실제 작업물 이미지 | Aster preview는 방향 확인용이며 acceptance 증거가 아님 | 실제 project asset으로 desktop/mobile 확인 |
| B: Landing hierarchy | B4 제안: hero는 Explore primary 하나, Create는 example 아래 callout | native Penpot board 결정 후 Landing 캡처 |
| B: Contribute hierarchy | B4 제안: input-attached secondary Search, 설명 뒤 inline View request | native Penpot board와 request route 확인 |
| B: 기존 variants/tokens | 기존 library variant와 token만 사용 | 새 variant·임의 색·전역 component diff 없음 |
| B: 상태와 keyboard | 실행 Button의 상태만 확인하고 navigation link에 disabled/loading을 만들지 않음 | Search Button 및 모든 link의 semantics/focus 확인 |

## 구현 경계와 시각 검토의 한계

결정 후 A는 `src/components/design/project-card.tsx`/`.module.css`와 해당 테스트에 한정한다. B는 `app/page.tsx`/`.module.css`, `app/contribute/page.tsx`/`.module.css`와 해당 테스트에 한정한다. 새 route, API, data field, global header, page transition, 다른 화면의 button 일괄 변경은 포함하지 않는다.

현재 [HTML preview](./issue-79-preview.html)는 A2와 B4의 보조 자료다. 최신 Penpot 보드를 주요 검토 기준으로 사용한다. 실제 제품의 keyboard·reduced-motion·라우팅·layout shift와 실제 작업물의 시각 품질은 구현 PR에서 확인해야 한다.

## 남은 결정

**B4를 native Penpot 보드 기준으로 수락할 것인가?**

수락 전에는 B4를 제품 코드에 적용하지 않는다. A2는 이미 선택된 방향이며 재선택을 요구하지 않는다.

## 최신 Penpot 시안

| B4 화면 | 데스크톱 | 모바일 |
| --- | --- | --- |
| Landing | [1440px](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be1740e72ade) | [390px](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be17495131cc) |
| Contribute | [1440px](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be179dabf2cb) | [390px](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be17b6d47501) |

기존 원본·Revision 문맥과 Aster 벡터, 버튼 component instance를 재사용했다. Filters와 요청 이미지의 linked Revision 출처를 유지한다. 기존 비교 보드는 보존한다. A2 선택은 확정이며 B4만 새 검토 대상이다. 실제 제품 코드는 아직 변경하지 않았다.
