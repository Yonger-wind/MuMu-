# AGENTS.md · 给接手的 Agent

本项目是一个零依赖的网页互动剧情游戏（原生 HTML/CSS/ES Modules + Canvas 2D + Web Audio）。
任何 Agent 拉取本仓库后，请按以下流程接手，保证进度与约束不丢。

## 1. 先读什么

1. `README.md` —— 运行方式、目录结构、剧本格式、当前状态与设计原则。
2. `scripts/portraits.js` —— 半身立绘系统（视觉核心，改动前务必通读结构）。
3. `scripts/scene.js` —— 分镜取景、人物左右站位与光影编排（人物如何接入场景）。
4. `scripts/parser.js` + `scripts/engine.js` —— 舞台指示标签如何从文本进入渲染。

## 2. 如何运行与验证

```bash
node serve.js        # → http://localhost:5173
```

- 单元测试：仓库根目录执行 `node --test`（Node 内置测试运行器，零依赖）；用例在 `tests/*.test.mjs`。
- 性能基线：`PORT=5199 node serve.js` 后 `node tools/perf-baseline.cjs --runs=3 --stage`；
  数字口径见 `docs/perf-baseline.md`（同机同版本 Edge 前后对比才有意义）。
  最近一次（2026-11-26 深夜，移动端全屏 + 锁定横屏之后）：首屏可交互 255 ms、
  35 请求 / 676 KB、首页 49.4 FPS / 舞台 59.3 FPS、异常 0
  （比上一轮多 1 请求 / +15KB，就是新增的 `scripts/fullscreen.js`）。
- 截图回归用 `node tools/cdp-shoot.cjs <steps.json>`（CDP 9333，新起 Edge 配置所以存储是空的）；
  步骤键只有 `navigate` / `eval` / `shot` / `viewport` / `wait` / `gesture`，
  所有点击和按键都要写在 `eval` 里；`"gesture": true` 让那次求值带真实用户激活
  （全屏、锁定横屏、音频解锁只在有激活时才允许，不加一律 SecurityError / "not granted"）。
  **headless Edge 永远进不了真全屏**：`requestFullscreen` 回 `TypeError: not granted`，
  `screen.orientation.lock` 回 `NotSupportedError: not available on this device`——
  成功路径只能在页面里打桩（覆盖 `documentElement.requestFullscreen` / `document.exitFullscreen` /
  `screen.orientation.lock`，并派发 `fullscreenchange`）验状态机与样式，真机行为仍需用户实测。
  横屏验收把 `viewport` 设成 844×390 与 812×375，竖屏用 390×844；截图是 JPEG 字节，
  文件名要写 `.jpg` 才能直接读。
- 必须走 HTTP，且 `serve.js` 不发缓存头：改完代码一定强制刷新（ignoreCache / Ctrl+F5）。
- 首次进入需点击一次遮罩（解锁音频），否则弹窗会被遮罩盖住。
- 首页右上角「角色图鉴」应打开图鉴：顶部四张典藏卡（星月夜 + Aeolian / ᥫᩣo.O / 彼岸洛luo，
  星级 7/7/6/6，卡面左上不标星级）开局即解锁，详情为近黑展示台上的持续全息扫光；
  下方四部曲目的角色卡默认锁定；点锁卡只出中文提示，点已解锁卡进入全息详情（Esc 先关详情再关图鉴）；
  角色卡统一深靛斜纹立式卡面（4:5.4），半身剪影 `object-fit: contain` 完整留在卡内、卡框不裁切模型，
  名字在左下、星点在右下，身份只在详情显示；面板底栏固定显示「剧本角色形象由AI生成，如有雷同，纯属巧合」。
- 图鉴顶部有两个标签页「角色图鉴 / 自定义卡片」（`role=tab`，`data-gallery-tab`）：默认停在角色图鉴，
  自定义卡片页首次点开才建（懒加载）；在自定义卡片页按 Esc 先退回角色图鉴页并把焦点还给标签，
  再按 Esc 才关图鉴。自定义卡片页 = 左侧卡片区 + 右侧「效果调节」面板：页顶有「＋ 新增卡片」「上传图片」，
  每张卡自身带「换图」「删除」（删除是两步确认，3.5 秒内不再点一次就自动还原）；
  卡片名称/身份可直接在卡面上改（Enter 保存、Esc 还原、粘贴去换行）；点卡上的星星打分，
  **星级最多 5 星**（`MAX_STARS=5`，星星颗数下拉也只有 1–5 颗，批量星级会跟着把超出的压回来）；
  最多 12 张，超了只出中文提示不静默丢弃；上传图片走拖拽或文件选择，本地压到最长边 1000px，
  透明底自动用 contain + 深紫黑剪影友好模式，存不进 localStorage 时提示「图片太大没存进去」。
  面板**只有 12 项**：彩虹强度 / 覆膜强度（默认「自动」，动过才显示手动值）/ 高光 / 倾斜角度 / 视差 /
  圆角 / 主题（暗色·亮色）/ 画幅 / 箔层花纹（无·斜纹·光栅·星点·蜂窝）/ 星星颗数 / 批量星级 / 显示星级；
  面板上必须写明「只作用于下方的自定义卡片」——这些参数**绝不能影响内置角色卡与典藏卡**
  （它们渲染时不传 `fx`，走原来的固定值路径）。
- 自定义卡片**点卡面本体**进入「单独检视」：复用图鉴同一个近黑展示台详情层
  （`.mumu-gallery__detail`，大卡 + 入场扫光 + 陀螺仪），底部多一条翻页
  `‹ n / N ›`（只有一张时不出现，首尾循环，逻辑在 `custom-cards-data.js` 的 `stepIndex`）；
  检视里点星星会写回这张卡的星级并**同时刷新大卡与列表卡**；✕ 或 Esc 退回卡片区（焦点回到原卡），
  再按 Esc 才退回角色图鉴页。翻页按钮每次都要重新查询（详情层是整块重建的，旧节点已脱离 DOM）。
  内置卡 / 典藏卡的详情不带翻页、仍是静态 `<span>` 星点。
- 开演后对话框右上角有「‹ 回退一句」：点一次只退一屏、可一直点着逐句往回退（不是只退一次），
  第一句时按钮隐藏；停在选项上回退会回到最近一句并收起选项，停在【结束】回退会收起结算卡；
  回退后再前进会丢弃被退掉的“未来”，重新走下去。
- 舞台右上角有「换个剧本」「选章节」：换个剧本 = 不离开剧情，直接在剧场上盖完整剧目选择
  （默认居中漩涡；关闭按钮为「返回剧情」，误触可原句回到舞台；从首页或落幕结算卡进入时才是
  「返回首页」）；选章节 = 直接在剧情上开**章节面板**（`chapterOnly`：不铺剧目底色、不生成环形卡带，
  只留半透 veil + 右侧抽屉，舞台画面继续透在后面；关闭按钮是文字「返回剧情」，面板底栏的
  「导出整本 / 换封面 / 移除」一并隐藏——那些属于剧目选择页，省下的位置让四章不用滚就能看完，
  选章后从该章重新开始）。真实剧本 >10 部（环形卡带不可用）时，「选章节」直接按当前曲目打开
  章节列表弹窗（`openChapters`），不会退化成先挑曲目。选择层盖在舞台上时，回车 / 空格只作用于选择层，
  不会推进后面的剧情。
