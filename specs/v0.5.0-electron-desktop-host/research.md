# Research: AI Mind Desktop Host

**Feature**: v0.5.0 Electron Desktop Host  
**Date**: 2026-08-03  
**Status**: Complete

## Decision 1: 鍋氣€滃畨鍏ㄥ湪绾挎闈㈠涓烩€濓紝涓嶆墦鍖呮湰鍦?AI 鏈嶅姟

**Decision**

Electron 鍙壙鎷?Windows/macOS 妗岄潰绐楀彛銆乸rofile銆佺綉缁滃畨鍏ㄨ竟鐣屻€佺敤鎴峰彲瑙佺殑鍥惧儚淇濆瓨鍜屾湰鍦版晠闅滄仮澶嶃€傜幇鏈夌嚎涓?`apps/webapp` 缁х画鎻愪緵鑱婂ぉ銆佸浘鍍忕敓鎴愩€丄gent銆佷細璇濄€丼treamRun銆佹暟鎹簱銆佹ā鍨嬩笌 MCP 鑳藉姏銆?
**Rationale**

- 褰撳墠浜у搧鐨?AI Runtime 宸插湪鏈嶅姟绔舰鎴愭槑纭殑鍒嗗眰鍜屾仮澶嶈涔夛紱鎶婂畠澶嶅埗鍒?Electron 浼氬悓鏃跺紩鍏ユ湰鍦版暟鎹簱銆佸嚟鎹€佹ā鍨嬨€丮CP銆佸崌绾у拰璺ㄧ幆澧冧竴鑷存€ч棶棰樸€?- 鍦ㄧ嚎瀹夸富鍙妗岄潰绔嚜鐒跺鐢ㄥ凡鏈夋櫘閫氳亰澶┿€佸浘鍍忋€丄gent銆佷細璇濅笌娴佸紡鎭㈠锛岃€屼笉鍙﹀缓涓€濂椾笟鍔¤鍒欍€?- 鏈増 Windows x64銆佹棤鑷姩鏇存柊鐨勮寖鍥村凡缁忚冻澶熷ぇ锛涘厛绋冲畾瀹夸富杈圭晫锛屽悗缁啀鍗曠嫭瑙勫垝绂荤嚎鑳藉姏銆?
  **Alternatives Rejected**

- 灏嗗畬鏁?Next.js/Prisma/妯″瀷/MCP 鎵撹繘瀹夎鍖咃細涓?v0.5.0 闈炵洰鏍囧啿绐侊紝缁存姢鍜屽畨鍏ㄩ潰鏄庢樉鎵╁ぇ銆?- 鐢ㄩ€氱敤娴忚鍣ㄧ獥鍙ｇ洿鎺ュ姞杞戒换鎰?URL锛氭棤娉曚繚璇佹寮忔湇鍔°€佷細璇濄€佸鑸笌鏈満鑳藉姏杈圭晫銆?- 涓烘闈㈤噸鍐欒亰澶?Agent UI锛氫細閫犳垚绾夸笂鍜屾闈袱濂椾骇鍝佽涔夈€?

## Decision 2: Electron Forge + Webpack + Squirrel.Windows/DMG

**Decision**

鏂板鐙珛鐨?`apps/desktop` pnpm workspace锛屼娇鐢?Electron Forge 鐨?Webpack plugin 鏋勫缓 main銆乸reload 鍜屾湰鍦?recovery renderer锛沇indows x64 浣跨敤 Squirrel.Windows maker锛宮acOS arm64 浣跨敤 DMG maker銆?
**Rationale**

- Forge 鎻愪緵琚淮鎶ょ殑寮€鍙戙€佹墦鍖呫€乵aker 涓庣鍚嶆帴鍏ラ潰锛沇ebpack plugin 瀵?main/preload/鏈湴 renderer 鐨勫鍏ュ彛鏀寔鏄庣‘銆?- Squirrel.Windows 鐢熸垚 Windows 瀹夎鍣ㄥ拰蹇呰鐨?release metadata锛汥MG 鎻愪緵 macOS 鐢ㄦ埛鐔熸倝鐨勬嫋鎷藉畨瑁呭叆鍙ｃ€備袱鑰呴兘淇濇寔绋冲畾浜у搧 metadata锛岄€傚悎鏈増鎵嬪姩瀹夎涓庤鐩栧崌绾с€?- 杩欏鏂瑰紡鎶?Electron 鐨勬闈㈡瀯寤烘敹鏉熷湪鍗曚竴 app锛屼笉骞叉壈鐜版湁 webapp 鐨?Next 鏋勫缓銆?
  **Alternatives Rejected**

- 鎵嬪啓 Electron 鎵撳寘鑴氭湰锛氶渶瑕佽嚜琛岀淮鎶?Electron ABI銆佸畨瑁呭櫒鍜岀鍚嶇幆鑺傘€?- 璇曢獙鎬?bundler/鍙戝竷閾撅細棣栫増浼樺厛閫夋嫨缁存姢鎴愮啛銆佸畼鏂规枃妗ｅ畬鏁寸殑 Forge Webpack 璺緞銆?- 鍚屾椂鍙戝竷 Intel macOS銆乽niversal binary 鎴?Linux锛氫細璁╂灦鏋勩€佺鍚嶃€佸畨瑁呬笌鏀寔鐭╅樀澶辩劍銆?
  **References**

