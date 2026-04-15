# 布局规则

LLM 画图时遵守以下规则，画完按以下规则自行核查。

---

## 规则 1：网格对齐

**规则**：所有 shape 的 x/y 坐标对齐到 20px 网格（`x % 20 === 0 && y % 20 === 0`）。

**自检**：检查所有 shape 的 x 和 y 值是否均为 20 的整数倍。如有不满足的 shape，调整坐标至最近的 20 整数倍值。

**出处**：CRAP·Alignment 原则（Williams 2015）；Müller-Brockmann 网格系统（1961）——视觉对齐降低认知摩擦。

---

## 规则 2：水平间距 ≥ 100

**规则**：水平 arrow 绑定的两端节点，x 方向中心距（center-to-center）≥ 100。

**自检**：对每条水平方向的 arrow，计算起点节点和终点节点的 x 中心坐标之差的绝对值，若 < 100，向外移动节点拉大间距至 ≥ 100。

**出处**：Gestalt·Proximity（Wertheimer 1923）——间距传递分组语义；项目实测：< 100px 时节点在 1280px 显示器上视觉粘连。

---

## 规则 3：垂直间距 ≥ 80

**规则**：垂直 arrow 绑定的两端节点，y 方向中心距（center-to-center）≥ 80。

**自检**：对每条垂直方向的 arrow，计算起点节点和终点节点的 y 中心坐标之差的绝对值，若 < 80，向外移动节点拉大间距至 ≥ 80。

**出处**：Gestalt·Proximity（同上）；项目实测：垂直密度比水平高，80px 在常规流程图场景下视觉分离充分。

---

## 规则 4：同类节点尺寸一致

**规则**：同一 `geo` 类型（如全部 `rectangle` 或全部 `ellipse`）的 shape，宽度和高度必须相同（对应同一 geo 类型内 `w` 的极差 ≤ 0、`h` 的极差 ≤ 0；即所有同类 shape 的 w/h 完全一致）。

**自检**：按 geo 类型分组，检查每组内所有 shape 的 w 和 h 是否完全一致。如有不一致，统一为该组的目标尺寸。

**出处**：CRAP·Repetition（Williams 2015）——重复视觉元素建立一致性；Gestalt·Similarity（Wertheimer 1923）——相同尺寸加强同类分组感知。

---

## 规则 5：主流程方向一致

**规则**：表示主流程的箭头方向必须一致，优先左→右或上→下，同一图中不能混用（即不允许左→右与右→左混合出现在主流程中，上→下与下→上同理）。

**自检**：检查所有主流程箭头的起点和终点坐标，确认方向统一。若存在方向冲突，调整节点位置或箭头连接使方向一致。

**出处**：Gestalt·Continuity（Wertheimer 1923）——连续方向引导视线；Sugiyama 1981（Sugiyama et al., "Methods for Visual Understanding of Hierarchical System Structures"）——分层有向图的标准绘制策略。

---

## 规则 6：反向流视觉 dashed + grey

**规则**：确实需要表达的反向流（回路、异常路径、补偿链路），箭头样式必须同时设置 `dash: 'dashed'` 和颜色 `color: 'grey'`，与主流程箭头形成视觉区分。

**自检**：检查所有 `dash="dashed"` 的 arrow 是否同时设置了 `color="grey"`，以及所有 `color="grey"` 的 arrow 是否同时设置了 `dash="dashed"`。两者必须成对出现。

**出处**：CRAP·Contrast（Williams 2015）——对比度使差异立即可见；Tufte·Data-Ink ratio（Tufte 1983）——用最少视觉墨水传递最大信息区分度。

> **UML 图豁免**：此规则**不适用于 UML 图中 dashed 箭头承载语义的场景**。典型例子：
> - **类图**：`dash="dashed"` 表示"实现"（Realization）或"依赖"（Dependency），是 UML 符号约定，与反向流无关。
> - **时序图**：响应消息（return message）用 `dash="dashed"` 表示异步/返回语义，同样不是"反向数据流"。
>
> 在上述场景中应按 UML 语义决定箭头样式，不受本规则约束。参见 `diagram-recipes.md` 各图类型的符号速查表。

---

## 参考资料

1. Williams, R. (2015). *The Non-Designer's Design Book* (4th ed.). Peachpit Press. — CRAP 原则（Contrast / Repetition / Alignment / Proximity）来源。
2. Müller-Brockmann, J. (1961). *Grid Systems in Graphic Design*. Niggli Verlag. — 网格系统理论基础。
3. Wertheimer, M. (1923). "Untersuchungen zur Lehre von der Gestalt II." *Psychologische Forschung*, 4, 301–350. — Gestalt 完形原则（Proximity / Similarity / Continuity）原始论文。
4. Sugiyama, K., Tagawa, S., & Toda, M. (1981). "Methods for Visual Understanding of Hierarchical System Structures." *IEEE Transactions on Systems, Man, and Cybernetics*, 11(2), 109–125. — 分层有向图绘制算法，主流程方向规则依据。
5. Tufte, E. R. (1983). *The Visual Display of Quantitative Information*. Graphics Press. — Data-Ink ratio 原则，反向流最小化视觉噪声的理论依据。
6. ISO/IEC 19505-1:2012 (UML 2.x). — 类图中 dashed 箭头的 UML 语义标准，规则 6 类图豁免依据。
7. 项目实测数据（`tldraw-cli` Spike #2，demo canvas `page:MH5r5yYbfxWgWfVfpkd_7`）. — 水平间距 ≥ 100px、垂直间距 ≥ 80px 的实测来源。