- 舞台右上角那一排（换个剧本 / 选章节 / 保存进度 / ♪）与首页功能组是同一套滑行药丸
  （`createGlideNav(el, { itemSelector: '.stage-btn:not([data-mg-twin])' })`），区别只在它底下垫了一块
  暗色托板（`--mg-scrim`）：舞台昼夜亮度不定，纯文字会被白天场景洗掉。托板是轨道的 `::before`，
  **必须 `z-index:-1` 沉到文字底下**——定位伪元素默认排在普通流内容之上，再叠 `backdrop-filter`
  就会把按钮自己的字糊进模糊里（实测整条文字消失）。揭开动画只在本页第一次进舞台时播一次，
  之后再进只 `refresh()` 重量尺寸、不重播；左侧「← 返回首页」保持原来的 chip 外观，不参与。
- **移动端全屏 + 锁定横屏**（2026-11-26 加，`scripts/fullscreen.js`）：舞台右上那一排在**横屏手机**上
  多一颗 `#stage-fullscreen`（⛶），点一下 `requestFullscreen({navigationUI:'hide'})` 成功后立刻
  `screen.orientation.lock('landscape')`——顺序不能反，Chrome 系在非全屏时一定拒绝 lock。
  竖屏时这颗按钮**不出现**（`shouldShowButton` 要 `w > h`），改由「请横屏体验」面板顶部的
  暖色主按钮「全屏并锁定横屏」承接（`rotateInner(canFullscreen)`，`enter({quiet:true})`，
  失败文案写进面板自己的 `.mumu-rotate__note`，因为 `.toast` 在 z120 面板底下会被盖住）；
  全屏成功后面板撤掉并把 `mumu.rotate.dismiss` 写进 sessionStorage，转回横屏时 `refresh()` 清掉记忆。
  能力全部走特性检测：iPhone Safari / 微信 iOS 两个 API 都没有 → 主按钮整个不渲染、只留「仍以竖屏继续」；
  安卓微信等「能全屏不能锁」→ 进全屏后给一句「已进入全屏 · 这个浏览器不会自动转横屏，请把手机横过来」；
  请求被拒给「全屏没有被允许，请在浏览器菜单里选「全屏」再试」。**桌面不出现这颗按钮**
  （`pointer: coarse` 为假，且 AGENTS.md 要求桌面外观不变，靠 F11），
  桌面唯一的视觉变化是 `html:fullscreen` 的底色补了 `#120d22`。
  按钮态（`aria-pressed` / `.is-on` 暖圈 / title）由 `syncFsButton()` 统一刷，
  它同时是 `onState` 回调，被 `fullscreenchange` 事件驱动——所以浏览器自己撤掉全屏时
  也会补一句「已退出全屏，横屏锁定已解除。」；主动点退出走 `hush` 不重复提示。
  **滑行药丸的坑**：`.mumu-glide.mumu-glide [data-mg-item] { display:inline-flex }` 的作者样式会抢回
  UA 的 `[hidden]{display:none}`，隐藏条目必须单独写
  `.mumu-glide.mumu-glide [data-mg-item][hidden] { display: none; }`，否则桌面上那颗 ⛶ 照样渲染；
  `glide-nav.js` 的 `STRIP_ATTRS` 里也要带 `'hidden'`（墨层克隆不能继承 hidden，否则字永远不亮），
  `measure()` 靠 `twins[i].hidden = !(rect.width > 0)` 让没渲染的条目克隆也不显示。
  单测 `tests/fullscreen.test.mjs`（20 条，含调用顺序 `request → lock → unlock → exit` 的断言，
  把 lock 提到 request 前面会红三条）。
- 每次改动后先确认入口：首页「开始体验」应打开全屏环形剧本选择（不是旧陈列弹窗）：
  默认居中为《漩涡与深蓝：星月夜的回响》（《星月夜》封面），左邻《月光下的未完奏鸣》
  （乐谱封面）、右邻《青绿长卷·千里未归》（青绿山水封面），再往外左侧是「敬请期待」占位卡、
  右侧是《蝉鸣止于逢魔时》（黄昏海面封面）；真实剧本≤10 部时共 11 张卡（4 曲目 + 7 占位），
  拖动 / 滚轮 / ← → 切换，也可点两侧的「〈」「〉」按钮单步切换；回车或点居中封面正下方的
  「开始体验」小白字打开右侧章节抽屉（点封面本身只负责把两侧剧本转正，不再进入章节）；
  点击占位卡只出「这一部还在筹备中 · 敬请期待」，且占位卡不出现「开始体验」。
  字幕区显示曲目关键词（青春校园 / 古风 / 悬疑 / 言情），左下角固定
  「剧本由AI生成，如有雷同，纯属巧合」；导入剧本按钮先关选择层再开 z60 导入弹窗。
  把 7 部以上自定义剧本塞进 `mumu.scripts.v1`（真实总数 >10）后重新进入，
  应回退为原来的「选择剧本」陈列弹窗，曲目卡仍带关键词与免责声明。
- 从章节列表进入四部内置曲目的**第一章**时，先播放各自的专属开场动画
  （`scripts/openings/`：外壳 `shell.js` + 美术模块 `vortex.js` / `cicada.js` / `qinglv.js` / `moonlight.js`，
  由 `index.js` 按曲目懒加载）：蝉鸣是黄昏海面与落日星屑，青绿是千里江山图的青绿山脊与白雾，
  月光是深蓝夜空里的金色五线谱与音符，漩涡是星月夜漩涡。《漩涡》约 7.2s、其余三部约 6.2s
  浮现大标题（比画面铺满早两秒多），标题下一行「点击任意处开始剧本」，右上角小号「跳过动画」；
  标题出现前点击无效（也不会推进后台剧情），标题后点击 / 回车 / 空格开演，Esc 或跳过按钮立刻进剧本。
  只有四部曲的第一章触发；第二章起、自定义剧本、「继续上次」与读档都不触发；
  WebGL2 不可用时退回 Canvas2D；390 宽下标题、提示、跳过按钮都不溢出；
  青绿是亮底深字，光晕与字缘用白色（改配色时别只调深底那三套）。
- 开场动画的**建场与撤场节奏**（改 `shell.js` 前必读，这三条是踩过坑定下来的）：
  ① 建场必须分帧——同步一次做完会僵住近一秒：`setup()` 里先只算画布尺寸，下一帧揭幕
  （移除 `is-cold`），再各占一帧跑底涂 `paintUnder`（实测软件渲染 0.6~1.7s）、造粒子、开播；
  段间用 `later(name, fn)`（rAF + `setupEpoch` 守卫），建场失败也要放行标题与点击。
  ② `ResizeObserver` 在 `observe()` 当下会立即回调一次，**必须比对尺寸（±8px）再决定重建**，
  否则 200ms 后整场白建第二遍（开头两次长任务，就是「开始播放时卡」的根因）。
  ③ 生长时间轴启动前先空跑 `PRIME_FRAMES` 帧（只画进离屏 ink、不上屏），并用 `holdUntil`
  压住第一帧；画面第一次真画时打 `is-painted`，`.mumu-opening__sky` 靠它从幕布底色淡入。
  ④ 撤场顺序是 `finish()` → 先 `onDone()`（开演、切到舞台）→ 再 `retire()`：淡出至少 `LEAVE_MS`
  （420ms）且最多 `HOLD_MS`（1500ms），中间等 `onStageReady()`（= `main.js` 的 `stagePainted()`：
  懒加载 scene.js/prop.js 并等两帧真有像素）才销毁 DOM。**先销毁后开演就会露出好几帧首页**。