- [Electron Forge Webpack Plugin](https://www.electronforge.io/config/plugins/webpack)
- [Electron Forge Squirrel.Windows](https://www.electronforge.io/config/makers/squirrel.windows)
- [Electron Forge DMG Maker](https://www.electronforge.io/config/makers/dmg)

## Decision 3: 鈥滆繙绋嬪伐浣滈〉闆舵ˉ鎺?+ 鏈湴鎭㈠椤电獎妗ユ帴鈥?

**Decision**

杩滅▼ AI Mind 宸ヤ綔绐楀彛娌℃湁 preload 鍜?IPC銆傜綉缁?鍏煎鎬уけ璐ユ椂鍒囨崲鍒板寘鍐?`ai-mind-desktop://local` recovery 椤碉紱璇ラ〉鎵嶅彲浠ラ€氳繃鏈€灏忋€佸叿鍚嶃€乻chema-validated 鐨?contextBridge 璇锋眰閲嶈瘯銆佸凡纭 profile 閲嶇疆鍜岃瘖鏂鍒?瀵煎嚭銆倂0.5.0 涓嶅湪 recovery 椤垫彁渚涘崌绾?URL 鎴?`shell.openExternal` bridge锛屽彧鏄剧ず鍙楁帶鍐呴儴娓犻亾鍗囩骇璇存槑銆?
**Rationale**

- 杩滅▼浠ｇ爜鍗充娇鏉ヨ嚜瀹樻柟绾夸笂鏈嶅姟锛屼篃蹇呴』鎸夊彲鍙楁敾鍑诲唴瀹瑰寰呫€傛病鏈?preload 鏄渶鐩存帴銆佹渶鍙璁＄殑鈥滀笉鍚戣繙绋嬪唴瀹圭粰 native API鈥濅繚璇併€?- 澶辫触椤佃嫢涔熶緷璧栬繙绋嬮〉闈紝灏辨棤娉曞湪缃戠粶/TLS/涓嶅吋瀹规椂宸ヤ綔銆?- 鑻ョ粰杩滅▼椤典竴涓€滈€氱敤 desktop bridge鈥濓紝鏃ュ悗姣忎釜鏈満鑳藉姏閮戒細鍙樻垚杩滅▼浠ｇ爜鍙皟鐢ㄩ潰锛涘眬閮?recovery bridge 閬垮厤杩欎竴鐐广€?
  **Alternatives Rejected**

- 鍦ㄥ悓涓€涓繙绋嬬獥鍙ｆ寜 URL 鍒ゆ柇骞舵敞鍏?bridge锛氬鏄撹瀵艰埅銆乺edirect 鎴?future page 婕忔礊缁曡繃锛屽璁¤竟鐣屼笉娓呮櫚銆?- recovery 椤典娇鐢?`file://`锛欵lectron 瀹夊叏鎸囧崡寤鸿閬垮厤 file protocol锛涘彈闄愮殑鍐呴儴 protocol 鏇磋兘琛ㄨ揪璧勬簮杈圭晫銆?- 璁╁け璐ラ〉璋冪敤浠绘剰 HTTP API锛氭仮澶嶉〉搴斿湪鏈嶅姟涓嶅彲杈炬椂涔熷彲鏄剧ず锛屼笉搴旀垚涓烘柊缃戠粶鏉冮檺鍏ュ彛銆?
  **References**

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox/)

## Decision 4: 鍏堝仛涓ユ牸 compatibility check锛屽啀鍔犺浇杩滅▼椤甸潰

**Decision**

涓昏繘绋嬩负姣忔鍚姩銆侀噸璇曟垨 reset 寤虹珛涓€涓€婚暱 5 绉掔殑 attempt銆俻rofile session 鐨?Chromium `ses.fetch()` 璇锋眰鍥哄畾 Origin 涓嬬殑 `GET /api/desktop/compatibility`锛宻trict v1 JSON 瑙ｆ瀽鍜?workspace 棣栧睆 `loadURL` 鍏卞悓娑堣€楀悓涓€涓墿浣欐椂闂撮绠椼€備粎 `compatible` 鍙姞杞藉伐浣滈〉锛沗manual_upgrade_required`銆佽秴鏃躲€乀LS/缃戠粶澶辫触銆侀潪 2xx 鎴?schema 涓嶅尮閰嶉兘杩涘叆鏈湴鎭㈠椤点€傛棫 attempt 鐨勫紓姝ュ洖璋冧笉鍙鐩栨柊 attempt 鎴栨仮澶嶉〉銆?
**Rationale**

- 鏈嶅姟绔紨杩涘彲浠ュ湪涓嶅吋瀹规椂闃绘鏃ф闈㈢璇姞杞介〉闈紝鐢ㄦ埛寰楀埌鏄庣‘鐨勫彈鎺у唴閮ㄦ笭閬撴墜鍔ㄥ崌绾ц鏄庛€?- `ses.fetch()` 浣跨敤 Chromium 缃戠粶鏍堬紝鑳戒笌宸ヤ綔椤靛悓鏍烽伒寰?Windows 绯荤粺浠ｇ悊涓?TLS 淇′换閾撅紱涓嶈兘鏀圭敤 Node HTTP/fetch 缁曡繃杩欎簺璇箟銆?- endpoint 鏃犺韩浠戒笖 `credentials: 'omit'`锛屼笉浼氭妸 Desktop 鐗堟湰妫€鏌ュ彉鎴愪細璇濄€佽处鍙锋垨瀵嗛挜鎺ュ彛銆?
  **Alternatives Rejected**

- 鍏?load UI锛屾敹鍒版煇涓〉闈㈤敊璇啀鍒ゆ柇锛氭棤娉曟弧瓒斥€滀笉鍏煎涓嶅姞杞藉伐浣滅晫闈⑩€濄€?- 鍦ㄥ鎴风缁存姢鍙紪杈戞湇鍔″湴鍧€鎴栨渶浣庣増鏈細浼氳姝ｅ紡 Origin 鍜屽吋瀹硅鍒欏彲琚鏀广€?- 璁╂湇鍔＄杩斿洖浠绘剰鍗囩骇 URL锛氫細鎶婂閾惧畨鍏ㄥ垽鏂氦缁欒繙绋?payload銆?
  **References**

- [Electron `session.fetch`](https://www.electronjs.org/docs/latest/api/session)
- [Electron `net`](https://www.electronjs.org/docs/latest/api/net/)

## Decision 5: 榛樿鎷掔粷鏉冮檺銆佸鑸€佸脊绐椾笌涓嬭浇

**Decision**

鏄惧紡寮€鍚?sandbox銆乧ontext isolation銆亀eb security锛屽叧闂?Node integration銆亀ebview銆乮nsecure content 涓庡疄楠岀壒鎬с€傚伐浣滅獥鍙ｅ彧鍏佽 exact trusted Origin 瀵艰埅锛涙柊绐楀彛鍏ㄩ儴鎷掔粷銆?026-08-04 鐨?Windows behavior gate 璇佹槑 `target=_blank`銆乣window.open` 涓庡悎鎴愮偣鍑荤殑 Electron fields 鏃犳硶绋冲畾鍖哄垎鐪熷疄鐢ㄦ埛涓庤剼鏈墽琛岋紝鍥犳 v0.5.0 鐨?external-opening allowlist 涓虹┖锛宍setWindowOpenHandler` 濮嬬粓鎷掔粷涓斾笉璋冪敤 `shell.openExternal`銆傛潈闄愭鏌?璇锋眰涓€寰嬫嫆缁濓紝鍞竴绐勪緥澶栨槸 trusted main frame 鐨?`clipboard-sanitized-write`锛屼粛渚濊禆 Chromium 鐨勭敤鎴锋縺娲昏姹傘€?
涓嬭浇鍦?session `will-download` 澶勯粯璁ゅ彇娑堬紱浠呭綋鍓嶅彈淇″伐浣滅獥鍙?main frame銆乣DownloadItem.hasUserGesture()` 涓虹湡銆佹棤 redirect 鐨勫彈淇″浘鍍?Blob/鍚屾簮鍥剧墖缁撴灉銆佸彈鎺у浘鐗?MIME/鏂囦欢鍚嶆椂鍏佽锛屽苟璁?Electron 鐨勯粯璁?save dialog 鍛堢幇缁欑敤鎴枫€?
**Rationale**

- Electron 瀹樻柟瀹夊叏娓呭崟鏄庣‘瑕佹眰锛氳繙绋?content 涓嶅惎 Node锛屽惎闅旂/sandbox锛屽鐞?permission锛岄檺鍒?navigation/window creation锛屽苟涓ユ牸楠岃瘉 `shell.openExternal`銆?- `setPermissionCheckHandler` 涓?`setPermissionRequestHandler` 蹇呴』鍚屾椂瀹夎鎵嶅畬鏁达紱浠呭畨瑁呭叾涓€浼氱暀涓嬮粯璁ゆ垨鍚庣画璇锋眰璺緞銆?- `will-download` 鍙互鍙栨秷涓嬭浇锛宍DownloadItem.hasUserGesture()` 鍙鍙?Electron 宸插垽瀹氱殑鐢ㄦ埛鎵嬪娍锛宍getURLChain()` 鍙彂鐜?redirect锛涢€氳繃 `DownloadItem.setSaveDialogOptions` 淇濈暀 Electron 鐨勭敤鎴峰彲瑙佷繚瀛樻祦绋嬶紝鏃犻渶鎶婃枃浠剁郴缁熻兘鍔涙毚闇茬粰椤甸潰銆?
  **Alternatives Rejected**

- 渚濊禆 Electron 榛樿 permission锛氬畼鏂硅鏄庨粯璁ょ瓥鐣ュ彲鑳借嚜鍔ㄦ壒鍑嗭紝涓嶈兘浣滀负瀹夊叏杈圭晫銆?- 璁╃綉椤佃皟鐢ㄤ换鎰?`shell.openExternal` 鎴栭€氱敤 IPC锛氫細鎶?URL 鏍￠獙鍜岀郴缁熷崗璁敾鍑婚潰浜ょ粰杩滅▼浠ｇ爜銆?- 鐩存帴涓虹綉椤垫彁渚?Node clipboard/filesystem API锛氱牬鍧忚繙绋嬮〉闈㈤浂鏈満鑳藉姏鍘熷垯銆?- 闈欓粯璁剧疆 download path锛氫笉婊¤冻鐢ㄦ埛鍙淇濆瓨鍜屾渶灏忔枃浠跺啓鍏ヨ竟鐣屻€?
  **References**

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Session Permissions and Downloads](https://www.electronjs.org/docs/latest/api/session)
- [Electron DownloadItem](https://www.electronjs.org/docs/latest/api/download-item/)

## Decision 6: stable persistent profile + fuse-protected cookies

**Decision**

绋冲畾 product identity銆丄ppUserModelId銆乸ersistent partition 鍜?userData 璺緞鍏卞悓瀹氫箟 workspace `Desktop Session Profile`銆傚畠灞炰簬褰撳墠 Windows 鐢ㄦ埛锛況ecovery 浣跨敤鐙珛鐨勯潪鎸佷箙 memory session銆傛墦鍖呭墠鍚敤 `EnableCookieEncryption` fuse锛屽苟鍦?profile reset 鏃跺彧閫氳繃 session 鐨勫畾鍚?`clearData` 娓呴櫎 trusted Origin 鐨?browser data銆?
**Rationale**

- persistent session 璁╂甯稿叧闂?閲嶆柊鍚姩鍚庣户缁惡甯︽湇鍔＄璁ゅ彲鐨?session cookie 鍜岀幇鏈?browser-local conversation snapshot銆?- Electron 鐨?cookie encryption fuse 浣跨敤 OS-level cryptography锛涜繖鏄 cookie at-rest 鐨勫繀瑕佸熀绾裤€傝 fuse 鏄崟鍚戣縼绉伙紝鎵€浠ヤ粠 v0.5.0 棣栦釜鍐呴儴棰勮璧蜂竴鐩翠繚鎸佸惎鐢ㄣ€?- `clearData` 鍙垪鍑鸿鍒犻櫎鐨勬暟鎹被鍨嬩笌 Origin锛屼笉闇€瑕佹壂鎻忋€佸鍑烘垨鎵嬪伐鍒犻櫎 profile 鏂囦欢銆?
  **Alternatives Rejected**

- 閫€鍑烘椂娓呯┖ profile锛氫笌浼氳瘽杩炵画鎬ц姹傚啿绐併€?- 鑷缓璐﹀彿/PIN 鏈湴鍔犲瘑灞傦細鏈増鏄庣‘浠?Windows 鐢ㄦ埛璐︽埛涓洪殧绂昏竟鐣屻€?- 鍒犻櫎鏁翠釜 AppData 鐩綍锛氳寖鍥磋繃澶э紝鍙兘璇垹鏃ュ織鎴栧彂甯冭瘖鏂紝骞朵笖闅句互瀹¤銆?
  **References**

- [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Electron Session Data Clearing](https://www.electronjs.org/docs/latest/api/session)

## Decision 7: 鏈嶅姟绔互 nonce CSP 鍜?Permissions-Policy 閰嶅悎瀹夸富

**Decision**

鍦?`apps/webapp/proxy.ts` 鍙负 HTML document 璇锋眰鐢熸垚 nonce CSP銆俙/api/**`銆丯ext static/image銆乫avicon 鍜?prefetch 鏄庣‘缁曞紑 nonce proxy锛沝ocument CSP 浣跨敤 `script-src 'nonce-鈥? 'strict-dynamic'`銆乣style-src 'self' 'unsafe-inline'`銆乣object-src 'none'`銆乣base-uri 'self'`銆乣frame-ancestors 'none'` 绛夐檺鍒躲€俿tyle nonce/hash 鍜?`style-src-attr` 鍧囦笉寰楀嚭鐜帮紝鍚﹀垯 Chromium 浼氬拷鐣?`unsafe-inline`銆傝 Web document CSS 鍏煎渚嬪鐢ㄤ簬鍙楁帶 UI 缁勪欢鐨勮繍琛屾椂鏍峰紡锛涜剼鏈€佽繙绋嬫牱寮忔潵婧愩€丄PI/static 鍝嶅簲鍜?Electron local CSP 涓嶇户鎵胯渚嬪銆傚彟璁剧疆 Permissions-Policy 绂佺敤鏈増鏈娇鐢ㄧ殑璁惧鑳藉姏銆乣nosniff`銆丷eferrer-Policy 涓?frame 闃叉姢銆?
**Rationale\*\*

- Electron 瀹樻柟鏄庣‘瑕佹眰缃戦〉鏈韩涔熸湁闄愬埗鎬?CSP锛涘涓讳晶寮€鍏充笉鑳芥浛浠?web response 瀹夊叏绛栫暐銆?- Next.js 16 瀹樻柟鎺ㄨ崘鍦?`proxy.ts` 鐢熸垚 CSP nonce锛汵ext 鍙粠 request CSP 鑷姩鎶?nonce 搴旂敤浜?framework/page scripts锛屼絾椤甸潰闇€瑕佸姩鎬佹覆鏌撱€傚畼鏂?matcher 寤鸿鍚屾椂鎺掗櫎 API銆侀潤鎬佽祫婧愬拰 prefetch锛涘皢 nonce scope 闄愪簬 document 鏄槑纭殑瀹夊叏/鎬ц兘鍙栬垗銆侰SP 瀵?`style-src` 涓殑 nonce/hash 浼樺厛浜?`unsafe-inline`锛屽洜姝?CSS 鍏煎绛栫暐涓嶈兘娣风敤杩欎袱绫?source銆?- 鐢ㄤ弗鏍?CSP 鎶?XSS 鐨勫彲鍒╃敤闈㈠帇浣庯紝閰嶅悎杩滅▼闆?bridge 褰㈡垚涓ら亾涓嶅悓灞傛鐨勯槻绾裤€?
  **References**

- [Next.js Content Security Policy Guide](https://nextjs.org/docs/app/guides/content-security-policy)
- [Next.js Response Headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)

## Decision 8: 鍐呴儴棰勮鍒跺搧銆乭ash 鏍￠獙鍜屾墜鍔ㄥ崌绾э紝涓嶅仛浠ｇ爜绛惧悕鎴?auto-update

**Decision**

v0.5.0 鐢熸垚 Windows x64 涓?macOS arm64 鍐呴儴棰勮鍒跺搧锛氫笉閲囪喘璇佷功銆佷笉鎺ュ叆 Developer ID銆乶otarization 鎴栧叕寮€浠ｇ爜绛惧悕鏈嶅姟锛屾墍鏈夊畨瑁呭寘鍜岃鏄庡繀椤绘槑纭爣涓衡€滃唴閮ㄩ瑙堛€佹湭绛惧悕銆佷笉寰楀叕寮€鍒嗗彂鈥濄€傛瘡涓埗鍝佺敓鎴愬苟楠岃瘉骞冲彴鍖?hash manifest锛屽畨瑁呭櫒鍗囩骇浣跨敤鍚屼竴浜у搧韬唤淇濈暀 profile锛涗笉寮曞叆 `autoUpdater` 鎴栦换浣曞悗鍙版洿鏂版鏌ャ€俶acOS 鍦?flip fuses 鍚庡彧鎵ц `codesign --force --deep --sign -` 鐨?ad-hoc 閲嶇鍚嶏紝浠ユ仮澶嶆湰鍦板彲鎵ц瀹屾暣鎬э紱瀹冧笉鎼哄甫鍙戝竷鑰呰韩浠斤紝鍒跺搧浠嶆槸 unsigned internal preview锛屽苟蹇呴』缁欏嚭 Gatekeeper 浜哄伐鎵撳紑璇存槑銆?
**Rationale**

- 鏈鍚嶅埗鍝佷笉鑳戒綔涓哄叕寮€鍙戝竷鐗╋紱灏嗘寮忓叕寮€绛惧悕宸ヤ綔鎺ㄨ繜鍒版嫢鏈夊悎鏍间富浣撱€侀绠椾笌绛惧悕鏈嶅姟閫夋嫨鐨勫悗缁増鏈紝閬垮厤涓哄唴閮ㄩ獙璇佸紩鍏ラ敊璇垨涓嶅彲鐢ㄧ殑绛惧悕鍩虹璁炬柦銆?- manifest 涓哄唴閮ㄦ祴璇曚汉鍛樺畾浣嶅拰鎵嬪姩鏍￠獙淇濈暀鏈€灏忓彲璇昏瘉鎹紝浣嗕笉鏇夸唬鍏紑鍙戣鎵€闇€鐨勪唬鐮佺鍚嶃€?- 鑷姩鏇存柊杩橀渶瑕佹洿鏂版簮銆佺鍚嶃€佸垎闃舵绛栫暐銆佸洖婊氫笌浜嬫晠鍝嶅簲锛涙湰鐗堝簲鍏堟妸鈥滄墜鍔ㄥ崌绾т粛涓嶄涪 profile鈥濆仛绋炽€?
  **Alternatives Rejected**

- 鏃犵鍚嶇洿鎺ュ叕寮€锛氫笉婊¤冻鏈増鍐呴儴棰勮杈圭晫銆?- 鍦?v0.5.0 閲囪喘璇佷功鎴栨帴鍏ユ墭绠＄鍚嶏細瓒呭嚭鍐呴儴棰勮鐩爣锛屽欢鍚庡埌姝ｅ紡鍏紑鍙戝竷鐗堟湰銆?- 鍏堝疄鐜拌嚜鍔ㄦ洿鏂帮細鏄庢樉瓒呭嚭 scope锛屼笖浼氬湪瀹夊叏鍏抽敭璺緞寮曞叆棰濆鏈嶅姟鍜岄殣寮忎笅杞姐€?- 浣跨敤鍙彁浜ゅ埌浠撳簱鐨?PFX/password锛氫笉鍙帴鍙楋紝鎵€鏈夌鍚?secret 蹇呴』鐣欏湪鍙椾繚鎶ょ幆澧冦€?
  **References**

- [Electron Forge Windows Code Signing](https://www.electronforge.io/guides/code-signing/code-signing-windows)
- [Electron Forge Squirrel.Windows](https://www.electronforge.io/config/makers/squirrel.windows)

## Decision 9: 鍏抽棴/宕╂簝涓嶇瓑浜庣敤鎴峰彇娑?

**Decision**

妗岄潰瀹夸富涓嶅湪 `window-all-closed`銆乣render-process-gone`銆佺潯鐪?鎭㈠鎴栫浜屽疄渚嬩簨浠朵腑璋冪敤 `/cancel`銆傜獥鍙ｉ噸鏂版墦寮€鍚庡彧閲嶆柊杩涘叆 compatibility check 鍜屾甯搁〉闈㈠姞杞斤紱娴佷换鍔℃槸鍚﹀彲鎭㈠銆佹槸鍚﹀凡缁堟€佷互鍙婂箓绛夋彁浜ょ敱鐜版湁 server StreamRun 瑙勫垯鍐冲畾銆?
**Rationale**

- v0.4.10 宸叉槑纭尯鍒?request disconnect 涓?durable cancel intent銆傚鎴风鍏抽棴涓嶅簲浼€犫€滅敤鎴蜂富鍔ㄥ仠姝⑩€濄€?- 杩欓伩鍏嶆闈㈢獥鍙ｇ敓鍛藉懆鏈熸剰澶栦腑姝?server 姝ｅ湪杩愯鐨?Agent 鎴栧浘鍍忎换鍔°€?
  **Alternatives Rejected**

- close 鏃舵€绘槸 cancel锛氫細鎶婄綉缁?宕╂簝/浼戠湢璇垽涓虹敤鎴峰喅瀹氥€?- desktop 鑷繁淇濆瓨鍜岄噸鏀?StreamRun锛氫細澶嶅埗 server ownership銆乧ursor 鍜?terminal 浜嬪疄婧愩€?
  **Reference**

- [鐜版湁 Stream Recovery Architecture](../../docs/architecture/stream-recovery.md)

## Decision 10: Windows/macOS CI 鍒嗗眰楠岃瘉锛岀敓浜?fuse 鍖呬笉鍋?Playwright attach

**Decision**

淇濈暀鐜版湁 Ubuntu web CI锛屽苟鏂板 Windows x64 涓?macOS arm64 desktop 杞﹂亾銆俤esktop pure-policy/unit 鍦ㄥ父瑙?test runner 鎵ц锛涗富杩涚▼浜や簰浣跨敤鏈墦鍖?development Electron 鐨?Playwright Electron 瀹為獙鎬ф敮鎸侊紱鐪熷疄 preview 鎵撳寘鐗╁彧鍋氬搴斿钩鍙?launch/smoke銆乫use 涓?manifest/hash 楠岃瘉锛屼笉瑕佹眰 Playwright attach銆俶acOS job 鍦?arm64 runner 涓婃瀯寤猴紝鍏堟柇瑷€ `uname -m`锛岀‘淇濅笉浼氫骇鐢?Intel 鎴?universal 鍒跺搧銆?
**Rationale**

- Electron production fuse 浼氱鐢?Node inspect arguments锛汸laywright 瀹樻柟鏄庣‘璇存槑杩欎細濡ㄧ Electron launcher 杩炴帴銆傛妸 integration 鍥哄畾鍦ㄥ紑鍙戞€併€佹妸 production artifact 鏀惧湪鐙珛 smoke 杞﹂亾锛屾棦鑳芥祴璇曡涓猴紝涔熶笉涓烘祴璇曟斁鏉惧彂琛屽畨鍏ㄨ缃€?- native save dialog 涓嶈兘鐢?renderer 鑷姩鍖栫洿鎺ユ帴绠★紱涓昏繘绋?integration 鍙湪娴嬭瘯瑁呴厤涓瀵?鏇夸唬绯荤粺瀵硅瘽妗嗭紝鑰屾寮?preview 浠嶉獙璇佺湡瀹炵敤鎴峰彲瑙佹祦绋嬨€?- 鐩墠 CI 鍙湁 Ubuntu web 杞﹂亾锛學indows/macOS packaging銆丒lectron binary 涓嬭浇鍜屽畨瑁呭櫒浜х墿娌℃湁鍙噸澶嶇殑闂ㄧ銆傜嫭绔嬪钩鍙拌溅閬撹兘闃绘鈥滅綉椤垫祴璇曞叏缁裤€佺洰鏍囧钩鍙板寘涓嶅彲鐢ㄢ€濊繘鍏ュ唴閮ㄦ笭閬撱€?
  **Alternatives Rejected**

- 鍙仛浜哄伐 Windows 娴嬭瘯锛氱粨鏋滀笉鍙噸澶嶏紝涓斾笉鑳芥垚涓哄唴閮ㄩ瑙堝€欓€夌殑绋冲畾闂ㄦ銆?- 涓鸿 Playwright 杩炴帴鑰屽湪 preview 鍖呬腑閲嶆柊寮€鍚?inspect fuse锛氭墿澶у彲鏀诲嚮闈紝涓庢闈㈠畨鍏ㄥ熀绾垮啿绐併€?- 鐢ㄧ敓浜т唬鐮佷腑鐨?test-only IPC/寮€鍏虫嫤鎴?native dialog锛氫細姹℃煋杩滅▼闆舵ˉ鎺ヨ竟鐣岋紱娴嬭瘯鏇胯韩蹇呴』鐣欏湪寮€鍙戞祴璇曡閰嶃€?
  **References**

- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
- [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)

## Decision 11: 鏈嶅姟绔吋瀹瑰绾﹀厛浜庡唴閮ㄩ瑙堝寘鍙戝竷

**Decision**

鍏煎鎬?API 鍜?document security headers 蹇呴』鍏堢粡鏃㈡湁 server deployment route 鍙戝竷骞跺湪鍥哄畾 production Origin 楠岃瘉锛學indows preview artifact 鎵嶅彲鐢熸垚骞惰繘鍏ュ彈鎺у唴閮ㄦ笭閬撱€傝嫢 server 蹇呴』鍥為€€鍒扮己灏戣繖浜涜兘鍔涚殑鐗堟湰锛屽厛鏆傚仠瀵瑰簲 preview 鍒嗗彂锛涘鎴风淇濇寔 fail closed 鍒?recovery銆?
**Rationale**

- 妗岄潰瀹夸富灏?compatibility API 浣滀负鍚姩瀹夊叏闂ㄣ€傚厛鍙戝寘銆佸悗涓婄嚎 endpoint 浼氳棣栨壒鍐呴儴娴嬭瘯鑰呭緱鍒版棤娉曞垽鏂殑澶辫触鐘舵€侊紝鎺掗殰鎴愭湰楂樹笖鏄撹鍙戜复鏃?fallback銆?- 鎶?server compatibility 涓?headers 鐨勭嚎涓婇獙璇佷綔涓?desktop release 鐨勫墠缃瘉鎹紝鑳戒繚璇佸悓涓€鍊欓€夌増鏈殑瀹㈡埛绔拰鏈嶅姟绔绾﹀凡缁忎氦姹囥€?- 鍥為€€鏃跺仠姝㈠垎鍙戞瘮璁╁鎴风鎺ュ彈鏃у崗璁€丠TTP 鎴栧鐢?Origin 鏇村畨鍏紝涔熶繚鎸佲€滃浐瀹氬敮涓€ Origin銆佷弗鏍?DTO鈥濈殑闀挎湡杈圭晫銆?
  **Alternatives Rejected**

- 鍏堝彂甯?preview銆侀殢鍚庤ˉ API/header锛氫細鍒堕€犱笉鍙噸澶嶇殑璺ㄧ増鏈獥鍙ｃ€?- 鍏佽瀹㈡埛绔吋瀹规棫 response 鎴栧鐢ㄦ湇鍔″湴鍧€锛氬墛寮?fail-closed 涓庡浐瀹?Origin 绾︽潫銆?- 涓?desktop 寮€杈熸梺璺?server deploy锛氫細缁曞紑椤圭洰鏃㈡湁鐢熶骇鍙戝竷娌荤悊銆?
  **References**

- [鐢熶骇閮ㄧ讲浜嬪疄婧怾(../../docs/architecture/production-deployment.md)
- [Desktop Preview Release Contract](./contracts/desktop-preview-release.md)

## Resolved Unknowns

| 涓婚              | 宸茬‘瀹氱粨璁?                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------ |
| 妗岄潰鑼冨洿       | 鍦ㄧ嚎瀹夸富锛學indows x64 + macOS arm64锛涙病鏈夋湰鍦?Runtime銆佺绾挎垨鑷姩鏇存柊       |
| 鏋勫缓/瀹夎       | Electron Forge Webpack + Squirrel.Windows + macOS DMG                                      |
| 姝ｅ紡鏈嶅姟鍦板潃 | 鏋勫缓鏃跺浐瀹氬敮涓€鐢熶骇 HTTPS Origin锛岀敤鎴蜂笉鍙厤缃?                               |
| 寮€鍙戞湇鍔″湴鍧€  | 浠呮湭鎵撳寘寮€鍙戞ā寮忋€佹樉寮?localhost/127.0.0.1                                        |
| 鍏煎鎬?           | 鍚姩鍓?strict v1 HTTP check + 5 绉掓€?deadline锛涗笉鍏煎浠呮湰鍦板唴閮ㄦ笭閬撳崌绾ц鏄?  |
| 杩滅▼鏉冮檺        | remote work window 鏃?preload/IPC/Node锛宒eny-by-default                                   |
| 鏈湴璧勬枡        | stable persistent profile銆丱S 鍔犲瘑 cookie銆佺粡纭鐨勫畾鍚?reset                       |
| 鏂囦欢鑳藉姏       | 浠呯敤鎴蜂富鍔ㄥ彈淇″浘鐗囩殑 save dialog锛涙棤閫氱敤鏂囦欢 API                            |
| 璇婃柇             | 鏈満 allowlist 鐢熸垚锛岀敱鐢ㄦ埛澶嶅埗/瀵煎嚭锛涙棤 telemetry/upload                     |
| 鍙戝竷             | 鍙楁帶鍐呴儴娓犻亾鐨勬湭绛惧悕棰勮鍒跺搧 + hash manifest锛涙墜鍔ㄨ鐩栧畨瑁呬繚鐣?profile |

## Decision 12: macOS arm64-only DMG 涓庤韩浠芥棤鍏崇殑 ad-hoc 瀹屾暣鎬х鍚?

**Decision**

鏈増鍙湪鍘熺敓 Apple Silicon runner 鏋勫缓 `darwin-arm64` DMG锛屼笉鐢熸垚 `darwin-x64`銆乽niversal 鎴?ZIP 浣滀负瀹夎鍏ュ彛銆俉indows 鐨?Squirrel 鐢熷懡鍛ㄦ湡淇濇寔 Windows-only锛沵acOS 涓嶆墽琛?Squirrel startup 鍒嗘敮銆傛瘡涓钩鍙扮敓鎴愮嫭绔?manifest 鍜?SHA-256銆侲lectron executable 鍦?macOS 鐨?fuse 淇敼鍚庝娇鐢?ad-hoc `codesign --sign -`锛屼絾 `desktop-release.json.signing` 浠嶅浐瀹氫负 `unsigned`銆?
**Rationale**

- Apple Silicon 瑕嗙洊褰撳墠涓昏 Mac 浣跨敤缇や綋锛屽悓鏃堕伩鍏?Intel 涓?universal binary 鐨勬瀯寤恒€佸寘浣撳拰楠屾敹鐭╅樀銆?- DMG 鏄?macOS 鍐呴儴娴嬭瘯鐨勭洿鎺ュ畨瑁呮牸寮忥紱涓嶉澶栫淮鎶?ZIP 鍒嗗彂璇存槑銆?- 淇敼甯︽湁鏃㈡湁绛惧悕鐨?macOS Electron executable 浼氱牬鍧忓叾绛惧悕鐘舵€侊紱ad-hoc 閲嶇鍚嶅彧鎭㈠鏈満鍙墽琛屽畬鏁存€э紝涓嶆彁渚?Apple Developer 鍙戝竷鑰呮媴淇濓紝涔熶笉浼氱粫寮€ Gatekeeper銆?- 骞冲彴鍊煎繀椤昏繘鍏?manifest銆佽瘖鏂拰璇佹嵁璁板綍锛岄槻姝㈡妸閿欒鏋舵瀯鐨勫埗鍝佷氦缁欏唴閮ㄦ祴璇曚汉鍛樸€?
  **Alternatives Rejected**

- Intel x64 鎴?universal binary锛氳秴鍑烘湰鐗堝凡纭鐨勭洰鏍囨灦鏋勮寖鍥淬€?- 涓嶉噸绛惧悕灏变慨鏀?fuses锛氬彲鑳藉鑷?macOS 鏃犳硶瀹夊叏鍚姩琚慨鏀圭殑搴旂敤 bundle銆?- Developer ID signing/notarization锛氶渶瑕?Apple 璐﹀彿銆佽瘉涔︺€乻ecret 绠＄悊鍜屽彂甯冩祦绋嬶紝灞炰簬鍚庣画姝ｅ紡鍙戣鐗堟湰銆?
  **Verification**

- `pnpm view @electron-forge/maker-dmg@7.11.2` 纭璇?maker 涓庡綋鍓?Forge 7.11.2 鐗堟湰鍖归厤锛屼緷璧栦粎涓?Forge maker base/shared types 涓?`fs-extra`锛屼笉寮曞叆绛惧悕鏈嶅姟銆?- macOS CI 蹇呴』鏂█ runner 鍜?artifact 涓?`darwin-arm64`锛屽苟楠岃瘉 `codesign -dv` 浠呮樉绀?ad-hoc identity銆乫use wire銆丄SAR 鍐呭鍜?manifest/hash 涓€鑷淬€?

## Implementation Verification Findings

## Decision 15: Web document CSS compatibility exception

**Decision**

Web document responses and packaged `ai-mind-desktop://local` documents use exactly
`style-src 'self' 'unsafe-inline'` to support the installed Radix ScrollArea, Next development
overlay, local renderer, and other controlled UI runtime styles. `style-src` does not contain a
nonce/hash and has no `style-src-attr` directive, because Chromium otherwise ignores
`unsafe-inline`. Web `script-src` remains nonce-based with `strict-dynamic`; local
`script-src` remains `'self'`; neither allows `unsafe-eval`, remote style sources, or paths
outside the local asset allowlist.

**Rationale**

Radix ScrollArea creates a runtime `<style>` for native-scrollbar behavior, the Next development
overlay does the same, and local renderers may need runtime CSS. The user accepted the CSS-only
compatibility trade-off; the style nonce approach is incompatible with that decision in Chromium.

**Verification**

The focused header suite must assert the exact Web CSS directive and reject a style nonce/hash or
`style-src-attr`. A local browser-form request to `/instant-mind` must return
`style-src 'self' 'unsafe-inline'`, while `script-src` remains nonce-based with
`strict-dynamic` and no `unsafe-inline`.

- 2026-08-06 local verification: Forge development compilation emitted exactly
  `chrome/{index.html,index.js,preload.js,styles.css}` and
  `recovery/{index.html,index.js,preload.js,styles.css}`. The local protocol allowlist now
  serves only the required HTML/JS/CSS paths, rejects the previous renderer names and every
  query/hash variant, and uses `style-src 'self' 'unsafe-inline'` while keeping
  `script-src 'self'` without `unsafe-eval`.
- The Windows development lane passed `pnpm --filter @ai-mind/desktop typecheck`, `lint`,
  `test:stable` (98 tests), and `test:integration` (18 tests). Forge development startup
  compiled and launched the local Chrome plus workspace. Native macOS arm64 smoke remains a
  required physical macOS/Apple Silicon verification and is not claimed by this Windows run.

## Decision 14: VS Code-style cross-platform title bar with native controls and strict local assets

**Decision**

Keep the BrowserWindow local Chrome plus isolated workspace/recovery `WebContentsView` topology. Windows uses `titleBarStyle: 'hidden'` with a light `titleBarOverlay`; macOS uses `hiddenInset` and native traffic lights. The local Chrome follows the VS Code pattern of an absolute drag layer beneath `no-drag` brand and menu controls, and reserves platform control space without exposing a remote bridge. It loads only actual Forge-emitted static JS/CSS through the existing strict local protocol and opens the build-owned `/instant-mind` workspace path after compatibility.

**Rationale**

- Electron's official custom-title-bar guidance supports native controls with a hidden title bar, while VS Code demonstrates separate drag and interaction layers, platform control placement and narrow-width behavior.
- The current initial Chrome attempt has a concrete mismatch between Forge `index.js` output and local-protocol entries, plus a CSP-blocked runtime `<style>` injection. Correcting the local asset contract fixes the missing styles, menus and drag behavior without weakening CSP.
- `WebContentsView` continues to isolate the remote workspace from the local Chrome menu bridge and recovery privileges.

**Alternatives Rejected**

- `frame: false` with hand-built minimize/maximize/close controls: needlessly replaces native Windows/macOS behavior and broadens the local privileged surface.
- A renderer-owned VS Code-scale menu system: unnecessary for the two existing menus and would not improve the remote workspace security boundary.
- Allowing `unsafe-eval` or broad local/remote resource sources to compensate for renderer build defects: expands executable code or asset scope and remains forbidden. The user-approved local `unsafe-inline` exception is CSS-only and does not change those boundaries.

## Decision 13: `titleBarOverlay` 涓庡寘鍐?Desktop Chrome 淇濇寔鍗曡澹冲眰鍜岃繙绋嬮浂妗ユ帴

**Decision**

Desktop 浣跨敤 Electron `titleBarOverlay` 淇濈暀绯荤粺绐楀彛鎺у埗锛屽苟鐢卞寘鍐?`ai-mind-desktop://local/chrome/index.html` 娓叉煋 AI Mind 鏍囪瘑銆佹棦鏈夆€滄煡鐪嬧€濆拰鈥滃府鍔┾€濊Е鍙戝櫒銆備紶缁?application menu 琛屼繚鎸侀殣钘忥紱workspace 鍜?recovery 浣滀负涓嬫柟鐙珛 `WebContentsView`銆侰hrome 浠呭彲閫氳繃涓ユ牸 sender/URL/鏋氫妇/鍧愭爣楠岃瘉璇锋眰 main-owned native submenu锛宺emote workspace 淇濇寔鏃?preload銆佹棤 IPC銆佹棤鏈満鑳藉姏銆?
**Rationale**

- 浜у搧鏍囪瘑銆佽彍鍗曚笌绯荤粺鎺у埗鍙湪鍚屼竴琛屽憟鐜帮紝涓嶅啀褰㈡垚涓よ妗岄潰椤舵爮銆?- 涓嶅皢 header 娉ㄥ叆杩滅▼ `/instant-mind`锛屽洜姝や笉鎵╁ぇ绾夸笂椤甸潰鐨?Electron 鏉冮檺杈圭晫銆?- 缁х画澶嶇敤宸插瓨鍦ㄧ殑鈥滄煡鐪?-> 鎶€鏈灦鏋勨€濆拰鈥滃府鍔?-> 鍏充簬鈥濆師鐢熻彍鍗曞強鍏惰涓恒€?
- Windows external-opening behavior gate on 2026-08-04: Electron 43 reported `foreground-tab` with zero `postBody.data` items for pointer activation, keyboard activation, `window.open`, and synthetic click. A POST form target reported one body item with `application/x-www-form-urlencoded`. The first four vectors are indistinguishable in `setWindowOpenHandler`, so v0.5.0 has an empty external-opening allowlist: every popup is denied and the host does not call `shell.openExternal`.
- Electron Forge packaging requires the repository to use pnpm's `node-linker=hoisted`; this is recorded in the root `.npmrc` and must remain part of the clean Windows x64 install procedure.
- The Forge Webpack plugin must retain ownership of `packagerConfig.ignore`. Its default bundle-only filter keeps `.webpack` and excludes the source tree and `node_modules`; a custom array bypasses that policy and makes Electron Packager walk Forge development dependencies.
- Electron fuses must be flipped from Forge's `postPackage` hook, using each finalized output path. `packageAfterCopy` receives only the temporary app source directory and has no final executable to modify.
- Local Windows x64 package evidence on 2026-08-03: `pnpm --dir apps/desktop package` completed successfully. `electron-fuses read --app "out/@ai-mind-desktop-win32-x64/AI Mind Desktop.exe"` confirmed `EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation`, and `OnlyLoadAppFromAsar` are enabled; `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments` are disabled. This is local package evidence only: no installer, manifest, server-first verification, or preview distribution was created.

## Decision 16: Unified CSS compatibility policy for local documents

**Decision**

The Web-document-only scope in Decision 15 is superseded. Web documents and packaged
`ai-mind-desktop://local` Chrome/recovery documents use exactly
`style-src 'self' 'unsafe-inline'`.

**Constraints**

This change is CSS-only. Local `script-src` stays `'self'`; `unsafe-eval`, inline script,
remote resources, protocol privilege expansion, and every asset outside the existing allowlist
remain forbidden. The local CSS exception does not resolve a development renderer bundle that
uses `eval()`; that requires a separate source-map configuration change.

## Decision 17: Non-eval renderer source maps for strict local CSP

**Decision**

`apps/desktop/webpack.renderer.config.cjs` explicitly sets `devtool: 'source-map'`.
This overrides Electron Forge's development `eval-source-map` default while preserving
the production default and Forge's default of excluding source-map files from packages.

**Rationale**

The local Chrome/recovery protocol responds with `script-src 'self'`, which correctly allows
its external JavaScript files but correctly rejects a bundle that internally calls `eval()`.
Non-eval source maps keep the development and packaged code-execution boundary aligned.
Webpack configuration changes are only applied when the Forge development process starts.

## Implementation Verification Unknowns

## Release Closing Evidence

- Repository gates on 2026-08-05 passed: `pnpm lint` (seven existing warnings, no
  errors), `pnpm typecheck`, `pnpm test:stable` (151 files, 1006 tests), and `pnpm build`.
- The fixed production Origin probe for `X-AI-Mind-Desktop-Version: 0.5.0` returned a 404
  compatibility response. The root and instant-mind documents also lacked the required
  v0.5.0 CSP/security headers. This proves the existing production server has not yet
  received the server-side v0.5.0 change; it is not a client compatibility fallback case.
- The implementation workspace is uncommitted. Internal preview artifact creation remains
  deferred because the manifest, installer, and server-first verification must reference
  one immutable source commit.

涓嬪垪浜嬮」涓嶆敼鍙樻湰璁捐锛屼絾瀹炵幇鏃跺繀椤昏褰曚负鍙噸澶嶉獙璇佺殑浜嬪疄锛?

1. 鐢熶骇椤甸潰鐨勫畬鏁?CSP resource inventory锛圢ext runtime銆丅lob 鍥惧儚銆佸瓧浣?鍥炬爣鍜屾棦鏈夊悎娉?connect source锛夈€?2. 鍚庣画姝ｅ紡鍏紑鐗堟湰鐨勪唬鐮佺鍚嶄緵搴斿晢銆佸彲淇＄鍚嶈处鎴枫€乼imestamp 鏈嶅姟涓?CI secret binding锛涜繖浜涗笉灞炰簬 v0.5.0 鍐呴儴棰勮鑼冨洿锛屼篃涓嶅啓鍏ヤ粨搴撱€?3. Windows x64 runner 涓婂唴閮ㄩ瑙堝埗鍝佺殑鏈鍚嶆爣璇嗐€乫use/hash 楠岃瘉璁板綍涓庨娆″畨瑁呫€佽鐩栧畨瑁?smoke 璇佹嵁銆?4. Windows x64 clean install 涓?Electron/Forge 鐨勬渶灏?pnpm `allowBuilds` 娓呭崟锛涘繀椤荤簿纭褰曪紝绂佹涓轰笅杞?binary 鎵撳紑瀹芥硾鑴氭湰鏉冮檺銆?
   鍙噸澶嶉獙璇佹楠わ細鍦ㄥ叏鏂?Windows x64 鎴?macOS arm64 checkout 涓紝鍏堜緷璧栭攣瀹氬悗鐨?`pnpm-workspace.yaml` 鍒涘缓浠撳簱鍐?`.artifacts/desktop/pnpm-install.log`锛屽啀鎵ц閿佸畾瀹夎骞朵繚瀛樻棩蹇楋紱瀹夎鎴愬姛鍚庢墽琛?`node apps/desktop/scripts/verify-pnpm-builds.mjs --platform win32-x64 --install-log .artifacts/desktop/pnpm-install.log --report .artifacts/desktop/pnpm-builds-win32-x64.json` 鎴栧搴旂殑 `--platform darwin-arm64` 鎶ュ憡銆傝剼鏈嫆缁濋敊璇富鏈恒€両ntel 鍜?universal 鐩爣锛岀‘璁?Electron lifecycle/download 鏃ュ織銆佸疄闄?Electron binary銆丒lectron Forge CLI銆佸０鏄庣殑 pnpm 鐗堟湰鍜屾墍鏈夋槑纭?`allowBuilds` 鏉＄洰锛涗换浣曞凡鍚敤鐨勯€氶厤绗﹁鍙兘浼氬け璐ャ€?
   褰撳墠鏈満缁撴灉锛?026-08-03锛夛細鍐荤粨瀹夎鍏堜互 `electron: true` 鐨勬渶灏忚鍙畬鎴愶紱瀹夎鏃ュ織鏄庣‘璇嗗埆 Squirrel.Windows 鐨勭洿鎺ユ瀯寤轰緷璧?`electron-winstaller`锛屽洜姝ゅ彧鏂板璇ョ簿纭鍙€傞粯璁?Electron binary 涓嬭浇婧愯繑鍥?`fetch failed`锛屼絾鍦ㄤ竴娆℃€?`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` HTTPS mirror 鐜涓紝`electron --version` 鎴愬姛杩斿洖 `v43.2.0`锛涜鍙橀噺娌℃湁鍐欏叆 package銆乺untime config 鎴?preview artifact銆俙electron-forge --version`鎴愬姛杩斿洖`7.11.2`銆傚皢 `.artifacts/desktop/pnpm-builds-windows-x64.json`闄勫叆鏈増鏈殑 CI/acceptance evidence锛屽苟鍦ㄨ褰曚腑淇濈暀`enabled` 涓?`denied` 鐨勫畬鏁村寘鍚嶅垪琛ㄣ€丒lectron/Forge 鐗堟湰鍜屾墽琛屾椂闂达紱鍙湁鐩存帴鏀寔璇ュ畨瑁呯殑鍖呭彲涓?`enabled`锛屽叾浣?package scripts 蹇呴』淇濇寔鏄庣‘鎷掔粷銆?

## Package Compatibility Finding: Electron 43 V8 Snapshot Fuse

`LoadBrowserProcessSpecificV8Snapshot` is disabled for the Electron `43.2.0` desktop
build. The Windows release binary expects `browser_v8_context_snapshot.bin` when this
fuse is enabled, but the shipped runtime only includes `v8_context_snapshot.bin`; the
packaged executable therefore exits before the application main process starts. This is
an optional startup optimization rather than a required security hardening fuse. The
release verifier must require the disabled wire state, and every package change requires
both real-executable fuse inspection and a startup smoke test.

## Package Compatibility Finding: pnpm 10 DMG Native Build Scripts

GitHub Actions run `31182847863`, job `92880933374`, reached Forge's macOS arm64 DMG
maker after packaging, fuse modification, and ad-hoc signing had all succeeded. DMG creation
then failed because `macos-alias` could not load `build/Release/volume.node`. The clean-install
log showed that pnpm had denied the build scripts for both `macos-alias@0.2.12` and
`fs-xattr@0.3.1`.

The dependency path is `@electron-forge/maker-dmg -> electron-installer-dmg -> appdmg`;
`appdmg` directly uses `fs-xattr` and reaches `macos-alias` through `ds-store`. Both packages
use `binding.gyp` to build the native modules required by the DMG maker. pnpm's documented
`allowBuilds` policy is therefore kept fail closed while explicitly enabling only
`fs-xattr` and `macos-alias` for this reviewed call chain. The macOS clean-install verifier
must load both modules before Forge starts so an omitted or failed native build cannot pass
the policy gate and fail later during DMG creation. Windows keeps its existing
`electron`/`electron-winstaller` requirement; no fuse, signing, packaging, or workflow
topology change is part of this remediation.

References checked on 2026-08-07:

- [pnpm `allowBuilds` settings](https://pnpm.io/settings#allowbuilds)
- [Grafana k6 Studio explicit native allowlist](https://github.com/grafana/k6-studio/blob/5046db8c575a21ae4319923fe32897eaa0cad465/pnpm-workspace.yaml)
- [TriliumNext Trilium explicit native allowlist](https://github.com/TriliumNext/Trilium/blob/5e63c96beaaf58d9ec5390d2070d0661b91ce84c/pnpm-workspace.yaml)
- [Threema Desktop explicit native allowlist](https://github.com/threema-ch/threema-desktop/blob/9ae421c6b749f67e83b0ef7d1020490f848977a0/pnpm-workspace.yaml)
- [ToolHive Studio explicit native allowlist](https://github.com/stacklok/toolhive-studio/blob/44b07f9a88b3b7bbc653c34e35bb348bd973b75c/pnpm-workspace.yaml)
