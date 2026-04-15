# 选区工作流（Observe-Select-Act）

人机协作迭代工作流：LLM 画粗版 → 用户在浏览器框选局部 → LLM 只改选中的图形。

> 返回 [SKILL.md](../SKILL.md) | 其他参考：[命令详解](command-details.md) · [RPC 方法](rpc-methods.md)

## 工作流概述

```
LLM 画初稿
    ↓
用户在浏览器拖选需要调整的图形（框选 / Shift 点选均可）
    ↓
LLM 调用 canvas get-selection 读取选区
    ↓
shapeIds 为空 → 提示用户先框选    shapeIds 非空 → 只修改选中图形
    ↓                                  ↓
等待用户框选后重试               command apply update-shape / delete-shape
```

## 完整 Bash 示例

```bash
# ── 阶段一：LLM 画初稿 ──────────────────────────────────────────────
tldraw-cli command apply <<'JSON'
{"commands":[
  {"kind":"create-geo-shape","geo":"rectangle","x":0,"y":0,"w":200,"h":100,"text":"登录"},
  {"kind":"create-geo-shape","geo":"rectangle","x":300,"y":0,"w":200,"h":100,"text":"首页"},
  {"kind":"create-geo-shape","geo":"rectangle","x":600,"y":0,"w":200,"h":100,"text":"设置"}
]}
JSON

# ── 阶段二：等待用户在浏览器框选（LLM 此时无需操作）───────────────────

# ── 阶段三：读取选区 ────────────────────────────────────────────────
SEL=$(tldraw-cli canvas get-selection)
export SEL

# 检查选区是否为空
COUNT=$(node -p "JSON.parse(process.env.SEL).shapeIds.length")
if [ "$COUNT" -eq 0 ]; then
  echo '请先在浏览器中框选要修改的图形，然后重新运行。'
  exit 0
fi

# ── 阶段四：只修改选中图形 ─────────────────────────────────────────
# 例：把选中的图形全部改为蓝色 + 加 "已审阅" 后缀
node -e "
  const sel = JSON.parse(process.env.SEL);
  const snap = JSON.parse(require('child_process').execSync('tldraw-cli canvas snapshot').toString());
  const cmds = sel.shapeIds.map(id => {
    const shape = snap.shapes.find(s => s.shapeId === id);
    return {
      kind: 'update-shape',
      shapeId: id,
      color: 'blue',
      text: (shape?.text ?? '') + ' ✓'
    };
  });
  console.log(JSON.stringify({commands: cmds}));
" | tldraw-cli command apply
```

## 边界情况

| 情况 | 现象 | 建议处理 |
|------|------|---------|
| 用户未选中任何图形 | `shapeIds: []` | 提示用户框选后再重试，不要静默跳过 |
| 用户选中了不在当前画布的图形 | `shapeIds` 中含其他 page 的 id | `command apply` 会返回 `1007 shapeId 不存在`，提示用户切换到对应画布后重试 |
| 用户选区在 `get-selection` 调用后又变更 | `shapeIds` 反映的是调用时刻的选区 | 用 `--canvas` 固定目标画布，修改前再 snapshot 确认 shape 仍存在 |
| 选中 frame 内的子 shape | `shapeIds` 直接包含子 shape id（不含父 frame） | `update-shape` 对子 shape 生效，不影响 frame 本身 |

## 只读约定

`canvas.getSelection` 只读：读取浏览器当前状态，不设置、不清除选区。

选区的创建和清除是用户行为，CLI 没有也不应有 `canvas.setSelection`（这是当前版本的明确产品决定）。LLM 需要引导用户手动框选，而不是通过代码强制修改选区。

## 与 Observe-Act 循环的关系

Observe-Select-Act 是 Observe-Act 的增强变体：

- **Observe-Act**：LLM 读全量 snapshot → 决策 → 改全部或按坐标/文字筛选
- **Observe-Select-Act**：用户人工标记关注区域 → LLM 只处理标记范围，精度更高、副作用更小

两者可以组合：先 snapshot 建立状态基线，再 get-selection 缩小操作范围。