- 开演后发言人名称下方应有一行小字身份（如夏目悠真「高三学生 · 旧磁带的主人」，
  青绿沈砚「翰林图画院 · 天才画师」，月光顾言「投资方代表」）；身份按曲目作用域匹配，
  《蝉鸣》的小悠真 / 小葵不显示，自定义剧本不会借用内置身份。
- 实际跑一遍《蝉鸣止于逢魔时》第一章：
  教室远景旁白 → 中景持有磁带 → 近景对话 → 特写贴纸 → 第一个选项（追问/假装没注意）
  → 修磁带 → 第二个选项（为什么早说/把歌听完）→ 录音旁白（第 5 列人物不上场）
  → 第三个选项（先捡文件/抓起就跑）→ 夜晚操场远景 → 结束；
  第二章两条路线都要走到：操场远景 → 双人选项 →「公交站」夜访父亲公司（含旧照片特写）
  与「后山神社」直上石阶，两条线都应在神社与白石雅美汇合、走到结尾；
  第三章全章无选项：满月神社远景 → 中景修磁带 → 近景告白 → 磁带特写 → 幻影远景
  （小悠真/小葵先出场、挥手化作萤火，画外音不出现代人物立绘）→ 耳机特写（录音旁白）
  → 中景依偎 → 结尾；白石葵应为 `少女（2）` 剪影，月亮只出现在操场/神社室外夜景；
  第四章终章：白天教室远景（有课桌、窗外海面）→ 中景空座 → 近景抚桌 → 抽屉/纸飞机特写
  （信纸道具）→ 中景展开信纸读信（白石葵只出“画外音”，舞台不出现她的立绘）
  → 近景落泪 → 白天远景窗前望海 → 黄昏远景空教室 → 结束；
- 再跑一遍《青绿长卷·千里未归》：
  第一章 宫苑白天远景 → 丹青阁中景（沈砚独白）→ 近景阿黛入场 → 颜料特写/长卷特写 → 研钵收尾；
  第二章 宫苑黄昏远景（太后仪仗）→ 丹青阁黄昏中景/近景（太后与阿黛）→ 夜晚中景顾怀远夜访
  → 令牌特写 → 中景陈词 → 结束；
  第三章 白天中景/近景（告白）→ 双人选项「隐瞒 / 坦诚」→ 两条线都汇入夜晚特写：
  紫檀木盒（先合后开）→ 暗红矿石 → 研钵 → 近景收尾；
  第四章 宫苑火夜远景 → 丹青阁火夜中景/近景 → 选项「舍弃画卷 / 誓死护画」
  → 两条线都到「近景（叛军破门）→ 特写（血珠落在卷尾）」→ 火夜远景诀别
  → 二十年后宫苑白天远景 → 丹青阁白天中景（小豆子画外音）→ 特写（画尾红枫）→ 白日远景收尾；
- 再跑一遍《漩涡与深蓝：星月夜的回响》：
  第一章 街道雨夜远景 → 沙龙远景/中景（墙上《星月夜》原图）→ 书房中景（命案现场、
  血泊与倒下的青铜雕塑）→ 画布碎片/旧纸片特写 → 里间线索 → 结束；
  第二章 庄园白天远景（石砌外墙、瓦垄、柏树夹道）→ 起居室往事（壁炉、落地窗庭院）
  → 双人选项「父亲公司 / 后山神社」两条路线 → 画库特写（逆向《星月夜》）→ 结束；
  第三章 夜晚书房中景（旁白称「临时借用的档案室」）→ 双人选项「公开真相 / 篡改报告」→ 两条线分别到
  黄昏露台（咖啡）与夜晚修复室（逆向《星月夜》特写）→ 结束；本章为终章，不应出现「继续下一章」；
- 再跑一遍《月光下的未完奏鸣》：
  第一章 校园黄昏远景（红砖、藤蔓、梧桐）→ 旧琴房黄昏远景/中景（立式钢琴、月光）
  → 钢琴键盘特写 → 近景初见 → 双人选项「主动提议 / 等他开口」→ 小提琴特写
  → 夜晚合奏 → 田径场远景/中景 → 汽水特写 → 夏晴入场 → 双人选项「撮合 / 调侃」
  → 音乐社白天中景（陈默）→ 黄昏排练 → 乐谱特写 → 双人选项「解压 / 共鸣」
  → 夜晚完美合奏 → 结束；
  第二章 钟楼夜晚远景/中景 → 双人选项「承诺 / 平行线」→ 手抄乐谱特写 → 赠谱
  → 音乐社白天（周慕白）→ 双人选项「坦然 / 转移」→ 校园黄昏电话 → 草坪黄昏
  → 草坪夜晚远景/中景（空谱架、串灯）→ 夏晴带来手机 → 双人选项「致意 / 沉默追光」
  → 钢琴特写独奏 → 结束；
  第三章 陆家嘴白天远景 → 写字楼白天中景（叶知秋）→ 黄昏顾言/苏晚入场
  → 双人选项「克制 / 失神」→ 夜晚窗边 → 素圈戒指特写 → 双人选项「提起乐谱 / 咽回去」
  → 清吧（叶知秋）→ 清吧包厢（顾言/苏晚）→ 双人选项「坦白 / 隐瞒」
  → 陆家嘴夜晚车别 → 结束；
  第四章 剧院前庭黄昏远景/中景（叶知秋）→ 老剧院夜晚中景（顾言/苏晚）
  → 双人选项「成全 / 尊重」→ 乐谱特写 / 小提琴特写 → 双人选项「相视一笑 / 各自沉浸」
  → 曲终告别 → 剧院前庭夜晚远景 → 老剧院特写（最后一枚休止符）→ 结束；
  本章为终章，不应出现「继续下一章」；
- 再回归 保存进度 → 刷新页面 → 选择存档读取 → 续演（四套曲目的各章亦需验证）；
  打开 剧本库 / 导入 弹窗；把首页下滑到「项目介绍」屏（原「玩法与格式」弹窗已删并并入这一屏）；
  最后确认浏览器控制台无报错。
- 首页是可下滑的两屏：第一屏黄昏主视觉（`纸上幕启` + `微互动式剧本` + 副标题 + CTA + 下滑提示），
  第二屏 `#intro`「项目介绍」用六张卡介绍内容与玩法。主标题下的「项目介绍」按钮（`#btn-intro`）
  与「下滑看项目介绍 ⌄」（`#btn-scroll-intro`）都平滑滚到 `#intro.offsetTop`，介绍页底部
  「开始体验」滚回顶部并打开剧目选择、「回到首页」只滚回顶部；减少动态时改为瞬时跳转。
  滚动只发生在 `#home` 自己身上（`html/body` 仍 `overflow:hidden`），剧情舞台与 `#ui-layer`
  悬浮层不受影响，`showScreen('home')` 会把 scrollTop 归零。
- 每章走到【结束】时应看到「换一个剧本」；非末章还要有「继续下一章」，点击后直接接演
  同一曲目的下一章；末章不显示「继续下一章」。
- 视觉调整要截图对比，验收标准是"不卡通、不贴纸、融入环境光、情绪可读、不遮挡对话框"。

## 3. 硬性约束（不可违反）

- **不要恢复已删除的旧剪影/卡通人物系统或角色外观编辑器**：人物只来自 `assets/models/*.cut.png`。
- **不要按角色姓名推断外观**；只使用剧本明确写下的模型 / 性别线索（见 `character-manager.js`）。
- 人物只允许：深紫黑半身剪影立绘 + 克制的暖/冷边缘光 + 空气透视 + 接地软阴影；
  禁止描边发光、五官、表情贴图；只在对话框左/右两侧出现，不得居中或遮挡文字。
