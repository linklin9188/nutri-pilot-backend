# 自动开工设置 — Setup 5 步

> **目的**：派单后，**桌面会弹通知**告诉你"X 部门收到新单"，
> 你只要切到那个 tab 敲一下回车（任何字都行），Lead 就自动开工。
> 不用每次手敲 `process telepot`。

---

## ⚠️ 先看这条 — 不是完全零操作

Claude Code 官方钩子能力有限制：派单后通知会弹出，但**钩子本身不能替你敲字**。
你还是要：

1. 看到通知 → 切到对应 Warp tab
2. 在那个 tab 里敲**任何一个字符 + 回车**（例如 `go` 或直接回车）
3. Lead 看到提示自动跑 `process telepot`

比之前少 1 步（不用记"是哪个部门"+ 不用手敲全词）。**完全零操作目前做不到**——官方就不支持。

---

## 5 步 setup

### 步骤 1：打开 UI tab 跑一行命令

在 UI 的 Warp tab 里敲：

```bash
cd /Users/jianjiao/Desktop/nutri-pilot_测试版
export DEPT=ui
bash scripts/setup-filechanged-hook.sh
```

看到这一行 = 装好：

```
✅ ui FileChanged hook installed and verified
```

如果看到 `❌` → 按提示修。

---

### 步骤 2：在 UI tab 启动 Claude Code

**还是这个 tab，DEPT 还在**：

```bash
claude
```

启动后**不要关 tab**。这个 tab 的 Claude 现在只对 `_bridge/telepot_ui.md` 的变化反应。

---

### 步骤 3：Backend tab 重复

新开 / 切到 Backend 的 Warp tab，敲：

```bash
cd /Users/jianjiao/Desktop/nutri-pilot_测试版
export DEPT=backend
bash scripts/setup-filechanged-hook.sh
claude
```

看到 `✅ backend FileChanged hook installed and verified` = 装好。

---

### 步骤 4：Algorithm tab 重复

```bash
cd /Users/jianjiao/Desktop/nutri-pilot_测试版
export DEPT=algorithm
bash scripts/setup-filechanged-hook.sh
claude
```

---

### 步骤 5：Database tab 重复

```bash
cd /Users/jianjiao/Desktop/nutri-pilot_测试版
export DEPT=database
bash scripts/setup-filechanged-hook.sh
claude
```

---

## 测试是否真生效

让 CEO 派一个测试单（任意 dept 都行）。你会看到：

1. **macOS 右上角弹通知**（带声音 Submarine），写着 `📨 New ticket on telepot_<dept>.md`
2. 切到那个 dept 的 Warp tab
3. 敲 `go` + 回车（或任何字）
4. Lead 自动 dump → 跑 `process telepot` 流程

如果没弹通知：

- 看 `/tmp/nutri-pilot-hook-audit.log`（每次钩子被触发都会写一行，搜 FIRED / SKIP / no_dept）
- 检查 `echo $DEPT` 是不是空的（如果 tab 被你重启过，DEPT 会丢，要 re-export）
- 检查 macOS "系统设置 → 通知" 里 Warp / Terminal / Script Editor 通知权限是否打开

---

## 关掉自动通知（如果你要安静）

只是 unset DEPT 就行：

```bash
unset DEPT
```

那个 tab 的 hook 会立刻 silent-skip 所有 telepot 文件变化（其他 tab 不受影响）。

---

## 它在做什么 — 1 段技术解释（看一眼就行）

- `.claude/settings.json` 注册 FileChanged hook，监听 4 个 `_bridge/telepot_<dept>.md`
- 任何一个文件改动 → 4 个 tab 的 Claude 都收到 hook 事件
- 但 `scripts/hooks/on-telepot-changed.cjs` 检查 `$DEPT` env，**只有 dept 匹配的 tab 真响应**
- 响应方式：(a) macOS osascript 弹通知 (b) JSON `additionalContext` 给 Claude 下一回合
- Claude 自己的 Edit/Write 不会触发 hook（官方文档明说 — 不会无限循环）

---

## 故障排除速查

| 现象 | 可能原因 | 怎么办 |
|---|---|---|
| 派单后没弹通知 | DEPT 没设 / 跑了 claude 之后才 export | 退出 claude → re-export DEPT → 重启 claude |
| 弹了但 Claude 不开工 | additionalContext 是"提示"不是"强制" | 在那个 tab 敲 `go` 触发下一回合 |
| 4 个 tab 全都弹通知 | DEPT 都一样 / 或都没设 | 检查每个 tab 的 `echo $DEPT` 是不同的 |
| 自动改文件也弹通知 | 不应该 — Claude 自己改不触发 | 看 audit log，可能是外部脚本改的 |

---

由 UI 部门 setup 一次性，老板永久受益。问题找 UI Lead。
