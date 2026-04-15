// cli/__tests__/sessionFile.test.ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	readSessionFile, writeSessionFile, clearSessionFile, type SessionFile,
} from '../hostClient/sessionFile'

describe('sessionFile', () => {
	let dir: string
	let path: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'tldraw-cli-'))
		path = join(dir, 'session.json')
	})
	afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

	it('read returns null when missing', () => {
		expect(readSessionFile(path)).toBeNull()
	})

	it('write + read round trip', () => {
		const s: SessionFile = { hostPid: 123, httpPort: 8787, wsPort: 8788, startedAt: Date.now() }
		writeSessionFile(path, s)
		const r = readSessionFile(path)
		expect(r?.hostPid).toBe(123)
	})

	it('clear removes file', () => {
		writeSessionFile(path, { hostPid: 1, httpPort: 1, wsPort: 1, startedAt: 0 })
		clearSessionFile(path)
		expect(readSessionFile(path)).toBeNull()
	})
})