- 立绘直接使用 `assets/models/*.cut.png` 素材自带的边缘，不做额外勾边/描边
  （用户已明确要求不勾边）；`tools/png-alpha.js` 只做去底、裁边，并对六张国风新模型
  （painter/colorist/pageboy/maidgirl/official/dowager）把内部白色线稿压平为深紫黑剪影。
- 剧本库是「曲目 → 章节」两级：内置剧本分别由 `series: 'cicada'`、`'qinglv'`、`'vortex'`、
  `'moonlight'` 合订为四张曲目卡，修改 `builtin.js` 时保留 `series / seriesTitle / chapterNo` 字段；
  首页「开始体验」必须打开「选择剧本」，不要直接 `play(builtins[0])`。
- 剧本选择动画的硬约束：真实剧本（内置曲目 + 用户导入）≤10 部时走环形卡带并补 7 张
  「敬请期待」占位；占位卡不参与阈值计数；真实剧本 >10 部时必须回退到原陈列弹窗
  （`openLibrary`），不得为了动画丢卡片。曲目封面：蝉鸣 = `assets/images/covers/cicada-dusk.jpg`，
  青绿 = `assets/images/covers/qinglv-spring.jpg`，漩涡 = `starry-night.png`，
  未完奏鸣 = `pathetique-score.png`。
- 曲目关键词固定为：蝉鸣「青春校园」、青绿「古风」、漩涡「悬疑」、未完奏鸣「言情」；
  选择页左下角必须保留「剧本由AI生成，如有雷同，纯属巧合」原文。
- 发言身份小字只对内置曲目生效，按曲目作用域查 `gallery-data.js` 的 `SERIES`；
  《蝉鸣》的 小悠真 / 小葵 不显示身份，自定义剧本不得借用内置身份。
- 不要引入第三方依赖、不要加构建步骤、不要整体重构 UI 与页面布局。
- **移动端必须是横屏体验**（2026-11-26 定的硬要求）：分镜与对话框都以横向为前提，竖屏只由
  `scripts/rotate-hint.js` 提示「请横屏体验」（短边 ≤500 且竖屏才提示，可「仍以竖屏继续」，
  横屏后自动清除，记忆写在 sessionStorage `mumu.rotate.dismiss`），**不要**改成竖屏分镜。
  允许（且已实现）的是**用全屏把横屏锁住**：`scripts/fullscreen.js` 只在特性检测通过时调
  `requestFullscreen` + `screen.orientation.lock('landscape')`，检测不过就退回文案引导，
  **绝不放点了没反应的按钮**；桌面不出现 ⛶，桌面外观口径仍是「与改动前一致」。
  矮视口重排集中在 `@media (max-height: 600px)`：`styles/main.css`（首页主视觉 + 项目介绍三列 + 对话框与提示条）与
  `styles/extensions.css`（剧目选择 / 图鉴 / 自定义卡片 / 结算）。2026-11-26 真机实测：横屏手机的 CSS 视口约为
  1400×524（物理像素 2800×1280，受浏览器地址栏影响），旧 460px 断点不会命中；600px 同时覆盖 1400×524、
  844×390 与 812×375。改这几处后必须在这三种尺寸截图复验，同时确认 1440×900 桌面外观不变。剧目选择里「开始体验」贴在居中封面正下方，
  矮视口靠 `.mumu-scripts__stage { max-height }` 给容器封顶来腾出空间（`carousel.js` 的 `CAPTION_SPACE`
  为 0、字幕区不参与测量，所以别指望改字幕来避让）。
- **矮屏对话框口径（2026-11-26 实测，改 `.dialogue` 前先看）**：桌面口径的对话框在 390 高屏上会占到
  视口高的 58%（旁白屏）/ 73%（选项屏），人物下半身和特写道具全被压在板子下面，因此矮视口把它压到
  旁白 18–23%、选项 37%（`main.css` 里 `.dialogue` 那段媒体查询：`bottom:14px`、`padding:13px 20px 12px`、
  字号 15/14.5/13）。**结束页是三段结构（落幕文案 + 结算卡 + 一排按钮），只压字号一定超屏**：
  结算卡在矮视口改为 `max-height: none`（不再自己套内滚动，行距只靠 `.mumu-finale__rows { gap }` 控制，
  `__row` 上不要再加 padding），结束按钮用兄弟选择器
  `.mumu-finale:not([hidden]) ~ .dlg-choices` 转成横排药丸，整块再由 `.dialogue` 的
  `max-height: calc(100vh - 62px); max-height: calc(100dvh - 62px); overflow-y: auto` 兜底（先写 vh 兼容旧浏览器，
  再用 dvh 跟随手机地址栏收放；62 = 底部 14 + 顶栏留 48，免得压到「换个剧本」那一排）。
  实测 812×375 结束页 `client == scroll`（不需要滚）、三颗按钮全在屏内；844×390 结算卡完整可读。
  **两条踩过的坑**：① 同特异性的 `@media` 覆盖块必须排在基础规则**之后**（`.dialogue` 在 `main.css:359`，
  所以那段媒体查询写在 `.mumu-dlg-back` 之后，不是文件里已有的第 290 行那块）；② `.toast` 基础规则只有
  `bottom: 40px`，在更早的块里写 `top: 54px; bottom: auto` 会被后面的基础规则把 `bottom` 抢回来，
  `top` 与 `bottom` 同时生效会把胶囊拉成 296px 高的一整条——提示条的矮视口覆盖必须单独放在 `.toast.show` 之后。
- **`scene.js` / `prop.js` 不得回到首屏导入图**：`main.js` 只静态导入 `scripts/lazy-scene.js`
  （与 `createSceneRenderer` 同接口的代理），真模块在首次绘制场景时 `import()`。新增场景相关调用
  一律走这个代理；代理在 ready 前会缓存最后一次 `start()` 参数并重放，加载失败只走 `onFail`
  中文 toast，不能抛出未处理的 rejection。首屏体积/FPS 口径见 `docs/perf-baseline.md` 第二轮。
- **代理的 `preloadImages()` 必须转发给真实渲染器**（2026-11-26 踩过的坑）：`main.js` 进舞台 / 开剧目选择时
  调的是 `lazy-scene` 代理，代理若只 `ensure()` 而不把请求补给 `scene.js`，四张场景大图
  （`starry-night.png` / 陆家嘴昼夜 / `pathetique-score.png`）就永远不会被请求，于是沙龙展墙、画库镜像、
  修复室防潮箱、特写道具与陆家嘴天际线全部长期落在 `paintStarry` 的**程序化兜底夜景**上——画面"看着像"，
  其实是假的。单测只记录了 `preloads` 计数没断言，所以一直没暴露；现在 `tests/perf-loading.test.mjs`
  会断言转发次数，改代理时别把它删掉。
- **自定义卡片是隔离的**：内置角色卡 / 曲目卡 / 典藏卡渲染时永远不传 `fx`，`gallery-card.js` 的
  无-`fx` 分支必须保持原来的固定值（`--pc-radius:0px`、`--pc-foil:0.65`、`--pc-pattern:STRIPES`、
  `--pc-holo-gain:1.25`、静态 `<span>` 星点、位移写死 `'0px'`）；用户在「效果调节」面板调的任何参数
  只进 `.mumu-ccard` 里的那张卡。自定义卡硬上限：星级 ≤5、张数 ≤12、图片最长边 1000px、
  名称 ≤24 字、身份 ≤60 字；编辑面板不得超出那 12 项功能；图片只存 localStorage
  （`mumu.customcards.v1` / `mumu.customcards.fx.v1`），空间不足时降级为「无图卡」并给中文提示，
  不得静默失败、也不得改成服务端上传。
