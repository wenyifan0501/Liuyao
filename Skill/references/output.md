# 输出契约

## 1. 两阶段输出

本文件仅用于可选的结构化审计实验。正式用户对话默认按 `direct-reading.md` 直接生成，不先经过本契约。

结构化阶段不追求命理师语气；用户文本阶段不得添加结构化结果中不存在的新结论。

## 2. 结构化结果

输出对象至少包含：

```json
{
  "analysisVersion": "liuyao-interpretation-v0.2",
  "chartId": "chart-id-from-system",
  "chartRuleVersion": "liuyao-chart-v0.1",
  "question": {
    "topic": "career",
    "normalizedQuestion": "下周的面试能否获得录用机会",
    "timeWindow": "下周"
  },
  "anchors": {
    "selfLine": 3,
    "responseLine": 6,
    "primaryUsefulGod": {
      "relative": "officials",
      "line": 4,
      "reason": "所问核心是职位录用"
    },
    "usefulGodCandidates": [],
    "secondaryAnchors": []
  },
  "evidence": [
    {
      "source": "line | month | day | change | context",
      "line": 4,
      "factIds": ["line.4.identity"],
      "effect": "supporting | weakening | ambiguous",
      "fact": "四爻官鬼发动",
      "reason": ""
    }
  ],
  "decision": {
    "coreDilemma": "用户表面问题背后的真实取舍",
    "directAnswer": "先直接回应用户应该如何选择",
    "preferredOption": "当前更倾向的选项",
    "alternativeTradeoff": "为什么暂时不优先另一选项",
    "personalizedSignals": ["改变判断的用户特有背景"],
    "reversalConditions": ["出现什么新事实时应改变结论"]
  },
  "judgment": {
    "tendency": "favorable | mixed_favorable | neutral_uncertain | mixed_unfavorable | unfavorable",
    "summary": "",
    "conditions": [],
    "confidence": "low | medium | high",
    "uncertainties": []
  },
  "timingCandidates": [
    {
      "window": "",
      "basis": "",
      "certainty": "low | medium"
    }
  ],
  "actionAdvice": [],
  "nextQuestion": {
    "prompt": "一个容易回答、能显著改变下一轮判断的问题",
    "purpose": "这个回答将区分哪两条解释路径",
    "choices": []
  },
  "safetyNotes": []
}
```

## 3. 校验要求

程序必须拒绝以下结果：

- `chartId` 与本次输入卦盘不一致。
- `chartRuleVersion` 与输入卦盘不一致。
- `selfLine`、`responseLine` 与卦盘不一致。
- 引用了 1 至 6 之外的爻位。
- 指定爻位上的六亲与卦盘不一致。
- 将不存在的动爻写成变化依据。
- 卦盘证据没有引用 `computedFacts` 中存在的事实 ID。
- 输出了受控枚举之外的倾向或置信度。
- 用户没有时间问题，却无依据生成精确应期。

## 4. 用户可见结构

默认按以下顺序生成：

1. **先回应困惑**：复述真正的两难，并直接给出当前倾向。
2. **为什么不是另一边**：说明取舍、代价和反转条件。
3. **卦盘依据**：只展开最关键的两至四项事实，不写流水账。
4. **现实落点**：结合用户特有背景给出可验证的动作或观察指标。
5. **继续聊一个问题**：只问一个容易回答且会改变后续判断的问题；合适时提供二至四个选项。
6. **风险提示**：仅在主题需要时加入。

用户明确要求简短版时，可缩减细节，但仍需保留卦象、总断、至少一项依据和必要风险提示。

## 5. 追问输出

追问应直接回答当前问题，并说明所引用的原卦证据。不重复整份首轮报告，也不重新生成总断。

追问不是事实采集问卷。优先问能暴露真实取舍、改变解释路径的问题；不要连续询问用户难以知道的日期、他人内心或尚未公开的信息。

如果新背景改变了解释，应使用类似表达：

> 这条新信息不会改变原卦，但会改变对应爻的现实指向，因此上一轮关于某项阻力的解释需要收窄为……

不得声称卦盘本身因用户反馈而变化。
