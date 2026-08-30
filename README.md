# Open Design Registry

도구 중립적인 공개 디자인 프로젝트 저장소의 1단계 수직 슬라이스입니다. 이메일/비밀번호 로그인, 선택적 GitHub OAuth, 프로젝트 생성과 공개·비공개 열람을 제공합니다.

## 시작하기

요구 사항: Node.js 20+, PostgreSQL 16, S3 호환 스토리지(MinIO 또는 R2).

```bash
cp .env.example .env.local
npm install
npx prisma migrate dev --name init
npm run dev
```

최소 검증은 `npm test`, 프로덕션 빌드는 `npm run build`입니다. `.env.local`의 `DATABASE_URL`과 S3 값을 환경에 맞게 바꾸세요. GitHub OAuth는 두 `GITHUB_*` 값이 모두 있을 때만 활성화됩니다.

## 권한 규칙

- 익명 사용자는 공개 프로젝트만 목록·상세에서 볼 수 있습니다.
- 로그인 사용자는 공개 프로젝트를 만들 수 있으며 자신의 비공개 프로젝트도 볼 수 있습니다.
- 비공개 프로젝트를 다른 사용자가 요청하면 존재 여부를 노출하지 않고 `404`를 반환합니다.
- 대표 이미지는 PNG/JPG만 허용하며 10MB를 넘을 수 없습니다.