- **部署口径：最终网站由 Qoder 部署到 Qoder Sites（唯一部署目标）**；
  不为 Cloudflare Pages / GitHub Pages 等其他托管做适配，仓库保持零依赖零构建的纯静态形态；
  部署动作由 Qoder 侧执行（见 `docs/superpowers/specs/2026-11-23-mumu-local-creation-platform-roadmap.md` §7）。
- 内置剧本保留《蝉鸣止于逢魔时》《青绿长卷·千里未归》《月光下的未完奏鸣》各第一至四章（终章），
  以及《漩涡与深蓝：星月夜的回响》第一至三章（第三章为双结局终章）；
  删除内置剧本/人物前先确认这是产品决策。
- 不得破坏：剧本解析、人物识别、对话播放、剧情分支、存档、角色稳定性（同一剧本同一 cid 外观不变）、分镜系统。
- 存档兼容：`mumu.saves.v2` 为当前写入键；`mumu.saves.v1` 的旧存档（缺少 `state`、`actState` 等新字段）必须仍可读取，新字段一律给默认值。
- 修改解析器/引擎时保持向后兼容：旧剧本（无舞台指示、4 列角色行）必须按原有方式正常播放。

## 4. 修改速查表

| 想改什么 | 改哪里 |
| --- | --- |
| 人物比例 / 朝向 / 边缘光 / 渐隐 / 呼吸 | `scripts/portraits.js`（立绘资源在 `assets/models/`） |
| 替换人物模型 / 去底 / 裁边 / 压平线稿 | 新 PNG 放到 `assets/models/<key>.png`，运行 `node tools/png-alpha.js assets/models` 生成 `<key>.cut.png`（不勾边；六张国风模型名会自动压平线稿） |
| 曲目卡与章节列表 | `scripts/modals.js`（`groupScripts` / `openChapters` / `THUMB` / `SERIES_COVER`）、`scripts/builtin.js`（`series` 字段）、`styles/main.css`（`.series-card` / `.chapter-*`） |
| 全屏剧本选择动画（环形卡带 / 占位卡 / 章节抽屉 / 换封面） | `scripts/selector.js`、`scripts/carousel.js`、`scripts/selector-data.js`、`styles/extensions.css`（`.mumu-scripts*` / `.mumu-cc*`） |
| 第一章开场动画（触发条件 / 标题时机 / 点击提示 / 跳过 / 四套配色 / 分帧建场 / 撤场不露首页） | `scripts/openings/shell.js`（外壳、`setup()` 的 `later()` 分帧、`PRIME_FRAMES`/`holdUntil`/`is-painted`、`finish()`→`retire()` 的 `LEAVE_MS`/`HOLD_MS`）、`scripts/openings/index.js`（懒加载、触发面、`prefetchOpenings`）、`scripts/openings/<series>.js`（美术模块：标题 `titleAt`、`introEnd`、`params`、`seed`、`create(api)` 钩子）、`scripts/main.js`（`startScript`、`stagePainted`、keydown 守卫）、`styles/extensions.css`（`.mumu-opening*` / `--op-*` / `.is-cold` / `.is-painted`）；静态自检 `node tools/opening-check.mjs`，建场耗时可在控制台设 `window.__openPerf = []` 再看时间线 |
| 曲目封面图（选择动画 + 陈列回退） | `scripts/selector.js`（`BUILTIN_COVERS`）、`scripts/modals.js`（`SERIES_COVER`）；图片在 `assets/images/covers/` 与 `assets/images/` |
| 曲目关键词 / 发言身份 / AI 免责声明 | `scripts/series-meta.js`（`SERIES_KEYWORDS` / `identityOfSpeaker` / `AI_DISCLAIMER`，身份取自 `gallery-data.js` 的 `SERIES`） |
| 发言人名称下的身份小字 | `index.html`（`#dlg-role`）、`scripts/main.js`（`setName`）、`styles/extensions.css`（`.mumu-dlg-role`） |
| 分镜取景、人物站位、场景光影、镜头运动 | `scripts/scene.js` |
| 《星月夜》原图（沙龙展墙 / 画库镜像 / 曲目卡封面） | `assets/images/starry-night.png`；场景在 `scene.js`，道具在 `prop.js`，封面在 `modals.js` |
| 《悲怆》乐谱原图（曲目封面 / 剧情特写） | `assets/images/pathetique-score.png`；道具 `drawScoreProp` 在 `prop.js`，封面在 `modals.js` |
| 《蝉鸣》黑白旧照片原图（特写相纸内框 / 顶部对齐裁切） | `assets/images/cicada-photo.jpg`；`prop.js` 的 `drawPhoto` 在有 photo 时整幅覆盖，`scene.js` 的 `detailPhotoBoy` 在特写台词命中「旧照片 / 小男孩」时启用 |
| 陆家嘴昼/夜原图（城市远景 / 写字楼幕墙） | `assets/images/lujiazui-day.png`、`lujiazui-night.png`；`drawCity` / `drawOffice` 在 `scene.js` |
| 特写道具（长卷/令牌/木盒/研钵/磁带/耳机/纸张/旧照片/信纸/星月夜/放大镜/档案/账册/星图/手机/碎片/咖啡/乐谱/小提琴/钢琴/汽水/戒指） | `scripts/prop.js` |
| 新增舞台指示标签（【姿态】【动作】【视角】【出场】【清场】等） | `parser.js`（解析）→ `engine.js`（状态）→ `scene.js`（消费） |
| 对话推进 / 选择 / 存档快照结构 | `scripts/engine.js` |
| 回退一句（逐句历史 / 一次退一屏） | `scripts/engine.js`（`recordSay` / `restoreSay` / `back` / `canBack` / `history` / `view`，单测在 `tests/engine-state.test.mjs`）、`index.html#dlg-back`、`scripts/main.js`（`setBackEnabled`）、`styles/main.css`（`.mumu-dlg-back`） |
| 裸露纯文字按钮的热区（首页「下滑看项目介绍」/ 舞台「‹ 回退一句」/ 选择页「开始体验」） | `styles/main.css`（`.scroll-cue` 用 `padding:12px 18px` + 等量 `margin-left:-18px`，字仍与标题左缘对齐；`.mumu-dlg-back` 放大 padding 时同步减 `top/right`，字形位置不变）、`styles/extensions.css`（`.mumu-scripts__go` 的 `padding:12px 22px` 配 `margin:-10px 0 0`，抵掉多出来的上半部分，字停在 `selector.js` `placeGo()` 算出的「封面底 +14px」处；改那个 14 就要一起改这里的 -10） |
| 舞台顶栏「换个剧本 / 选章节」 | `index.html`（`#stage-switch` / `#stage-chapters`）、`scripts/main.js`（`showLibrary({ initialKey, openChapters, chapterOnly, closeLabel })`；舞台可见时关闭文案默认「返回剧情」；`chapterOnly` 且剧本 >10 部时走 `openChapters(group, …)` 回退）、`scripts/selector.js`（`openScriptSelect` 的 `initialKey` / `openChapters` / `chapterOnly` / `closeLabel`，`buildOverlay(chapterOnly)`）、`styles/extensions.css`（`.mumu-scripts--chapter` 那段，必须排在 `.mumu-scripts` 基础规则之后）、`styles/main.css`（`.stage-top` 窄屏媒体查询） |
| 选项旗标 / 条件行语法 | `scripts/parser.js`（`FLAG_KEY_RE` / `COND_RE` / `splitOptionFlags`）、`scripts/engine.js`（`condOk` / `applyOptionFlags`）、`scripts/serialize.js`、`tools/lint.js`（E109/E110） |
| 内置剧本与演示 | `scripts/builtin.js` |
| 弹窗（剧本库/存档/导入） | `scripts/modals.js`（原 `openHow`「玩法与格式」已删除，内容并入首页「项目介绍」屏） |
| 首页下滑与「项目介绍」屏 | `index.html`（`#intro` 六张 `.intro-card`、`.home-space` 占位、`#btn-intro`、`#btn-scroll-intro`、`#intro-start` / `#intro-top`）、`scripts/main.js`（`homeScrollTo` / `scrollToIntro`、`showScreen` 回首页时 `scrollTop = 0`）、`styles/main.css`（`#home` 滚动容器、`.home-space`、`.intro*`、`.scroll-cue`）；`.intro-note` 里的 200–30000 字与 5MB/32MB 上限要跟着 `parser.js` 的 `LIMITS` 同步 |
| 角色图鉴（典藏卡 / 曲目分区 / 锁卡提示 / 全息详情 / 两个标签页） | `scripts/gallery.js`（`tabButton` / `setTab` / Esc 分层）、`scripts/gallery-card.js`、`styles/extensions.css`（`.mumu-gallery*` / `.mumu-gallery__tab*` / `.mumu-holo-card*`） |
| 自定义卡片页（上传 / 换图 / 删除 / 卡面改名 / 12 项效果面板 / 5 星上限 / 全屏检视翻页） | `scripts/custom-cards.js`（UI、上传压缩、`openInspect`）、`scripts/custom-cards-data.js`（纯逻辑与限额 + `stepIndex`，单测 `tests/custom-cards.test.mjs`）、`scripts/gallery.js`（`openDetail(card, trigger, { fx, onRate, pager })` / `buildDetailPager`）、`scripts/gallery-card.js`（`applyFxVars` / `buildHoloCard` 的 `fx` / `refs.setFx` / `engine.setShape`）、`styles/extensions.css`（`.mumu-ccard*` / `.mumu-gallery__detail-pager*`） |
| 卡面效果参数怎么落到 CSS 变量（仅自定义卡） | `scripts/gallery-card.js` 的 `THEME_LIGHT` / `FOIL_BLEND` / `MASKS` / `MASK_SIZE` / `GRAIN` + `applyFxVars`；内置卡不传 `fx` 走 `applyVars` 固定值 |
| 图鉴角色名称 / 身份 / 星数 / 立绘 / 典藏卡 | `scripts/gallery-data.js`（`SEVEN_CARDS` / `SERIES`） |
| 角色卡卡面（深靛斜纹立式 4:5.4 / 剪影 contain 不被卡框裁切 / 名字左下、星点右下） | `scripts/gallery-card.js`（`applyVars` 的 `--pc-aspect`）、`styles/extensions.css`（`.mumu-holo-card--char*`） |
| 章节通关发卡与解锁存储 | `scripts/gallery-store.js`（`mumu.gallery.v1`，按 `script.id` 幂等，只对内置曲目发放） |
| 首页视觉、按钮、模块装配 | `scripts/sunset.js`、`scripts/main.js`、`index.html` |
| 竖屏提示「请横屏体验」 | `scripts/rotate-hint.js`（`PHONE_SHORT_EDGE` / `shouldPrompt` / `rotateInner(canFullscreen)` 文案）、`styles/extensions.css`（`.mumu-rotate*` / `.mumu-rotate__fs` / `.mumu-rotate__note`）、单测 `tests/rotate-hint.test.mjs`；`window.__mumu.rotate`（`shown` 是 getter） |
| 移动端全屏 + 锁定横屏（⛶ / 全屏主按钮 / 提示文案 / 桌面不出现） | `scripts/fullscreen.js`（`pick*` / `supports*` / `isMobileViewport` / `shouldShowButton` / `enterNotice` / `exitNotice` / `createFullscreenController`）、`scripts/main.js`（`syncFsButton`、`#stage-fullscreen` 接线）、`index.html`（`#stage-fullscreen`）、`styles/main.css`（`html:fullscreen` 底色、`#stage-fullscreen.is-on`）、`styles/extensions.css`（`.mumu-glide [data-mg-item][hidden]`）、单测 `tests/fullscreen.test.mjs`；`window.__mumu.fullscreen` |
| 横屏矮视口（844×390 / 812×375）布局 | `styles/main.css` 与 `styles/extensions.css` 各自的 `@media (max-height: 460px)` 段（首页 / 介绍页 / 剧目选择 / 图鉴 / 自定义卡片）；对话框与结算卡见 `main.css` 中排在 `.mumu-dlg-back` 之后那段、`extensions.css` 末尾的 `.mumu-finale*`，提示条单独放在 `.toast.show` 之后 |
| 场景渲染的懒加载与首屏体积 | `scripts/lazy-scene.js`（代理）+ `scripts/main.js`（`createLazySceneRenderer` 接线）；口径与数字见 `docs/perf-baseline.md` 第二轮 |
| 滑行药丸（首页右上 + 舞台右上两排：悬停编排 / 托板 / 进场揭开） | `scripts/glide-nav.js`（弹簧与墨层引擎，条目靠 `data-mg-item` 接管）、`styles/extensions.css`（`.mumu-glide*`，舞台那组的 token 在 `.mumu-glide.stage-top-right`）、`scripts/main.js`（`createGlideNav` / 遮罩点击后 `topGlide.playIntro` / `showScreen('stage')` 里的 `revealStageGlide`） |
| 存储键与读写 | `scripts/storage.js`（`mumu.scripts.v1`、`mumu.saves.v2`；旧 `mumu.saves.v1` 只读迁移）；图鉴 `mumu.gallery.v1` 见 `scripts/gallery-store.js`；自定义卡片 `mumu.customcards.v1` / `mumu.customcards.fx.v1` 见 `scripts/custom-cards-data.js` |
| 自动存档（首页「继续上次」） | `scripts/storage.js`（`mumu.autosave.v1` 的 `loadAutosave/saveAutosave/clearAutosave`）、`scripts/engine.js`（`onProgress` 停顿点）、`scripts/main.js`（`refreshResume` / `play` 开新程时清理） |
| 终幕结算卡（这一幕 / 一句台词 / 你的选择 / 获得卡牌） | `scripts/finale.js`（纯逻辑）、`scripts/engine.js`（`endOptions(script, summary)`、`lastLine`）、`scripts/main.js`（`renderFinale` / `clearFinale`）、`index.html#dlg-finale`、`styles/extensions.css`（`.mumu-finale*`） |
| 状态层（旗标/数值/结局标识/检查点） | `scripts/state.js`（纯逻辑单测在 `tests/state.test.mjs`）；引擎侧 `engine.state / setFlag / getFlag / setVar / getVar / rewind`（`rewind()` 逐级退回上一个选项，UI 入口属 P3-1） |
| 读档 / 回退后**特写道具**恢复 | `scripts/engine.js`（`propTextUpTo` 从快照位置回扫到最近 `scene` 节点取道具线索，`start()` 读档分支与 `rewind()` 里还原 `lastProp`）；单测 `tests/engine-state.test.mjs`，消费端在 `scripts/scene.js` / `scripts/prop.js` |
| 作品包导入导出（.mumu） | `scripts/package.js`（manifest 校验/迁移、导出、导入）、`scripts/zip.js`（ZIP 读写）、`scripts/serialize.js`（nodes→DSL 兜底）；字段表与限额见 `docs/mumu-package-spec.md`。导出/导入提示是**队列**，逐条显示，不会互相覆盖 |

