import { describe, expect, it } from 'vitest';
import { icons, remote_icons } from './index.js';

describe('mcp icons', () => {
	it('keeps remote_icons lightweight without inline data URIs', () => {
		expect(remote_icons.length).toBeGreaterThan(0);
		for (const icon of remote_icons) {
			expect(icon.src.startsWith('https://')).toBe(true);
		}
	});

	it('retains the inline data URI on server icons for local stdio clients', () => {
		expect(icons.some((icon) => icon.src.startsWith('data:image/png;base64,'))).toBe(true);
		expect(icons.length).toBeGreaterThan(remote_icons.length);
	});
});
