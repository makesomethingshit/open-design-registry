# 랜딩 후속 시안 (#102)

현재 `/`는 Aster 작업물 예시, 공개 원본, Revision 이력과 기여 흐름을 보여준다. `/explore`는 공개 검색과 탐색, `/projects`는 내 프로젝트라는 계약을 유지한다. [사용자 피드백](https://github.com/makesomethingshit/open-design-registry/pull/110#issuecomment-5988577526)으로 A 구성이 선택됐다. 이번 수정은 특정 디자인 툴에 종속되지 않는 내용과 표현을 검토하는 시안이며 제품 구현은 아직 포함하지 않는다.

## 현재 화면에서 개선할 점

- 중앙 히어로의 높이가 커 작업물 이미지가 첫 화면 아래로 밀린다. 문장과 CTA의 공간을 줄여 작업물을 더 일찍 보여준다.
- 보라색 stage 바깥 여백과 제품 창 내부 여백이 겹친다. 프레임을 간결하게 만들어 실제 작업물의 면적을 늘린다.
- 기능 패널의 제목·설명·예시가 반복된다. 원본 → 변경 이력 → 기여의 순서가 읽히도록 간격과 정렬선을 맞춘다.
- 모바일에서는 원본과 이력 패널을 이미지 다음에 유지하되, 작은 설명을 지나치게 축소하지 않는다.

## 참고 사이트에서 확인한 구조

2026-10-05에 공식 랜딩을 확인했다. 아래의 ODR 적용은 참고 구조를 바탕으로 한 제안이며 특정 사이트의 스타일 복제를 요구하지 않는다.

| 참고 | 확인한 내용 | ODR에 적용할 점 |
| --- | --- | --- |
| [Penpot](https://penpot.app/) | 짧은 제품 설명과 시작 CTA 뒤에 실제 앱 화면, 기능별 화면을 배치한다. | 설명과 작업물 미리보기 사이의 거리를 줄이고, 원본·이력의 구체적인 증거를 함께 보여준다. |
| [Framer](https://www.framer.com/) | 제품 소개와 편집 가능한 예시 화면을 기능 섹션에 반복해 연결한다. | 추상적인 약속보다 실제 예시의 원본과 변경 과정을 연결한다. |
| [Figma](https://www.figma.com/) | 디자인·코드·협업이라는 가치와 제품 작업 맥락을 연결한다. | ODR 고유의 공개 원본·출처·Revision·Proposal 맥락을 유지한다. |

## A. 현재 구성 정제 (선택됨)

중앙 히어로는 유지한다. 데스크톱 히어로와 stage 간 거리를 줄이고 제품 창의 프레임을 정리한다. 작업물 이미지·원본·변경 이력을 함께 보여주는 구조를 유지한다. 모바일에서는 CTA 다음에 작업물을 바로 보여준다. 새 데이터 조회는 추가하지 않는다.

특정 툴 이름을 나열하던 섹션을 **원본 파일·에셋·외부 원본 링크**라는 작업물의 구성으로 바꾼다. 핵심 가치는 파일을 보관하고 출처·권리·변경 이력·다음 기여를 함께 이어가는 것이다. Penpot은 이번 시안을 편집하는 수단이며 ODR 사용의 전제 조건이 아니다.

| 기존 표현 | 수정한 표현과 이유 |
| --- | --- |
| Penpot / Figma / SVG / Source files | Editable files / Assets / Source links: 툴 브랜드 대신 보관·공유할 수 있는 내용물을 보여준다. |
| aster-identity.penpot | aster-identity.zip + packaging.svg: 예시 원본 묶음과 에셋이며 특정 앱 사용을 요구하지 않는다. 실제 데이터나 변환 기능을 추가하는 것은 아니다. |
| Different tools. Shared progress. | Keep the source. Move the work forward.: 앱의 다양성보다 공개 원본과 후속 기여에 집중한다. |
| Tool-led product description | Source, credit, revision and contribution: 기존 제공 기능을 설명하고 모든 파일의 브라우저 편집·미리보기를 보장하지 않는다. |

장점: 현재 승인된 제품 이야기와 CTA 순서를 이어가며 시각 완성도에 집중할 수 있다. 단점: 중앙 헤드라인과 예시 창이라는 기본 구도는 유지된다.

## B. 작품 우선 구성 (이전 비교안)

데스크톱 첫 화면을 좌우로 나눠 왼쪽에는 제목·설명·CTA, 오른쪽에는 Aster 이미지와 원본·Revision 정보를 배치한다. 모바일에서는 제목 → CTA → 작업물 → 출처·이력 순서로 쌓는다. 기존 기능 패널은 아래에 유지한다.

장점: 방문자가 첫 화면에서 작업물을 먼저 평가할 수 있다. 단점: 텍스트와 작업물에 줄 수 있는 폭이 줄어들고, 기존 중앙 히어로의 인상과 상세 미리보기 표현을 다시 검토해야 한다.

## 결정과 완료 조건

구성은 **A로 결정**됐다. 수정한 툴 중립적 내용과 시각 결과를 검토한 뒤 제품에 적용한다. A/B를 다시 선택할 필요는 없다. 이 제안만으로 #102를 닫지 않는다.

구현 후에는 320·390·768·1440px의 라이트·다크 화면에서 가로 넘침과 텍스트 잘림을 측정하고, 동일 크기 Penpot 시안과 구현 PNG를 비교한다. 탐색·생성·기여 CTA, 전역 검색, 키보드 접근과 reduced-motion 동작을 함께 확인한다. 전역 헤더 구조는 #87, 버튼과 카드 표현은 #79에서 다룬다.

## 비교 시안과 확인한 범위

- [A / 데스크톱 1440](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-bd4168e17064)
- [A / 모바일 390](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-bd4173ff237e)
- [B / 데스크톱 1440](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-bd7fbf948771)
- [B / 모바일 390](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-bd7fca39f758)
- [A/B 비교 HTML](issue-102-preview.html): 최초 비교안 보관 자료이며 이번 피드백 수정은 아래 최신 Penpot 보드를 기준으로 검토한다.

A/B 모두 원격 MCP로 만든 편집 가능한 Penpot 보드다. B는 제목·CTA와 Aster 작업물을 데스크톱에서 좌우로 나누고 모바일에서 세로로 쌓는다. 기존 공개 원본·Revision·기여 패널, 버튼 component instance와 Aster 벡터를 재사용한다. 기존 여섯 보드의 이름·위치·크기를 보존했다. 보드 범위와 PNG 표시를 확인하며, PNG는 PR 코멘트에 첨부한다.

최초 A/B 보드는 비교 이력으로 보존했다. 최신 A 수정안 링크와 PNG는 아래에 기록한다. 실제 제품의 검색·라우팅·포커스 회귀, 320·390·768·1440px와 light/dark 조합의 acceptance 검증은 구현에서 수행한다. 이번 Penpot 피드백 검증은 보드 범위·텍스트·기존 벡터·버튼 instance 및 데스크톱/모바일 PNG에 한정한다.

## 최신 A 수정안 · 툴 중립적 내용

- [데스크톱 / 1440](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be15f5a0c4ce)
- [모바일 / 390](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be15fea2cbf4)

기존 A 보드를 보존하고 별도 수정 보드를 만들었다. 툴 브랜드 나열과 .penpot 예시를 제거하고 원본 파일·에셋·외부 원본 링크·출처·권리·Revision·후속 기여를 중심으로 내용을 바꿨다. 시안 제작 도구와 제품이 받아들이는 작업물의 범위를 구분한다.
