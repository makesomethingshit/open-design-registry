# 디자인 시스템

[문서 목차](README.md) · [UI 용어집](terminology.md) · [Proposal 협업](proposals.md)

Paper / Ink / Iris는 중립적인 표면, 읽기 쉬운 본문색, 초점·현재 탐색·링크·실제 상태에 사용하는 강조색을 뜻합니다. 이 문서는 현재 토큰·공통 컴포넌트와 Proposal 화면의 통합 규칙을 설명합니다.

## 토큰과 테마

[`src/styles/tokens.css`](../src/styles/tokens.css)는 기본 값, 의미 토큰, 컴포넌트 별칭, 타이포그래피·간격·형태·컨트롤·초점·그림자·모션·z-index·레이아웃 토큰을 정의합니다. 새 UI에는 임의의 원색 값 대신 `--odr-*` 의미 토큰을 사용합니다.

테마 값은 `light`·`dark`·`system`입니다. [`theme.ts`](../src/lib/ui/theme.ts)의 `odr-theme` 쿠키를 루트 레이아웃이 읽어 첫 렌더 전에 `data-theme`를 설정합니다. 알 수 없는 값은 `light`가 됩니다. 클라이언트 선택기는 세 값만 저장하고 문서 속성을 갱신합니다. `system`은 기본 light이며 `prefers-color-scheme: dark` 안에서 dark가 적용됩니다.

[`legacy-bridge.css`](../src/styles/legacy-bridge.css)는 아직 공통 컴포넌트로 옮기지 않은 화면의 기존 변수를 의미 토큰에 연결합니다. 기존 `repo-*` 클래스 이름만 바꿔서 이 연결을 제거하지 않습니다.

## 타이포그래피와 라이선스

Pretendard Variable v1.3.9를 `public/fonts/PretendardVariable.woff2`에서 제공합니다. 원본은 [Pretendard v1.3.9 태그](https://github.com/orioncactus/pretendard/tree/v1.3.9)이며 SIL Open Font License 1.1은 [`public/fonts/LICENSE.txt`](../public/fonts/LICENSE.txt)에 보존합니다. `font-display: swap`으로 로딩 중 시스템 글꼴을 사용할 수 있습니다.

이름과 본문은 `--odr-font-sans`, Revision 번호·ID·파일 크기·checksum 같은 기술 식별자는 `--odr-font-mono`를 사용합니다. UI 문구는 [용어집](terminology.md)을 따릅니다.

## 공통 컴포넌트

컴포넌트는 [`src/components/ui/`](../src/components/ui/)에 있습니다.

| 역할 | 컴포넌트 |
| --- | --- |
| 행동·링크 | Button, IconButton, TextLink |
| 입력 | Field, Input, Textarea, Select, Checkbox |
| 상태·태그 | Badge, StatusBadge, Tag, TagLink |
| 탐색 | SectionNav, RouteNav, Tabs, SegmentedControl |
| 대화상자·안내 | Dialog, Drawer, Banner, EmptyState |
| 배치 | Stack, Inline, SectionHeader, PageHeader, Panel, Divider |

`Tabs`는 이미 로드한 패널을 바꾸며 방향키·Home·End 탐색을 제공합니다. 섹션과 페이지 탐색은 링크로 유지합니다. Dialog·Drawer는 native modal 동작을 사용하며 초기 초점, Esc 닫기와 실행 버튼으로의 초점 복귀를 처리합니다.

[`status-presentation.ts`](../src/lib/ui/status-presentation.ts)는 서버 상태를 표시용 label·tone·icon으로 바꿉니다. Proposal 상태 계산이나 API enum을 변경하지 않습니다. 공통 UI 문구는 [`copy.ts`](../src/lib/ui/copy.ts)에 둡니다.

## Proposal 화면 통합

Phase B의 컴포넌트 통합은 현재 적용되어 있습니다. [`proposal-review.tsx`](../app/proposals/[id]/proposal-review.tsx)는 다음 컴포넌트를 조합합니다.

| 컴포넌트 | 책임 |
| --- | --- |
| DesignPreview | 이전·현재 미리보기 비교와 내부 toolbar. 원본 media 동작과 누락·실패 안내 유지 |
| ChangeItem | 변경 항목의 표시, 조회와 적용 선택 |
| ReviewInspector | 현재 변경의 리뷰 입력과 결과·오류·재시도 |
| ReviewActionBar | 승인·선택·적용 상태와 실행 행동 |

조회하는 변경, 리뷰 상태, 적용 선택과 적용 실행은 독립적으로 유지합니다. 배치 변경으로 PATCH·POST 입력, 서버 가시성 검사나 데이터 모델을 바꾸지 않습니다. 오류는 해당 행동과 확인 대화상자 안에서 제공합니다.

화면을 변경할 때 ADD·MODIFY·REMOVE·RENAME, 전체 문서 교체, stale과 승인 해제, 부분 적용, 네트워크 복구, 키보드 선택과 비공개 source 가시성 경로를 확인합니다. 도메인 판단과 응답 계약은 [Proposal 협업 가이드](proposals.md)에 있습니다.

## 개발용 catalog와 화면 예시

`/design-system`은 실제 제품 데이터를 조회하지 않는 개발용 fixture catalog입니다. 상태·오류·테마·dialog 스크롤·Preview 비율 등을 확인합니다. [catalog 화면](../app/(internal)/design-system/page.tsx)은 production에서 `notFound()`를 호출합니다. `(internal)` route group 이름 자체를 접근 제어로 취급하지 않습니다.

아래 캡처는 보존된 예시이며 최신 변경의 검증 결과를 대신하지 않습니다.

- [Catalog / light / 1440 × 900](design-system-screenshots/catalog-light-1440x900.png)
- [Catalog / dark / 1440 × 900](design-system-screenshots/catalog-dark-1440x900.png)
- [Catalog / system-light / 390 × 844](design-system-screenshots/catalog-system-390x844.png)
- [Proposal / light / 1440 × 900](design-system-screenshots/review-light-1440x900.png)
- [Proposal / light / 390 × 844](design-system-screenshots/review-light-390x844.png)

## Icons

Production controls use a licensed SVG subset of GitHub Primer Octicons through `src/components/ui/icon.tsx`, following the selected direction in [the icon proposal](design/icon-set-options.md). The subset is pinned to `primer/octicons` commit `1dafaa68a1cef892168aa0fe3d16f0b406715c15`; its MIT notice is next to the source in `octicons.LICENSE.txt`. No icon package or runtime request is needed.

Use the native 16px drawing for compact controls and 24px for standard controls. Keep text labels on project and document actions. Watch uses `bell` for revision/release subscriptions, while Preview uses `eye`. Watch/Contribute retain primary styling and Star/Fork secondary styling; selected state remains exposed through `aria-pressed`. Icons supplement accessible text and are hidden from assistive technology unless given an explicit `title`. Preserve loading spinners and text-only consequential actions such as Save, Cancel and Submit.
