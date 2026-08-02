# ADC V2 — svc-workflow 研发交付控制台

## 目录定位

| 路径 | 定位 |
|---|---|
| `../agent-dev-center` | **ADC V1（RETIRED）** — 旧数据和旧功能来源，不再提供服务 |
| `.` | **ADC V2** — 研发交付只读入口，当前正式项目 |

## 产品边界

ADC V2 是 `svc-workflow` 面向研发交付场景的极简控制台。当前只开放 **只读链路**：

- **Worklist** — 待我处理 / 我的草稿
- **Detail** — 研发事项详情

写操作（Create / Submit / Advance / Return / Terminate）链路尚在建设中。

ADC V2 **不拥有** Requirement 数据库、Task、Report、Review、Project、Comment、Postmortem、Marketplace、Goals、Identity、Service Registry、本地工作流状态机、Prisma 业务表。

新研发事项直接等于 `svc-workflow WorkflowInstance`。

## 技术栈

- **后端**: Node.js 22+, TypeScript, Express, Zod
- **前端**: React 18+, TypeScript, Ant Design, React Router
- **工作流**: svc-workflow (HTTP API 唯一权威)
- **认证**: Auth-Service OBO（见下方认证说明）
- **数据库**: 无本地业务数据库

## 认证说明

当前认证模式为 **Auth-Service OBO Token Exchange**：

1. **调用方 Token**：`aud=adc-v2`，`scope=adc.read`
   - 浏览器持有用户 JWT（由 auth-service 签发）
   - ADC V2 Backend 从 `Authorization` header 提取并验证 JWT
   - 验证签名、受众（`aud=adc-v2`）、范围（`scope=adc.read`）
2. **OBO Token 交换**：ADC V2 使用 incoming JWT 向 auth-service 交换 OBO Token
   - OBO Token：`aud=svc-workflow`，`scope=workflow.read`
   - 交换过程：POST `/api/auth/token` 携带 `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
3. **调用 svc-workflow**：ADC V2 使用 OBO Token 发起 HTTP 请求
   - Actor 身份由 OBO Token 中的 `sub` 声明决定
   - svc-workflow 验证 JWT 后方处理请求

全程 OBO 交换，ADC V2 不作为直接 Bearer Proxy。

## 组件架构

```
Browser ── JWT (aud=adc-v2, scope=adc.read) ──→ ADC V2 Backend
                                                    │
                                                    ▼
                                          auth-service (OBO exchange)
                                                    │
                                                    ▼
                                          OBO Token (aud=svc-workflow, scope=workflow.read)
                                                    │
                                                    ▼
                                          svc-workflow (HTTP API)
```

## 快速开始

### 前提

- Node.js >= 22
- svc-workflow 服务
- auth-service（用于 OBO Token 交换）

### 后端

```bash
cd backend
cp ../.env.example .env
# 编辑 .env 配置（需配置 auth-service 和 svc-workflow 端点）
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
3. **OBO Token 交换** — ADC V2 不直接传递用户 Token，始终通过 auth-service 交换
4. **明确失败** — svc-workflow 或 auth-service 不可用时明确报错，不回退到旧 ADC
5. **Idempotency-Key** — 写操作强制幂等（写操作链路尚在建设中）
