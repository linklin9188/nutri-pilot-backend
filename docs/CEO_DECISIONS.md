# CEO_DECISIONS.md — Standing Decision Queue

> 立项：2026-05-21 HKT
> 用途：CEO 端不让决策积压；任何 ≥ 5 分钟内不能拍的决策立即写入此文件 + 标 deadline。
> 起因：2026-05-21 UI 越界事件 — CEO 决策积压 4 件，导致 Lead 出于善意代列清单，造成角色倒挂。
> 详见：`_bridge/PROCESS.md §15` 铁律 1-3。

---

## 规则

1. **何时写入**：任何决策超过 5 分钟未拍 → 立即写入此文件
2. **deadline 必填**：每条决策标 `BY: <HKT 时间>`
3. **悬空 ≥ 2 件警报**：CEO 一旦此 list 同时存 2 件 pending → **停止接收新工单**，先清空决策
4. **每完成一个部门工单后第一动作**：扫此文件清空已可拍的决策
5. **决策落定即归档**：删除 pending 条目，追加到下方 ARCHIVED 段并写决策 + 时间

---

## PENDING

(空)

---

## ARCHIVED

### 2026-05-21 HKT 19:46-20:00 — UI 越界事件触发的 4 件积压清算

| 决策 | 落定 | 时间 HKT |
|---|---|---|
| Q0 4 张真餐桌摄影图 review | **保留不动** — 边际优化（q0_family 摆盘 / 1.3MB H5 / elderly vibe）β 不阻塞 | 2026-05-21 19:46 |
| Algorithm 012 axis 37 seafood_style 派不派 | **派**（一行 patch 等同 011，低风险） | 2026-05-21 19:46 |
| ALGO_VERSION v48→v49 bump | **bump**（跟 012 合并一票，让用户拿到 011+012 双修复） | 2026-05-21 19:46 |
| docs/SKILLS.md + docs/LESSONS.md dump | **CEO 自写**，不让 UI 代笔 | 2026-05-21 19:50 |

落定执行：Algorithm 012 工单已 ship（commits 42c6d7d + d7d1a9a），axis 37 命中率 9.7%→15.6%，v49 让全用户立即拿到 011+012 双修复。
