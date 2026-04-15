/**
 * tldraw-cli 前端入口组件。
 * 挂载 tldraw 画布 + RuntimeMount（WebSocket 连接 Host）。
 * 支持通过 URL query param `wsUrl` 覆盖默认 WebSocket 地址（E2E 测试用）。
 */
import { Tldraw } from 'tldraw'
import { RuntimeMount } from './runtime/RuntimeMount'

function App() {
	const wsUrl = typeof window !== 'undefined'
		? new URLSearchParams(window.location.search).get('wsUrl') ?? undefined
		: undefined
	return (
		<div style={{ position: 'fixed', inset: 0 }}>
			<Tldraw persistenceKey="tldraw-cli">
				<RuntimeMount wsUrl={wsUrl} />
			</Tldraw>
		</div>
	)
}

export default App
