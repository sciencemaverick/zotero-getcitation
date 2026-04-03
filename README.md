# Zotero Get Citation

## English

I built this because several Zotero citation-count extensions kept failing in my workflow, and I wanted a smaller, simpler one that I could trust and debug myself.

What it does:

- Adds `Update Citation Counts` to the Zotero `Tools` menu and the item right-click menu
- Adds a `Citations` column to the item list
- Tries sources in this order: `Semantic Scholar` -> `Crossref` -> `INSPIRE-HEP`
- Stores the result in `Extra` as a plain number such as `188`
- Lets you export a support log from settings when something goes wrong

Install:

1. Build the add-on:

   ```sh
   ./scripts/build.sh
   ```

2. Install [`dist/getcitation-0.1.0.xpi`](./dist/getcitation-0.1.0.xpi) in Zotero:
   `Tools` -> `Plugins` -> gear icon -> `Install Add-on From File...`

3. Open Zotero settings:
   `Settings` -> `Get Citation`

4. Optional:
   paste your own `Semantic Scholar API key`

5. Select one or more papers and run:
   `Update Citation Counts`

Troubleshooting:

- If `Semantic Scholar` fails, the add-on falls back to `Crossref` and then `INSPIRE-HEP`
- If something looks wrong, open `Settings -> Get Citation -> Export Log`
- Send the exported `.txt` file when reporting an issue

API sources:

- Semantic Scholar Academic Graph API: https://api.semanticscholar.org/api-docs/graphs
- Semantic Scholar product overview: https://www.semanticscholar.org/product/api
- Crossref REST API: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- INSPIRE-HEP API root currently used by this add-on: `https://inspirehep.net/api/`

Notes:

- I did not find strong evidence that these exact API base URLs change often
- The two Zotero plugins I checked as references use the same endpoint families
- The add-on keeps these base URLs in code in one place, so future updates are straightforward if a provider changes them

## 한국어

기존 Zotero citation-count extension들이 제 환경에서 자주 오류를 냈고, 믿고 직접 고칠 수 있는 더 작고 단순한 버전이 필요해서 이 add-on을 만들었습니다.

기능:

- Zotero `Tools` 메뉴와 논문 right-click 메뉴에 `Update Citation Counts` 추가
- item list에 `Citations` column 추가
- `Semantic Scholar` -> `Crossref` -> `INSPIRE-HEP` 순서로 조회
- 결과를 `Extra`에 `188` 같은 숫자만 저장
- 문제가 생기면 설정창에서 support log를 export 가능

설치:

1. add-on 빌드:

   ```sh
   ./scripts/build.sh
   ```

2. Zotero에서 [`dist/getcitation-0.1.0.xpi`](./dist/getcitation-0.1.0.xpi) 설치:
   `Tools` -> `Plugins` -> 톱니바퀴 -> `Install Add-on From File...`

3. Zotero 설정 열기:
   `Settings` -> `Get Citation`

4. 선택 사항:
   본인 `Semantic Scholar API key` 입력

5. 논문 하나 이상 선택 후:
   `Update Citation Counts` 실행

문제 해결:

- `Semantic Scholar`가 실패하면 `Crossref`, 그다음 `INSPIRE-HEP`로 자동 fallback
- 이상하면 `Settings -> Get Citation -> Export Log` 실행
- 저장된 `.txt` 파일을 같이 보내주면 원인 파악이 쉬움

API 출처:

- Semantic Scholar Academic Graph API: https://api.semanticscholar.org/api-docs/graphs
- Semantic Scholar product overview: https://www.semanticscholar.org/product/api
- Crossref REST API: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- 이 add-on이 현재 사용하는 INSPIRE-HEP API root: `https://inspirehep.net/api/`

메모:

- 제가 확인한 범위에서는 이 base URL들이 자주 바뀌었다는 강한 증거는 없었습니다
- 참고한 두 Zotero extension도 같은 계열 endpoint를 사용하고 있었습니다
- 혹시 공급자 쪽 주소가 바뀌더라도, 이 add-on은 base URL을 코드 한 곳에 모아둬서 수정은 비교적 간단합니다
