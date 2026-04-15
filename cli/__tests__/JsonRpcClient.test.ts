// cli/__tests__/JsonRpcClient.test.ts
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonRpcClient, JsonRpcError } from '../hostClient/JsonRpcClient'

describe('JsonRpcClient', () => {
	let server: ReturnType<typeof createServer>
	let url: string

	beforeEach(async () => {
		server = createServer((req, res) => {
			const chunks: Buffer[] = []
			req.on('data', (c) => chunks.push(c as Buffer))
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
				res.writeHead(200, { 'content-type': 'application/json' })
				if (body.method === 'ok.one') {
					res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { echoed: body.params } }))
				} else {
					res.end(JSON.stringify({
						jsonrpc: '2.0', id: body.id,
						error: { code: -32601, message: 'Method not found' },
					}))
				}
			})
		})
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
		const addr = server.address() as AddressInfo
		url = `http://127.0.0.1:${addr.port}/rpc`
	})

	afterEach(async () => {
		await new Promise<void>((r) => server.close(() => r()))
	})

	it('returns result on success', async () => {
		const c = new JsonRpcClient(url)
		expect(await c.call('ok.one', { x: 1 })).toEqual({ echoed: { x: 1 } })
	})

	it('throws JsonRpcError on server error', async () => {
		const c = new JsonRpcClient(url)
		await expect(c.call('bad', {})).rejects.toBeInstanceOf(JsonRpcError)
	})

	it('throws on non-loopback URL host', () => {
		expect(() => new JsonRpcClient('http://example.com/rpc')).toThrow(/loopback/)
	})
})
