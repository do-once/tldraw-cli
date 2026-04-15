# tlschema 反射入口 Spike 结论

## 实际生效的键名

| 预想键名 | 实际键名 |
|---|---|
| `DefaultArrowheadStartStyle` | `ArrowShapeArrowheadStartStyle` |
| `DefaultGeoStyle` | `GeoShapeGeoStyle` |

`generate-tldraw-enums.ts` 的 `styleDefs` 已使用实际键名。

## 遍历入口

- `defaultShapeSchemas`：取得各 shape 类型的 schema
- `getShapePropKeysByStyle(schema.props)`：从 schema props 反射样式 key

当前 codegen 直接按键名访问 `@tldraw/tlschema` 导出对象，未走 `defaultShapeSchemas` 遍历。

## 升级指引

升级 `@tldraw/tlschema` 后若键名再变，在以下路径 grep 可找到实际命名：

```
node_modules/@tldraw/tlschema/dist-cjs/index.d.ts
```

搜索模式：`StyleProp<` 或 `EnumStyleProp<`，匹配到的导出名即为可用键。
