# 赛博木鱼账号与排行榜

前端保持单文件原生 JavaScript,根目录 `index.html` 可由 GitHub Pages 托管。服务端是 JavaScript Cloudflare Worker,D1 保存账号、会话、每日计数和幂等记录;不使用 React 或 Vue。Node.js 仅用于本地构建与测试,生产服务运行于 Workers。

## 功能

- 账号(3–20 位字母、数字或下划线)、游戏名、密码注册及登录。
- bcrypt cost 12 密码哈希;随机 256 位会话令牌,数据库只保存令牌的 SHA-256 摘要;会话有效期 30 天。
- 今日榜、总榜、个人排名;榜单只对登录玩家开放,返回游戏名和次数,不返回密码信息。
- 今日榜使用北京时间。登录后新增敲击计入云端,旧本地累计不导入。
- 每三秒批量同步;每批上限 120,唯一请求 ID 保证重试幂等;未发送成功的批次留在当前浏览器,两天内可重传,日期以服务器接收日为准。
- 每用户以每秒 20 次补充计数额度、最大突发额度 200;登录和注册有 IP/账号级限流。这是轻量防刷,不是严格防机器人系统。
- 游客、本地奖励、成就、运势保持原有行为。本地重置不删除云端排名。
- 此版本不提供邮件验证或密码找回,界面明确提醒用户记好账号密码。

## 验证

在 backend 目录:

```sh
npm ci
npm test
npm run build
```

测试使用真实 SQLite 执行 Drizzle 迁移与 Worker 逻辑,并使用 jsdom 验证前端注册、同步重试、榜单游戏名转义、退出登录和会话过期。它们不是线上端到端测试,也不代表手机浏览器验证。

迁移位于 `drizzle/`。已应用的迁移不得修改;后续通过 `npm run db:generate` 生成新的迁移。

## 部署(2026-09-12 更新)

部署方式有两种:**GitHub Actions 自动部署(推荐)** 与 **本地脚本手动部署**。两条路径都要在 Cloudflare 上有账号与 API token。

### 一次性准备工作

1. **注册 Cloudflare**(<https://dash.cloudflare.com/sign-up>),登录后右上角点 My Profile → API Tokens → Create Token → 选 "Edit Cloudflare Workers" 模板 → 拷贝生成的 token。
2. 在 Workers 页面右侧栏记下 **Account ID**。
3. 在 GitHub 仓库 `liukelly1993-ship-it/cyber-mokugyo` 的 Settings → Secrets and variables → Actions 里:
   - `CLOUDFLARE_API_TOKEN` = 刚才的 token
   - `CLOUDFLARE_ACCOUNT_ID` = Account ID

### 方式 A:GitHub Actions(推荐,合并 main 即自动部署)

`.github/workflows/deploy-backend.yml` 已就位。任何对 `backend/**` 的 push 或合并 PR 到 `main` 都会触发:

1. 安装 npm 依赖
2. 创建或复用 D1 数据库 `cyber-mokugyo`
3. 跑 schema 迁移
4. 跑 `npm test`
5. 部署 Worker
6. 命中 `/api/health` 验证

成功后,合并 PR 即可让 GitHub Pages 同步拉取新版本。

### 方式 B:本地手动部署

```sh
export CLOUDFLARE_API_TOKEN=xxx
export CLOUDFLARE_ACCOUNT_ID=yyy
npm run deploy
```

脚本会输出 Worker URL,把仓库根目录 `index.html` 第 46 行附近的 `const API='…';` 改为该 URL 后 `git add index.html && git commit && git push` 即可。GitHub Pages ~1 分钟内自动发布。

## CORS

Worker 端只接受 `Origin: https://liukelly1993-ship-it.github.io`。本地或手机调试可临时改 `src/worker.js` 的 `ORIGIN` 常量。
