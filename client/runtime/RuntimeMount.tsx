/**
 * RuntimeMount React 组件。
 *
 * 挂载到 tldraw 画布页面后，负责：
 *   1. 创建 TldrawRuntimeAdapter 并将其绑定到当前 Editor 实例
 *   2. 创建 RuntimeWsClient，建立与 Host 的 WebSocket 连接
 *   3. 根据连接状态在页面顶部显示悬浮横幅（connecting / disconnected / shutdown）
 *   4. 连接成功后横幅消失，不影响画布操作
 *
 * 组件卸载时自动关闭 WebSocket 连接，避免泄漏。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, useToasts } from 'tldraw'
import { RuntimeWsClient } from './RuntimeWsClient'
import { TldrawRuntimeAdapter } from './TldrawRuntimeAdapter'
import { DEFAULT_WS_URL } from '../../shared/defaults'
/** 本 Runtime 支持的全部 RPC 方法，握手时上报给 Host */
const SUPPORTED_METHODS = [
	'canvas.list',
	'canvas.snapshot',
	'canvas.diff',
	'canvas.create',
	'canvas.select',
	'canvas.getSelection',
	'command.apply',
	'command.undo',
	'command.redo',
]

/** WebSocket 连接的四种状态 */
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'shutdown'

/**
 * Runtime 挂载点组件。
 * 在 tldraw App 内部挂载，通过 useEditor 获取 Editor 实例。
 * wsUrl 默认为 shared/defaults 中定义的地址，可通过 props 覆盖（测试用）。
 */
export function RuntimeMount({ wsUrl = DEFAULT_WS_URL }: { wsUrl?: string }) {
	const editor = useEditor()
	const { addToast } = useToasts()
	const [state, setState] = useState<ConnectionState>('connecting')
	const clientRef = useRef<RuntimeWsClient | null>(null)
	// 用 ref 持有 addToast，避免因 tldraw store 变化导致 addToast 引用变化时重启 RuntimeWsClient
	const addToastRef = useRef(addToast)
	addToastRef.current = addToast

	useEffect(() => {
		// 暴露 editor 到 window，供 E2E 测试用 page.evaluate() 访问
		;(window as any).__tldraw_editor = editor
		const adapter = new TldrawRuntimeAdapter(editor)
		const client = new RuntimeWsClient({
			url: wsUrl,
			adapter,
			methods: SUPPORTED_METHODS,
			sessionId: crypto.randomUUID(),
			onReady: () => {
				setState('connected')
				addToastRef.current({
					title: 'Host 已连接',
					description: '画布已准备就绪，可以通过 CLI 操作。',
					severity: 'success',
				})
			},
			onError: () => {
				setState((prev) => (prev === 'connected' || prev === 'shutdown' ? prev : 'disconnected'))
			},
			onDisconnected: () => {
				setState((prev) => (prev === 'shutdown' ? 'shutdown' : 'disconnected'))
			},
			onShutdown: (reason) => {
				setState('shutdown')
				addToastRef.current({
					title: 'Host 已停止',
					description: `画布进入只读状态（${reason}）。请手动关闭此标签。`,
					severity: 'info',
					keepOpen: true,
				})
			},
		})
		clientRef.current = client
		return () => {
			client.close()
			clientRef.current = null
			;(window as any).__tldraw_editor = undefined
		}
	}, [editor, wsUrl])

	const handleReconnect = useCallback(() => {
		clientRef.current?.reconnect()
		setState('connecting')
	}, [])

	/** 已连接时不渲染任何内容，避免遮挡画布 */
	if (state === 'connected') return null

	return <ConnectionBanner state={state} onReconnect={handleReconnect} />
}

/**
 * 连接状态悬浮横幅。
 * connecting：橙色圆点，提示"正在连接"
 * disconnected：红色圆点，显示"重连"按钮
 * shutdown：灰色圆点，提示手动关闭标签（不可重连）
 */
function ConnectionBanner({
	state,
	onReconnect,
}: {
	state: ConnectionState
	onReconnect: () => void
}) {
	const label =
		state === 'connecting' ? '正在连接 Host...' :
		state === 'disconnected' ? '未连接 Host' :
		'Host 已停止'

	return (
		<div style={bannerStyle}>
			<span style={dotStyle(state)} />
			<span>{label}</span>
			{state === 'disconnected' && (
				<button onClick={onReconnect} style={buttonStyle}>
					重连
				</button>
			)}
			{state === 'shutdown' && (
				<span style={{ opacity: 0.7, fontSize: 12 }}>请手动关闭标签</span>
			)}
		</div>
	)
}

const bannerStyle: React.CSSProperties = {
	position: 'fixed',
	top: 8,
	left: '50%',
	transform: 'translateX(-50%)',
	zIndex: 99999,
	display: 'flex',
	alignItems: 'center',
	gap: 8,
	padding: '6px 16px',
	borderRadius: 8,
	background: 'rgba(0,0,0,0.82)',
	color: '#fff',
	fontSize: 13,
	fontFamily: 'system-ui, sans-serif',
	boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
}

/** 根据连接状态返回状态圆点的颜色样式 */
function dotStyle(state: ConnectionState): React.CSSProperties {
	const color =
		state === 'connecting' ? '#f5a623' :
		state === 'disconnected' ? '#e74c3c' :
		'#999'
	return {
		width: 8,
		height: 8,
		borderRadius: '50%',
		background: color,
		flexShrink: 0,
	}
}

const buttonStyle: React.CSSProperties = {
	background: 'rgba(255,255,255,0.15)',
	border: '1px solid rgba(255,255,255,0.3)',
	borderRadius: 4,
	color: '#fff',
	fontSize: 12,
	padding: '2px 10px',
	cursor: 'pointer',
}
