# ADC V2 — svc-workflow 研发交付控制台

## 目录定位

| 路径 | 定位 |
|---|---|
| `/Users/yanfenma/workspace/project/agent-dev-center` | **Legacy ADC 主仓库** — 旧数据和旧功能来源，后续迁移与只读归档对象 |
| `/Users/yanfenma/workspace/project/agent-dev-center-worktrees/adc-v2-stage1` | **Stage 1 技术 PoC 与证据** — 真实链路验证，可选复用的代码来源，不是最终 V2 项目 |
| `/Users/yanfenma/workspace/project/adc-v2` | **全新正式 ADC V2 项目** — 未来开发、审计、部署和上线的正式项目 |

## 产品边界

ADC V2 是 `svc-workflow` 面向研发交付场景的极简控制台，只提供：

- **Worklist** — 待我处理 / 我的草稿
- **Create** — 新建研发事项
- **Detail** — 研发事项详情
- **Timeline** — 不可变事件时间线
- **Submit / Advance / Return / Terminate** — 工作流动作

ADC V2 **不拥有** Requirement 数据库、Task、Report、Review、Project、Comment、Postmortem、Marketplace、Goals、Identity、Service Registry、本地工作流状态机、Prisma 业务表。

新研发事项直接等于 `svc-workflow WorkflowInstance`。

## 技术栈

- **后端**: Node.js 22+, TypeScript, Express, Zod
- **前端**: React 18+, TypeScript, Ant Design, React Router
- **工作流**: svc-workflow (HTTP API 唯一权威)
- **认证**: Direct Bearer Token Proxy（见下方认证说明）
- **数据库**: 无本地业务数据库

## 认证说明

当前认证模式为 **Direct Bearer Token Proxy**：

1. Browser 持有用户的 JWT Bearer Token
2. ADC V2 Backend 从 `Authorization` header 提取 Token
3. Token 被**原样转发**给 svc-workflow
4. svc-workflow 验证 JWT 签名、声明（`sub`、`workflow.read` scope 等）
5. Actor 身份完全由 svc-workflow 验证后的 JWT `sub` 决定

**ADC 不执行 OBO token 交换。** 当前方案仅适合开发 / 受控 Canary 环境：

- Token 存储在浏览器 `localStorage`
- 无自动过期刷新
- 无正式 OAuth/OIDC 登录流程
- 正式多人 / 生产认证尚未完成（需 OBO + JWKS 或等价方案）

## 快速开始

### 前提

- Node.js >= 22
- svc-workflow 服务（`main@4084c280f79a4cef5cf3122142635b61ec0d2dfb`）

### 后端

```bash
cd backend
cp ../.env.example .env
# 编辑 .env 配置
npm install
npm run dev:v2
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 测试

```bash
cd backend
npm test
```

### Smoke

```bash
cd backend
npm run smoke:svc-workflow-client
```

## 设计原则

1. **svc-workflow 是唯一权威** — ADC V2 不维护本地业务状态
2. **无 Prisma / 无本地数据库** — 所有状态来自 svc-workflow
3. **pass-through 架构** — ADC V2 不做 Actor 决策，只透传 Bearer Token
4. **明确失败** — svc-workflow 不可用时明确报错，不回退到旧 ADC
5. **Idempotency-Key** — 写操作强制幂等
