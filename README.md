# 몬컬 도감 체크

메이플스토리 몬스터 컬렉션 체크 사이트 (빌드 없는 정적 사이트 + Supabase).

```
몬컬/
├─ index.html  style.css  app.js
├─ config.js        ← Supabase URL / anon key 넣는 유일한 곳
├─ supabase.sql     ← Supabase SQL Editor에서 실행
├─ .nojekyll
└─ data/ monsters.json, progress-export.json
```

## 로컬에서 보기
```
cd 몬컬
python -m http.server 8000
```
→ 브라우저에서 http://localhost:8000
(파일을 더블클릭해서 열면 data/monsters.json을 못 읽으니 꼭 서버로 열 것)

## 1. Supabase 준비
1. supabase.com 가입 → New project (리전 Seoul/Tokyo)
2. SQL Editor → `supabase.sql` 내용 붙여넣고 Run
3. Authentication → Providers → Email 켜져 있는지 확인
4. Project Settings → API → `Project URL`, `anon public` 키를 `config.js`에 입력

## 2. GitHub Pages 배포
1. github.com → New repository → 이름 예: `moncol` → Public → Create
2. 이 폴더에서:
   ```
   git init
   git add .
   git commit -m "몬컬 도감 체크"
   git branch -M main
   git remote add origin https://github.com/<아이디>/moncol.git
   git push -u origin main
   ```
3. 저장소 → Settings → Pages → Source: **Deploy from a branch** → Branch `main` / `(root)` → Save
4. 1~2분 뒤 주소: `https://<아이디>.github.io/moncol/`

## 3. 로그인 주소 등록 (매직링크)
Supabase → Authentication → URL Configuration
- Site URL: `https://<아이디>.github.io/moncol/`
- Redirect URLs: 위 주소 + (로컬 테스트용) `http://localhost:8000/`

## 4. 기록 옮기기
사이트에서 로그인 → **가져오기** → `data/progress-export.json` → 완료 25개 확인.

## 친구에게 보기 전용으로 공개
1. `supabase.sql` 맨 아래 `public read` 정책 실행
2. 로그인 후 화면 맨 아래 "내 사용자 ID" 복사
3. `config.js` → `PUBLIC_VIEW: true`, `OWNER_USER_ID: "<복사한 ID>"` → 다시 push

## 몬스터 추가
`data/monsters.json`에 새 id(e52, b81…)로 추가. **기존 id는 절대 바꾸지 말 것.**
