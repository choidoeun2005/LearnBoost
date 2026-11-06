# LearnBoost — SideQuestly local

SideQuestly 공개 페이지와 디자인을 로컬에 보관하고, 공개 앱 화면을 참고해 React 작업 공간을 구현한 프로젝트입니다. 원본의 비공개 소스나 로그인 후 전체 동작을 확보한 완전한 복제본은 아닙니다.

## 실행

Node.js 22.13 이상이 설치되어 있으면, GitHub에서 내려받은 폴더에서 아래 명령 하나로 실행할 수 있습니다. 첫 실행에는 패키지를 내려받을 인터넷 연결이 필요합니다.

```sh
npm start
```

`npm start`는 `package-lock.json`에 맞춰 필요한 패키지를 자동 설치하고, 화면을 빌드한 다음 서버를 실행합니다. 같은 Node.js 버전과 잠금 파일로 다시 실행하면 설치를 건너뜁니다. 화면을 띄우기 위해 `.env`를 만들거나 모델을 설치할 필요는 없습니다. 실제 AI 답변에는 Furiosa API 인증이 필요합니다.

- 홈페이지: http://127.0.0.1:3000
- 로컬 작업 공간: http://127.0.0.1:3000/app
- 개발 모드: 최초 `npm ci` 후 `npm run dev`
- 빌드만 실행: `npm run build`
- 검증: `npm test`

기본적으로 `127.0.0.1`에서만 실행하는 단일 사용자 앱입니다. 계정과 결제는 연결하지 않으며, 공개 페이지의 시작 버튼은 로컬 작업 공간으로 이동합니다. 홈페이지에 보이는 요금·모델 안내는 원본 사이트의 소개 콘텐츠이고 이 로컬 앱에서 제공하는 상품이나 기능 보장이 아닙니다.

## 답변 생성 모델

답변은 `furiosa_serving_features_8.ipynb`에 안내된 **Furiosa EXAONE 생성 API**를 사용합니다. 로컬 모델 설치·실행은 필요하지 않습니다. PDF 가이드는 문서 검색용 임베딩·reranker에 사용합니다.

처음 설정할 때 `.env.example`을 `.env`로 복사하고 제공받은 API 키를 입력합니다. 이미 `.env`가 있으면 기존 키를 보존하세요. 설정을 변경한 뒤에는 서버를 재시작합니다.

```dotenv
LLM_BASE_URL=https://endpoint.access.furiosa.dev/v1
LLM_MODEL=furiosa-ai/EXAONE-4.0-32B-FP8
LLM_API_KEY=your-furiosa-api-key
```

브라우저는 로컬 서버의 `/api/chat`을 호출하고, 서버가 Bearer 인증을 붙여 Furiosa의 `/v1/chat/completions`에 요청합니다. 키는 서버에서만 읽으며 브라우저·로그·응답에 포함하지 않습니다. `.env`는 Git에서 제외됩니다.

작업 공간의 **새 대화 → 질문 입력 → Enter**로 실제 답변을 받을 수 있습니다. 대화 기록과 워크스페이스 문맥도 전달되므로 후속 질문과 분기 대화가 이어집니다. 문서 없이도 일반 대화가 가능하고, 문서를 선택하면 검색 결과와 출처를 함께 사용합니다. 응답은 생성 완료 후 표시하며 출력 한도에 도달하면 이어서 질문할 수 있도록 알립니다. 설정 창의 **연결 확인**으로 API 인증과 모델 목록을 확인할 수 있습니다.

작업 공간의 메뉴, 안내, 날짜, 기본 예시를 한국어로 제공합니다. 답변도 기본적으로 한국어로 생성하며, 질문에서 다른 언어를 명시하면 해당 언어로 답합니다. 기존 데이터에서는 수정하지 않은 기본 예시만 한 번 번역하고, 직접 작성하거나 수정한 대화·노트·할 일은 보존합니다. 공개 페이지 스냅샷과 원본 문서의 내용은 원문을 유지합니다.