## 5. 交付前自检清单

- [ ] `node serve.js` 正常启动，首页渲染、音乐可静音。
- [ ] 「开始体验」先打开环形剧本选择：默认居中漩涡（《星月夜》封面），左月光（乐谱）、
      右青绿（山水），再外一圈左「敬请期待」、右蝉鸣（黄昏），共 11 卡；
      拖动 / 滚轮 / ← → 或两侧「〈」「〉」切换，回车或点封面下方「开始体验」进入章节抽屉
      （点封面本身不进入）；占位卡只提示筹备中且无「开始体验」；
      关键词与左下角 AI 免责声明齐全；导入按钮先关选择层再开导入弹窗。
- [ ] 真实剧本 >10 部（内置 4 + 自定义 7）时回退原「选择剧本」陈列弹窗，卡片不丢、关键词仍在。
- [ ] 发言时名称下方出现身份小字；小悠真 / 小葵无身份；自定义剧本无内置身份。
- [ ] 对话框右上角「‹ 回退一句」：第一句隐藏；点一次退一屏、可连续后退；选项页回退收起选项、
      结束页回退收起结算卡；回退后再前进走的是新的后续（旧分支作废）。
- [ ] 舞台右上角「换个剧本」直接在剧情上打开完整剧目选择（默认居中漩涡，关闭文案「返回剧情」，
      关掉后回到原句、舞台没有退出）；「选章节」直接在当前曲目上打开章节抽屉
      （只留半透 veil + 右侧章节抽屉，舞台画面透在后面；不生成环形卡带、没有「导出整本」底栏、
      关闭文案「返回剧情」），选任一章节从该章重新开始；Esc 或点 veil 直接退回剧情、原句不变；
      844×390 与 812×375 下四章不用滚就能看全、关闭药丸右缘不越屏；
      首页 / 落幕结算卡进入选择层时关闭文案仍是「返回首页」；
      选择层打开时按回车 / 空格不会推进后台剧情；390 宽下四个按钮不溢出。
