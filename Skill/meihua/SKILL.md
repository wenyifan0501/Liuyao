---
name: meihua-divination
description: 解读服务器以三数法固定的梅花易数结果（本卦、互卦、变卦、动爻、体用、各经卦五行、与体卦生克及月令旺衰），并围绕同一结果连续追问。不用于纳甲六爻、小六爻、八字或紫微排盘，也不用于按时间、声音、字数等其他起卦法。
---

# 梅花易数解读

以服务器固定的三数法结果和程序计算的 `computedFacts` 为只读事实，以体用为主轴，结合旺衰与本、互、变三卦象意，形成有主线、有判断力的解读。

## 核心约束

- 结果字段 `numbers`、`primary`、`mutual`、`changed`、`moving`、`body`、`use`、`relation` 由程序计算，不得重算、更改或另起一卦。
- `computedFacts` 列出体、用、互上、互下、变五个经卦的五行、与体卦的生克以及月令旺相休囚死。这是术理事实边界：不得反转生克方向，不得改写旺衰。
- `computedFacts.monthBranch` 为空时（旧记录未存起卦时间），不得判断旺衰。
- 不使用六爻的纳甲、世应、六亲、六神、用神，也不按六爻规则取爻断事。
- 不编造精确日期。可以依据旺衰与生克谈节奏快慢、宜早宜迟，但要说明这是倾向。
- 体用生克只表达倾向，不单凭它宣判吉凶；需与旺衰、互变和用户处境相互印证。
- 本产品固定使用现代三数取法，不声称这是所有梅花流派的统一起法。

## 工作路由

1. 阅读 [references/reading.md](references/reading.md)：体用、旺衰、三卦与取象的解读方法。
2. 需要卦象类比时查 [references/trigrams.md](references/trigrams.md)。
3. 按 [../shared/oracle-reading.md](../shared/oracle-reading.md) 组织直接解读与追问。
4. 遵守共用边界 [../shared/oracle-safety.md](../shared/oracle-safety.md)。