수식은 `$...$`, `$$...$$`, `\(...\)`, `\[...\]` 표기를 지원합니다. 기존에 저장된 답변에도 적용되며, 일반 코드 블록 안의 LaTeX 예제는 코드로 유지합니다. 수식 폰트는 앱 빌드에 포함되어 외부 폰트 서버 없이 표시됩니다. 파싱과 렌더링에는 [remark-math](https://github.com/remarkjs/remark-math)와 [KaTeX](https://katex.org/docs/options)를 사용합니다.

## Furiosa 문서 검색

PDF 가이드에 따른 기본값:

| 용도 | 엔드포인트 | 모델 |
| --- | --- | --- |
| Embedding | `http://eval.nxt.furiosa.ai:37030/v1/embeddings` | `furiosa-ai/bge-m3` |
| Reranker | `http://eval.nxt.furiosa.ai:37040/v1/rerank` | `furiosa-ai/bge-reranker-v2-m3` |

API 키는 필요하지 않습니다. 가이드상 사용 기간은 **2026-10-27 ~ 2026-12-09**입니다. 공유 서버이므로 임베딩은 최대 16개 텍스트씩 묶어서 요청하며 서버 관리·SSH 명령은 실행하지 않습니다.

1. **문서**에서 PDF, TXT, MD를 업로드합니다. 업로드 시점에는 로컬에만 저장합니다.
2. **Furiosa로 검색 준비**를 누르면 추출한 텍스트가 Furiosa 서버로 전송됩니다.
3. 채팅 입력창의 `+`에서 인덱싱된 문서를 선택합니다.
4. 질문 임베딩 → 코사인 유사도 상위 12개 → reranker 상위 5개 → 생성 모델 순서로 처리합니다.
5. 답변 아래 출처를 누르면 원문 페이지의 읽기 화면이 열립니다.

**문서 검색만 하기**를 선택하면 생성 모델 없이 검색된 출처만 확인할 수 있습니다. 서비스에 연결할 수 없으면 오류를 표시합니다. 업로드는 20 MB, PDF는 300쪽으로 제한하며 스캔 PDF의 OCR은 지원하지 않습니다.

## 구현 범위

- 공개 페이지 7개: 홈페이지, Product, Branching, Pricing, Science, Impressum, Datenschutz. HTML/CSS/이미지/폰트를 로컬 저장하고 원본 실행 스크립트는 제거했습니다. 테마, 시작 버튼, 기본 링크를 로컬 동작으로 연결했습니다. 원본의 모든 동적 메뉴·계산기는 재현하지 않았습니다.
- 로컬 작업 공간: 워크스페이스 생성·설정, 대화·텍스트 선택 분기·고정, 출처 보기, 검색, 불릿 노트·들여쓰기·접기, 날짜별 저널, 작업·마감일, 수동 메모리, 노트 참조 캔버스·드래그·연결, JSON 내보내기.
- 예제 대화는 UI 사용 예시로 명시되며 실제 API 답변이 아닙니다. 새 질문은 설정된 생성 API를 호출합니다.
- 로그인/Google OAuth, 구독·결제, 다중 사용자·동기화, 다중 모델 비교, 원본의 전체 태그/학습/Atlas 기능, 캔버스 연결의 AI 문맥 자동 구성, 반복 작업, 문서 하이라이트 저장은 미구현입니다.

## 데이터와 백업

채팅·노트·저널·작업·캔버스는 브라우저 `localStorage`에 저장됩니다. 브라우저/포트/호스트가 바뀌면 별도 저장 공간을 사용하므로 `localhost`와 `127.0.0.1` 중 하나를 일관되게 사용하세요. 설정에서 JSON을 내보낼 수 있습니다. JSON 가져오기 UI는 아직 없습니다.

업로드 문서와 벡터는 `data/`에 저장됩니다. `.env`, `data/`, `node_modules/`, `dist/`는 Git에서 제외합니다. 문서는 이 로컬 인스턴스의 워크스페이스가 공유하는 라이브러리입니다. 문서 삭제는 원본 파일과 검색 인덱스를 삭제합니다.

## 원본 스냅샷

출처: https://www.sidequestly.app/ . 스냅샷 시점과 경로는 `public/site/source.json`에 기록합니다. 공개 자산의 권리는 원저작자에게 있습니다. 로컬 참조 구현으로 사용하며 원본 사이트의 약관·개인정보처리방침을 이 앱의 정책으로 적용하지 않습니다.

`npm run reference:sync`는 네트워크에서 공개 페이지와 자산을 다시 받아 기존 스냅샷을 갱신합니다. 기본 실행에는 원본 사이트에 대한 연결이 필요하지 않습니다.

## GitHub 저장소의 하위 폴더로 올리기

소스와 실행 자산을 함께 올리면 됩니다. `node_modules`나 빌드 결과를 모두 올릴 필요는 없습니다. 받은 사람이 `npm start`를 실행하면 자신의 운영체제에 맞는 패키지와 빌드 결과가 만들어집니다.

| 포함할 파일 | 로컬에만 둘 파일 |
| --- | --- |
| `src/`, `server/`, `scripts/` | `node_modules/`, `dist/`, `.runtime/` |
| `public/`의 HTML·이미지·CSS·폰트 | `.env` 등 실제 API 키가 있는 파일 |
| `package.json`, `package-lock.json` | `data/`의 개인 업로드·검색 데이터 |
| `index.js`, `index.html`, `README.md` | `.idea/`, 캐시·로그 |
| `.gitignore`, `.env.example` | 프로젝트 안의 기존 `.git` 디렉터리 |
| 공유하려고 추가한 PDF·노트북 등 자료 | 브라우저의 개인 대화·노트 |

PDF와 `.ipynb`는 제외하지 않습니다. 다만 현재 프로젝트 폴더에는 가이드 원본 파일이 없으므로, 함께 공유하려면 복사 전에 다시 넣어 주세요. 노트북의 코드와 출력에 실제 API 키를 넣지 마세요.

아래에서 `YOUR_NAME/YOUR_REPO`를 올릴 GitHub 저장소 주소로 바꾸세요. 대상 저장소는 GitHub에서 미리 생성해 둡니다. 예시는 기존 프로젝트를 유지하면서, 별도 위치에 저장소를 내려받아 `LearnBoost/` 하위 폴더로 복사합니다.

```sh
cd /Users/choidoeun/WebstormProjects
git clone https://github.com/YOUR_NAME/YOUR_REPO.git learnboost-github
cd learnboost-github

rsync -av \
  --exclude='.git' \
  --include='.env.example' \
  --exclude-from='/Users/choidoeun/WebstormProjects/LearnBoost/.gitignore' \
  '/Users/choidoeun/WebstormProjects/LearnBoost/' \
  './LearnBoost/'

git add -- LearnBoost/
git status --short
git diff --cached --stat
git commit -m "Add LearnBoost app with Korean UI and math rendering"
git push -u origin HEAD
```

대상에 `LearnBoost/`가 이미 있으면 다른 새 하위 폴더 이름을 사용하세요. 이미 대상 저장소를 로컬에 받아 둔 경우에는 `git clone`을 생략하고 그 저장소로 이동한 뒤 복사합니다. 이 프로젝트 내부의 `.git`는 복사에서 제외하므로, 파일들이 중첩된 Git 저장소로 등록되지 않습니다.

Git 작성자 정보가 없다는 오류가 나오면 대상 저장소에서 한 번만 설정한 뒤 커밋을 다시 실행합니다.

```sh
git config user.name "YOUR_NAME"
git config user.email "YOUR_GITHUB_EMAIL"
```

올린 뒤 다른 사람은 저장소를 내려받아 `LearnBoost/`로 이동하고 `npm start`를 실행하면 됩니다. 브라우저 주소는 `http://127.0.0.1:3000/app`입니다.
