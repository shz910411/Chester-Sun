# 迈思美后端 (maisimei-backend)

迈思美轻体小程序后端。**NestJS + PostgreSQL**，Docker 部署，与服务器现有系统**严格隔离**。

## 严格隔离（与现有 Docker 系统互不影响）

- 独立网络 `maisimei-net`，与现有容器互不可见
- 只对外暴露**一个端口 8090**（避开现有占用的全部端口）
- 数据库**不暴露端口**，只在内部网络可达
- 资源**硬上限**：API ≤ 1 核 / 1G 内存，DB ≤ 0.5 核 / 512M —— 满载也不抢光资源
- 独立数据卷 `maisimei-pgdata`，全部命名带 `maisimei-` 前缀
- 一条 `docker compose down` 即可整套移除，服务器恢复原样

## 部署（在服务器 `/opt/maisimei`）

```bash
# 1. 获取代码到 /opt/maisimei（git clone 或上传解压）
cd /opt/maisimei

# 2. 配置环境变量（密码/密钥只在这里，不进 Git）
cp .env.example .env
vi .env          # 填 DB_PASSWORD / JWT_SECRET / WX_APPSECRET / DASHSCOPE_API_KEY / SEED_ADMIN_PASSWORD

# 3. 一键起服务（首次会自动构建、建表、建后台管理员）
docker compose up -d --build

# 4. 验证
curl http://localhost:8090/api/admin/login -X POST   # 通即正常
```

小程序后端域名（备案后）反代到 `127.0.0.1:8090` 即可。

## 运维

| 操作 | 命令 |
|---|---|
| 看日志 | `docker compose logs -f maisimei-api` |
| 重启 | `docker compose restart maisimei-api` |
| 更新代码 | `git pull && docker compose up -d --build` |
| 停止 | `docker compose down`（数据保留在卷里） |
| 彻底移除 | `docker compose down -v`（含数据卷） |
| 数据库备份 | `docker compose exec maisimei-db pg_dump -U maisimei maisimei > backup_$(date +%F).sql` |

## API 概览（前缀 `/api`）

| 模块 | 端点 |
|---|---|
| 登录/建档 | `POST /auth/login`、`GET·PUT /me/profile`、`POST·DELETE /me/consents` |
| 称重 | `POST /weights`、`GET /weights?range` |
| 餐食/AI | `POST /meals`、`POST /meals/:id/analyze`、`PUT /meals/:id/items`、`POST /labels/parse` |
| 每日 | `PUT /me/daily-log` |
| 汇总 | `GET /me/daily`、`/me/summary`、`/me/weight-compare`、`/me/daily-report`、`/me/share-card` |
| 阶段 | `POST·GET /me/stages`、`GET /me/stage-compare`、`POST·GET /me/reports` |
| 共享(加好友) | `POST /shares/invite`、`POST /shares/claim`、`GET /me/shares`、`DELETE /shares/:id` |
| 服务视图 | `GET /service/owners`、`/service/owners/:id/daily`、`PUT …/day-mark`、`POST …/notes` |
| 后台 | `POST /admin/login`、`GET /admin/users`、`PUT /admin/users/:id/advisor`、`GET /admin/export.csv` |

## 合规护栏（代码层强制）

- 用户可见层 / AI 输出 / 自动小结 全部经 `compliance.ts` 过滤：「减脂/瘦/燃脂」→「轻体」，去除「超标/不健康/治疗」等
- AI 只输出食物事实，绝不出医疗/减肥建议；能量标"估算"
- 生化报告/舌诊只存储、**系统不做任何医疗解读**
- 服务视图：平等无层级、行级权限校验、手机号脱敏、只读无导出
