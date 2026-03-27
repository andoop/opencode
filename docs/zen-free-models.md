# OpenCode Zen 免费模型使用指南

## 概述

OpenCode Zen 是一个 AI 网关，地址为 `https://opencode.ai/zen/v1`。无需注册或 API key，使用 `"public"` 作为 key 即可匿名调用所有免费模型。

## 免费模型列表

| 模型 ID                      | 说明                      |
| ---------------------------- | ------------------------- |
| `big-pickle`                 | Stealth 模型              |
| `gpt-5-nano`                 | OpenAI GPT-5 Nano         |
| `grok-code`                  | xAI 编程模型              |
| `minimax-m2.1-free`          | MiniMax M2.1 免费版       |
| `minimax-m2.5-free`          | MiniMax M2.5 免费版       |
| `glm-4.7-free`               | 智谱 GLM 4.7 免费版       |
| `glm-5-free`                 | 智谱 GLM 5 免费版         |
| `kimi-k2.5-free`             | Moonshot Kimi K2.5 免费版 |
| `trinity-large-preview-free` | Trinity Large 预览版      |

> 模型列表可能随时间变化，最新数据来源：https://models.dev/api.json（查看 `opencode` provider 下 `cost.input === 0` 的模型）

## API 端点

| 端点                              | 格式                 | 认证方式                       |
| --------------------------------- | -------------------- | ------------------------------ |
| `/zen/v1/chat/completions`        | OpenAI 兼容          | `Authorization: Bearer public` |
| `/zen/v1/messages`                | Anthropic            | `x-api-key: public`            |
| `/zen/v1/responses`               | OpenAI Responses API | `Authorization: Bearer public` |
| `/zen/v1/models/<model>:<action>` | Google Gemini        | `x-goog-api-key: public`       |

## curl 示例（每个免费模型）

### 1. big-pickle

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "big-pickle",
    "messages": [{"role": "user", "content": "Hello! Tell me a fun fact."}],
    "stream": false
  }'
```

### 2. gpt-5-nano

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "gpt-5-nano",
    "messages": [{"role": "user", "content": "用一句话解释什么是量子计算"}],
    "stream": false
  }'
```

### 3. grok-code

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "grok-code",
    "messages": [{"role": "user", "content": "Write a Python function to check if a number is prime."}],
    "stream": false
  }'
```

### 4. minimax-m2.1-free

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "minimax-m2.1-free",
    "messages": [{"role": "user", "content": "请用中文介绍一下你自己"}],
    "stream": false
  }'
```

### 5. minimax-m2.5-free

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "minimax-m2.5-free",
    "messages": [{"role": "user", "content": "帮我写一个快速排序的 JavaScript 实现"}],
    "stream": false
  }'
```

### 6. glm-4.7-free

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "glm-4.7-free",
    "messages": [{"role": "user", "content": "解释一下 TCP 三次握手的过程"}],
    "stream": false
  }'
```

### 7. glm-5-free

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "glm-5-free",
    "messages": [{"role": "user", "content": "什么是 Transformer 架构？"}],
    "stream": false
  }'
```

### 8. kimi-k2.5-free

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "kimi-k2.5-free",
    "messages": [{"role": "user", "content": "写一首关于编程的短诗"}],
    "stream": false
  }'
```

### 9. trinity-large-preview-free

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "trinity-large-preview-free",
    "messages": [{"role": "user", "content": "Explain the difference between REST and GraphQL."}],
    "stream": false
  }'
```

### 流式调用示例（以 big-pickle 为例）

将任意上述 curl 中的 `"stream": false` 改为 `"stream": true` 即可开启流式输出：

```bash
curl -X POST https://opencode.ai/zen/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer public" \
  -d '{
    "model": "big-pickle",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

### Anthropic 格式示例（以 big-pickle 为例）

```bash
curl -X POST https://opencode.ai/zen/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: public" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "big-pickle",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

## 在代码中使用（OpenAI SDK 兼容）

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://opencode.ai/zen/v1",
    api_key="public",
)

response = client.chat.completions.create(
    model="big-pickle",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)
```

```typescript
import OpenAI from "openai"

const client = new OpenAI({
  baseURL: "https://opencode.ai/zen/v1",
  apiKey: "public",
})

const response = await client.chat.completions.create({
  model: "big-pickle",
  messages: [{ role: "user", content: "Hello!" }],
})
console.log(response.choices[0].message.content)
```

## 原理

1. `opencode` provider 检测到无 API key 时，过滤掉所有 `cost.input !== 0` 的模型，只保留免费模型
2. 使用 `apiKey: "public"` 发起请求
3. 服务端收到 `"public"` key 后，若模型标记了 `allowAnonymous`，则允许匿名访问，计费类型为 `"anonymous"`

相关源码：

- 客户端过滤逻辑：`packages/opencode/src/provider/provider.ts` (L102-122)
- 服务端认证逻辑：`packages/console/app/src/routes/zen/util/handler.ts` (L400-404)
- 模型数据来源：https://models.dev/api.json (`opencode` provider)

## 查询最新免费模型

```bash
curl -s https://models.dev/api.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for mid, m in data.get('opencode', {}).get('models', {}).items():
    cost = m.get('cost', {})
    if cost.get('input', 1) == 0 and cost.get('output', 1) == 0:
        print(f'  {mid}')
"
```
