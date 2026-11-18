# Liuyao

六十四卦六爻占断网站项目。目前处于确定性排盘引擎阶段。

## 当前能力

- 三枚铜钱、模拟铜钱和手动录入的统一数据结构
- 本卦、变卦、动爻和六十四卦映射
- 八宫、世应、纳甲、五行、六亲、六神和旬空
- 按 IANA 时区计算日辰
- 以精确交节时刻计算月建
- 版本化 TypeScript 类型和 JSON Schema
- 起卦前只确认会改变取用神或判断路径的关键信息
- 默认单次直接深断，并以程序事实账本约束排盘硬事实
- 保留结构化占断与有限纠错重试，作为审计和 A/B 实验通道
- 固定卦盘、确认事实、摘要和近期消息组成的多轮咨询上下文

React 网页已接通邀请注册、登录、问事、模拟/手动起卦、完整卦盘、AI 问题确认、直接解读和同卦追问，并支持历史恢复。支付尚未开放。运行方法见 [网页运行说明](./docs/web-foundation.md) 和 [AI 接入说明](./docs/web-ai.md)。

## 打开网页（无需 Docker）

```bash
npm ci
npm run web:local
```

打开终端里打印的「网页：」地址，默认是 `http://localhost:5173`。如果 5173（或 API 用的 3000）已被其它程序占用，会自动往后找空闲端口并打印出来（跳过 5174，那是界面预览用的）；也可以用环境变量固定，例如 `WEB_PORT=5180 API_PORT=3010 npm run web:local`。一次性邀请码在 `logs/web-local/invitation.txt`，用于网页注册；本地数据保存在 `logs/web-local/database`，重启后保留。此模式仅监听本机，不能用于公开运营。重新启动时，如果旧邀请码已用或过期，会生成新的邀请码。

## 本地验证

```bash
npm install
npm run check
npm test
```

## DeepSeek 对话原型

复制 `.env.example` 为 `.env`，仅在本地填写：

```text
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-v4-flash
```

启动：

```bash
npm run chat
```

原型支持问题边界确认、模拟或手动起卦、完整排盘、程序派生的术理事实账本、单次直接深断，以及围绕同一卦盘继续追问。默认回答不再先压缩成结构化 JSON，而是让模型在硬事实边界内完成完整推演；结构化流水线仍保留给审计与 A/B 实验。当前不会把咨询持久保存到数据库。

首轮采用“结论完整、探索不闭合”的对话策略：先把核心判断和最强卦象链讲清楚，不一次耗尽所有次级信息；结尾只提供由本卦具体矛盾产生的深挖入口，不重复询问起卦前已经确认的事实。

每次运行会在 `logs/sessions/` 生成一份本地 JSONL 日志，包含起卦前问题确认、对话、卦盘、直接占断、事实审查结果和 API 遥测。API 遥测记录模型、阶段、耗时、HTTP 状态、结束原因、缓存与 token 用量，但不会记录 API Key、Authorization 请求头或完整底层 Prompt。日志含私人占问内容，已默认排除 Git，请勿公开上传。

DeepSeek 默认开启思考模式、`high` 思考强度和流式输出。可以在 `.env` 调整：

```text
DEEPSEEK_THINKING=enabled
DEEPSEEK_REASONING_EFFORT=low|high|max
DEEPSEEK_STREAM=true
LIUYAO_LOG_MODE=diagnostic|compact|off
```

- `diagnostic`：保存完整会话、卦盘和 API 返回的 `reasoning_content`，适合当前调试，数据量与隐私风险最高。
- `compact`：只保存调用指标、校验失败与会话状态，不保存对话正文和推理全文。
- `off`：不创建会话日志，适合明确不需要留存的环境。

流式输出能显示模型仍在推理或生成，但 API 不提供可靠的“完成百分比”，因此界面展示的是实时活动与正文增量，不伪造百分比进度。

分析最新一次会话的 API 调用：

```bash
npm run logs:summary
```

也可以分析指定日志：

```bash
npm run logs:summary -- logs/sessions/你的日志.jsonl
```

## 主要文档

- [产品需求 v0.1](./docs/product-requirements-v0.1.md)
- [六爻排盘规则 v0.1](./docs/liuyao-chart-rules-v0.1.md)

## 目录

```text
schemas/        JSON Schema
src/calendar/   历法适配器
src/domain/     六爻领域类型、基础数据和排盘引擎
tests/          自动化测试与黄金案例
Skill/liuyao/   完整六爻占断 Skill、分层参考规则与行为评测
Skill/meihua/   梅花易数（三数法）解读 Skill
Skill/qiuqian/  关帝百签解读 Skill
Skill/jiaobei/  掷筊解读 Skill
Skill/shared/   梅花、求签、掷筊共用的表达与安全边界
```