- [ ] 图鉴角色卡：深靛斜纹立式卡面，剪影完整不被卡框裁切，名字在左下、星点（实际颗数）在右下，
      身份只在详情里出现；桌面与手机详情都能完整看到立绘。
- [ ] 四部曲的第一章各先放自己的开场动画（蝉鸣 / 青绿 / 月光 / 漩涡）：标题约 6.2s（漩涡 7.2s）
      出现、下方「点击任意处开始剧本」清晰可读（青绿是亮底深字，靠白色光晕 + 白字缘，
      呼吸动画下限也要抬高）、右上「跳过动画」在 1440 / 390 宽都不溢出；标题前点击不打断，
      标题后点击 / 回车 / 空格、Esc 或跳过按钮都能进剧本，且首句是该曲的第一句；
      第二章起、自定义剧本、继续上次与读档不触发；「减少动态」下无需等待即可开演；控制台无报错。
- [ ] 开场动画的开头与结尾：点章节后**只建一次场**（控制台设 `window.__openPerf = []` 再看时间线，
      `size/curtain/paintUnder/spawn/go` 各出现一次，不重复）；揭幕到画面淡入之间画面是静止幕布而不是
      死机；生长第一帧起就是稳定帧率（空跑 `PRIME_FRAMES` + `holdUntil` 生效）；
      撤场时逐帧采样 `#home` 的 `aria-hidden`，**开场层消失之前绝不能出现首页**（舞台已画出像素才撤）。
- [ ] 章节结束页有「换一个剧本」；非末章有「继续下一章」，点击可接演下一章；末章不出现继续。
- [ ] 二十八张立绘可用：七张现代人物 + 六张国风模型 + 八位《漩涡与深蓝》人物 +
      七位《月光下的未完奏鸣》人物；白石葵仍为 `少女（2）`；
      新模型为无五官、无白色线稿的深紫黑剪影，无额外勾边。
- [ ] 无对话段落只显示场景（人物不上场）；录音旁白只出名字不出立绘。
- [ ] 单人 / 双人 / 三人 / 过肩 / 背影 各镜头构图正确，人物位于对话框两侧、不遮挡文字。
- [ ] 特写能出对应道具（长卷/令牌/木盒/研钵/磁带/耳机/纸张/旧照片/信纸等），
      木盒先合后开；同一段特写道具不突然消失。
- [ ] 蝉鸣：第一章三个选项分支、第二章两条路线、第三章幻影告别、第四章终章均可达结局。
- [ ] 青绿：第三章「隐瞒 / 坦诚」与第四章「舍弃 / 护画」四条分支均可到达各自后续与结局；
      火夜为火光色调，白日/黄昏/夜晚不串色；二十年后画尾红枫可出现。
- [ ] 漩涡：第一章命案现场与书房细节、第二章「父亲公司 / 后山神社」两条路线、
      第三章「公开真相 / 篡改报告」双结局均可到达；画库出现逆向《星月夜》，
      沙龙墙面与曲目卡封面使用原图；终章不出现「继续下一章」。
- [ ] 月光：四章共八组分支均可到达后续；旧琴房/音乐社/田径场/钟楼/草坪/写字楼/清吧/
      剧院前庭/老剧院场景与昼夜光影正确；特写能出手抄乐谱（叠印真实乐谱图）、小提琴、
      钢琴键盘、橘子汽水、素圈戒指；曲目卡封面使用 `pathetique-score.png`；
      第四章为终章，不出现「继续下一章」。
- [ ] 起居室与庄园外墙为分层细节（壁炉火焰、木框线脚、瓦垄、石砌缝、柏树），不出现平涂色块。
- [ ] 白石葵全程使用 `少女（2）` 立绘；月亮只出现在操场/神社室外夜景，室内夜戏（含丹青阁）不出现；
      第四章读信只出"白石葵（画外音）"，舞台上不出现她的立绘。
- [ ] 保存 → 刷新 → 读档续演位置正确；旧存档（缺 `actState`）可读。
- [ ] 游玩到一半刷新：首页出现「继续上次」，点击回到原句且场景 / 人物 / 旗标正确；
      走到本章结尾后入口消失；手动存档列表不受影响。
- [ ] 终章（四部曲的最后一章 / 单章自制剧本）结束页出现结算卡：这一幕（时间 · 场景）、
      最后一句台词、按顺序连接的选择、本轮获得的角色卡；非终章不出现结算卡，
      仍有「继续下一章」；点「重新开始」或离开舞台后结算卡消失。
- [ ] 第一章选「追问」：结尾前出现白石葵回响、过肩构图与黄昏操场插曲，再进夜晚结尾；
      选「假装没注意」：出现另一句回响与近景构图，无黄昏插曲；第三条选项分别出现纸张 / 磁带特写。
