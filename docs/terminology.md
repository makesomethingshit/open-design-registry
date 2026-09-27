# UI 용어집

## 기본 원칙

- 기본 UI 언어는 영어입니다. 버튼, 레이블, 도움말, 빈 상태, 오류·성공 메시지, 상태 표시와 접근성 이름도 영어로 씁니다.
- 제품 개념은 아래 표기를 사용합니다. 문장 안에서는 자연스러운 영어 문법에 따라 소문자로 쓸 수 있습니다.
- 코드 식별자, URL, API 필드·상태 값, 저장 데이터는 번역하지 않습니다. 사용자가 작성한 프로젝트·Revision·Proposal 제목과 설명도 원문을 유지합니다.
- 제목과 레이블은 sentence case를 사용합니다. 예: `Project settings`, `Design request`.

## 제품 개념

| 개념 | UI 표기 | 설명 및 사용 기준 |
| --- | --- | --- |
| Project | Project | 디자인 원본, Preview, 변경 이력과 협업을 묶는 기본 단위입니다. |
| Revision | Revision | 발행 시점의 불변 변경 기록입니다. 번호를 붙일 때 `Revision 4`로 씁니다. 일반적인 파일 버전을 뜻하는 `version`과 바꿔 쓰지 않습니다. |
| Release | Release | 현재 디자인 방향을 보여 주도록 여러 Revision을 묶은 판본입니다. 완료 상태를 뜻하지 않습니다. |
| Contribution | Contribution | 원 프로젝트에 돌려보낼 디자인 작업을 준비하는 과정입니다. 작업 공간에서 `base revision`과 `working source`를 구분합니다. |
| Proposal | Proposal | 원 프로젝트에 제출하는 구조화된 변경 제안입니다. 동사는 `propose changes`로 씁니다. |
| Fork | Fork | 원본과 출처를 보존하면서 독립적으로 이어 갈 새 Project 사본입니다. 자체로 비공개를 보장하지 않습니다. 동작 버튼은 `Fork project`처럼 씁니다. |
| Design request | Design request | 프로젝트 관리자가 요청한 구체적인 디자인 작업입니다. 해결할 문제를 기록하는 Issue와 구분합니다. |
| Issue | Issue | 해결이 필요한 구체적인 문제입니다. 자유로운 방향·아이디어 논의는 Discussion으로 표시합니다. |
| Discussion | Discussion | 방향, 해석, 아이디어를 자유롭게 논의하는 공간입니다. |

## 화면 문구

- 제안 경로는 `Contribute` → `Proposal` → `Review`로 표기합니다.
- 제안의 검토 상태는 `Open`, `Changes requested`, `Approved`, `Partially applied`, `Applied`, `Closed`를 사용합니다. `Approved`는 적용 완료를 뜻하지 않습니다.
- `r4`는 좁은 메타데이터에서만 축약 표기로 쓰고, 제목·설명·도움말에서는 `Revision 4`로 씁니다.
- 접근성 이름과 시각 레이블은 같은 제품 용어를 사용합니다.
