[설치 방법]
1) 이 폴더 전체를 HTTPS 웹 서버에 올립니다. (주소창 없는 앱 모드는 HTTPS 필요, 테스트는 localhost 가능)
2) 폰 브라우저로 접속 → 
   - 안드로이드(크롬): 메뉴 → '앱 설치' 또는 '홈 화면에 추가'
   - 아이폰(사파리): 공유 버튼 → '홈 화면에 추가'
3) 홈 화면의 '달소아과' 아이콘으로 실행하면 주소창 없이 전체 화면 앱으로 열립니다.

[파일]
index.html            UTF-8 본문 (권장)
index-euckr.html      EUC-KR 본문 (서버가 EUC-KR일 때. 이름을 index.html로 바꿔 사용)
three.min.js          3D 라이브러리 (외부 접속 없이 동작)
manifest.webmanifest  앱 이름/아이콘/전체화면 설정
sw.js                 오프라인 캐시
icon-*.png, apple-touch-icon.png  아이콘

※ manifest.webmanifest, sw.js는 UTF-8로 두세요. 서버가 .webmanifest를 application/manifest+json으로 보내면 가장 좋습니다.