- [ ] 第一章选「追问」→「继续下一章」：第二章开场出现对应的跨章台词与过肩构图；选「假装没注意」则出现另一句与近景。
- [ ] 走到第二个选项前保存 → 刷新 → 读档 → 选另一个分支：先前旗标随检查点/快照回滚或恢复，条件台词正确切换。
- [ ] 剧本库 / 导入 弹窗正常，导入示例与新格式一致。
- [ ] 首页可下滑两屏：`#btn-intro`「项目介绍」与「下滑看项目介绍 ⌄」都平滑滚到 `#intro`，
      六张介绍卡齐全（演什么 / 怎么玩 / 怎么演 / 剧本怎么写 / 存档与音乐 / 图鉴与卡片）；
      1440×900 一屏装得下（`.intro-foot` 底边 ≤ 视口高），390×844 无横向溢出、标题不孤字换行；
      介绍页「开始体验」回顶部并打开剧目选择、「回到首页」回顶部；滚到介绍页后打开图鉴/选择层，
      悬浮层仍铺满视口、`#home` 的 scrollTop 不变；进剧情再回首页时 scrollTop 归零；
      「玩法与格式」弹窗已不存在（内容并入介绍页）。
- [ ] 首页右上功能组（滑行药丸）：静置时只剩一行淡字（轨道不铺玻璃底），指针进入某个按钮时
      一枚暖白药丸滑过去，药丸经过之处同一行字由浅转深（深色墨层被裁成药丸形状，不是淡入淡出换字）；
      行进中药丸被拽长、到位轻微回弹，按下整体压扁，离开整组后淡出；点「♪」静音时图标与墨层同步换成「✕」；
      首次点开场幕后功能组从右侧揭开、条目错峰淡入；Tab 聚焦时药丸加一圈描边；
      390 宽只剩五个图标且不溢出；减少动态时直接落位不回弹。
- [ ] 舞台右上功能组（同一套滑行药丸 + 暗色托板）：静置时四个条目（换个剧本 / 选章节 / 保存进度 / ♪）
      以奶白字排在托板上，左侧「← 返回首页」仍是原来的 chip；悬停时暖白药丸滑过去、经过之处文字换成墨色；
      托板必须在文字底下（`z-index:-1`）——白天场景（如《漩涡》第二章庄园外景）截图里若只剩一块空板、
      条目文字被糊掉，就是它盖到了文字上面；墨层与真按钮的字形框逐条量应为 0 偏移；
      点 ♪ 静音后墨层跟着换成「✕」且 `#stage-audio` 只有一个 id；本页第一次进舞台从右侧揭开一次，
      换章 / 读档再进舞台不重播（条目 opacity 直接是 1、轨道无 clip-path）；390 宽四个条目仍带文字、
      与左侧 chip 不重叠、右缘不越屏；「换个剧本」「选章节」盖在剧情上时药丸行为不变；控制台无报错。
- [ ] 角色图鉴：4 张典藏卡置顶且开局可用（星月夜 / Aeolian 七星，ᥫᩣo.O / 彼岸洛luo 六星；
      卡面左上不再显示“七星”标签）；通过内置章节能收到 2~3 张角色卡提示，
      同章重结算不重复发；四星只显示四颗实星；刷新后解锁状态仍在；详情为近黑展示台上的持续扫光；
      面板底栏有「剧本角色形象由AI生成，如有雷同，纯属巧合」。
- [ ] 图鉴「自定义卡片」页：标签页能切、懒加载只建一次，在自定义页按 Esc 先回角色图鉴、再按 Esc 才关；
      「＋ 新增卡片」「上传图片」和每卡的「换图 / 删除（两步确认，3.5s 自动还原）」都能用，
      第 13 张只出「最多 12 张 · 先删掉几张吧」；上传透明底 PNG 与不透明 JPG 各一张，
      透明底走 contain 完整显示、不透明走铺满；卡面名称/身份可就地改（Enter 保存、Esc 还原）；
      面板恰好 12 项且标注「只作用于下方的自定义卡片」，星星颗数下拉只有 1–5 颗、
      点第 5 颗星能到 5 星且永远不会出现第 6 颗；刷新后卡与参数还在（超限则降级为无图卡 + 中文提示）；
      **把 12 项全拖过一遍再回「角色图鉴」页，内置卡与典藏卡的卡面必须一模一样**
      （星点仍是 `<span>` 静态、7 星卡还是 7 颗、圆角/花纹/视差都不跟着变）；390 宽下面板不溢出、
      卡片区两列、按钮不重叠，控制台无报错、无 404。
- [ ] 自定义卡「单独检视」：点卡面本体进全屏近黑展示台（大卡 + 扫光 + 倾斜/陀螺仪），
      底部 `‹ 1 / N ›` 能前后翻、到头尾会循环，只有 1 张时不出现翻页；
      在检视里点第 5 颗星 → 大卡立刻亮 5 颗、退出后列表那张也是 5 颗、localStorage 里也是 5；
      点换图/删除/正在编辑的文字不会误开检视；✕ 或 Esc 退回卡片区且焦点回到原卡，
      再按 Esc 才退回「角色图鉴」页；内置卡详情仍然没有翻页条、星点仍是静态 `<span>`、`--pc-radius` 为空/0；
      390×844 下大卡、翻页条、✕ 都不溢出，控制台无报错。
- [ ] 导出内置曲目为 .mumu → 再导入 → 可正常播放；坏包导入有中文报错且不污染作品库。
- [ ] **横屏移动端**：844×390 与 812×375 下首页主视觉不被顶边裁掉、项目介绍不横向溢出、
      剧目选择「开始体验」与居中封面/标题/底栏互不压叠、图鉴典藏卡与角色名加免责声明都在一屏内、
      自定义卡片 12 项面板可滚到最后一项、存档弹窗装得下；
      **剧情屏对话框只占视口 18–38%**（旁白 ≤23%、选项 ≤38%），人物下半身与特写道具不被板子压住；
      **终章结算卡整张在屏内**（落幕文案 + 结算卡 + 横排三颗结束按钮，`.dialogue` 的
      `clientHeight == scrollHeight`，不需要滚动），轻提示「获得角色卡…」挂在顶栏下方且不压住按钮；
      390×844 竖屏出现「请横屏体验」，点「仍以竖屏继续」后 `window.__mumu.rotate.shown` 为 false 且页面可正常玩；
      转回横屏提示自动消失。1440×900 桌面外观与改动前一致（`.dialogue` 仍是 `bottom:40px`、
      `padding:26px 32px 30px`、字号 17px、结束按钮竖排满宽）。
- [ ] **移动端全屏 ⛶**：844×390 与 812×375 剧情页右上多一颗 `#stage-fullscreen`（右缘不越屏、
      不压「← 返回首页」），点一下调用顺序是 `requestFullscreen → orientation.lock`（打桩验），
      按钮变 `aria-pressed="true"` + `.is-on` 暖圈、title 换成「退出全屏（横屏已锁定）」；
      再点顺序是 `unlock → exit`；模拟浏览器自行撤全屏会补一句「已退出全屏，横屏锁定已解除。」；
      390×844 竖屏顶栏**不出现** ⛶，「请横屏体验」面板顶部出现暖色主按钮「全屏并锁定横屏」，
      点它成功后面板撤掉、`mumu.rotate.dismiss` 写入 sessionStorage，失败就地显示
      `.mumu-rotate__note` 而不是靠 toast；1440×900 桌面该按钮 `display:none`、
      右上仍是「换个剧本 / 选章节 / 保存进度 / ♪」四颗且托板宽度不变。
- [ ] 首屏仍是 0 图片请求、`scene.js`/`prop.js` 不在首屏导入图内（改完复跑
      `node tools/perf-baseline.cjs --runs=3 --stage`，与 `docs/perf-baseline.md` 第二轮对比）。
- [ ] 控制台无错误、无 404。
