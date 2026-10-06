# 微信公众号

WujieHOT 的生产环境不抓内网地址，也不能稳定打开微信文章页。公众号走第三方项目 [zlzchat](https://github.com/565800105/zlzchat)：用微信读书账号订阅公众号，它给出 Atom；本仓库的脚本再把文章推进站点。

上游以 git submodule 放在 `third_party/zlzchat`，这里不改它的代码。

## 准备

```bash
git submodule update --init third_party/zlzchat
cp integrations/wechat-rss/.env.example integrations/wechat-rss/.env
```

`.env` 里换成自己的数据库口令和 Redis 口令。第一次启动前，把 `third_party/zlzchat/resources/application.yml` 里的 Druid 监控页关掉，不要沿用安装包里的默认口令。

```bash
docker compose -f integrations/wechat-rss/docker-compose.yml --env-file integrations/wechat-rss/.env up -d
```

管理页在 `http://127.0.0.1:10082`。登录后到微信读书里扫码，再搜索并订阅公众号。当前接入的是「具身智能之心」「具身纪元」「天南具身公园」。

订阅后，Atom 地址是 `/feedAtom/<feedId>`。把 feedId 填进 `push.mjs` 里的 `FEEDS`。

## 推进站点

站点根目录的 `.env` 要有 `INGEST_TOKEN`。这三个信源在 `industry/sources.json` 里已经是 `external`，参与方式是 `editorial`。

```bash
node integrations/wechat-rss/push.mjs
```

脚本每次每个号取最新 8 篇。Atom 里没有正文，脚本会再打开微信文章页，把正文放进 `bodyText`。建议每 3 小时跑一次。

zlzchat 只负责订阅和出 Atom。文章进不进精选，仍由 WujieHOT 的评分决定。
