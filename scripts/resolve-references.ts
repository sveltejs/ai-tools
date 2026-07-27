import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
	options: {
		file: { type: 'string', short: 'f' },
		repo: { type: 'string', short: 'r' },
		output: { type: 'string', short: 'o' },
	},
});

const { file, repo, output } = values;

if (!file || !repo || !output) {
	console.error(
		'Usage: resolve-references --file <path-or-content> --repo <repo> --output <folder>',
	);
	process.exit(1);
}

export function remove_llm_ignore_blocks(content: string): string {
	return content.replace(/<!--\s*llm-ignore-start\s*-->[\s\S]*?<!--\s*llm-ignore-end\s*-->/g, '');
}

/**
 * Determines whether the input string is a file path or raw markdown content.
 * If it's a file, reads and returns its content. Otherwise returns the string as-is.
 */
async function get_content(input: string) {
	try {
		const stat = await fs.stat(input);
		if (stat.isFile()) {
			return await fs.readFile(input, 'utf-8');
		}
	} catch {
		// not a file path — treat as raw content
	}
	return input;
}

/**
 * Extracts a section from markdown content based on a heading id (hash).
 * Finds the heading whose text (lowercased, spaces replaced with `-`) matches
 * the hash and returns everything from that heading up to the next heading of
 * the same or higher level.
 */
function extract_section(content: string, hash: string) {
	const lines = content.split('\n');
	let start_index = -1;
	let heading_level = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const heading_match = line.match(/^(#{1,6})\s+(.+)/);
		if (!heading_match) continue;

		const level = heading_match[1]!.length;
		const text = heading_match[2]!;
		const slug = text.toLowerCase().replace(/\s+/g, '-');

		if (slug === hash.toLowerCase()) {
			start_index = i;
			heading_level = level;
			continue;
		}

		if (start_index !== -1 && level <= heading_level) {
			return lines.slice(start_index, i).join('\n').trim();
		}
	}

	if (start_index !== -1) {
		return lines.slice(start_index).join('\n').trim();
	}

	return content;
}

/**
 * Removes the `title`, `skill`, and `NOTE` fields from markdown frontmatter, if present.
 * Removes the entire frontmatter block if they were the only fields.
 */
function remove_frontmatter_unneeded_fields(content: string) {
	const frontmatter_match = content.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!frontmatter_match) return content;

	const frontmatter = frontmatter_match[1]!;
	const lines = frontmatter.split('\n').filter((line) => !line.match(/^(title|skill|NOTE)\s*:/));

	if (lines.length === 0) {
		// frontmatter is now empty — remove the whole block
		return content.slice(frontmatter_match[0].length);
	}

	return `---\n${lines.join('\n')}\n---\n` + content.slice(frontmatter_match[0].length);
}

/**
 * Derives a file-safe name from a URL path segment.
 * e.g. "some/deep/path" -> "path"
 */
function derive_name(link: string) {
	const without_hash = link.split('#')[0]!;
	const segments = without_hash.split('/').filter(Boolean);
	const name = segments[segments.length - 1] ?? 'reference';
	const safe_name = name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return safe_name || 'reference';
}

/**
 * Makes links copied into reference files point back to their pages on svelte.dev.
 */
export function resolve_reference_links(content: string, repo: string) {
	return content.replace(
		/\[([^\]]*)\]\((?![a-z][a-z\d+.-]*:|#|\/\/)([^)]+)\)/gi,
		(full_match, text: string, href: string) => {
			const url = new URL(
				href.startsWith('/')
					? `https://svelte.dev${href}`
					: `https://svelte.dev/docs/${repo}/${href}`,
			);
			url.pathname += '/llms.txt';

			return `[${text}](${url})`;
		},
	);
}

const content = remove_llm_ignore_blocks(
	remove_frontmatter_unneeded_fields(await get_content(file)),
);

// Match markdown links that are either:
// 1. Relative paths (not starting with http://, https://, mailto:, #, or /)
// 2. Absolute /docs/ paths (e.g. /docs/svelte/each)
const relative_link_regex = /\[([^\]]*)\]\((?!https?:\/\/|mailto:|#|\/)([^)]+)\)/g;
const docs_link_regex = /\[([^\]]*)\]\((\/docs\/[^)]+)\)/g;

interface Link_Info {
	full_match: string;
	text: string;
	href: string;
	hash: string | undefined;
	clean_path: string;
	is_absolute_docs: boolean;
}

const links: Link_Info[] = [];

let match;
while ((match = relative_link_regex.exec(content)) !== null) {
	const href = match[2]!;
	const hash_index = href.indexOf('#');
	const has_hash = hash_index !== -1;

	links.push({
		full_match: match[0],
		text: match[1]!,
		href,
		hash: has_hash ? href.slice(hash_index + 1) : undefined,
		clean_path: has_hash ? href.slice(0, hash_index) : href,
		is_absolute_docs: false,
	});
}

while ((match = docs_link_regex.exec(content)) !== null) {
	const href = match[2]!;
	const hash_index = href.indexOf('#');
	const has_hash = hash_index !== -1;

	links.push({
		full_match: match[0],
		text: match[1]!,
		href,
		hash: has_hash ? href.slice(hash_index + 1) : undefined,
		clean_path: has_hash ? href.slice(0, hash_index) : href,
		is_absolute_docs: true,
	});
}

if (links.length === 0) {
	console.log('No relative links found in the markdown.');
	process.exit(0);
}

console.log(`Found ${links.length} relative link(s) to resolve.`);

const references_dir = path.join(output, 'references');
await fs.mkdir(references_dir, { recursive: true });

let updated_content = content;

// Track names we've already used to avoid collisions
const used_names = new Map<string, number>();

for (const link of links) {
	const base_name = derive_name(link.clean_path);
	const count = used_names.get(base_name) ?? 0;
	used_names.set(base_name, count + 1);
	const name = count > 0 ? `${base_name}-${count}` : base_name;

	// For absolute /docs/ links, fetch directly from svelte.dev (supports cross-repo links).
	// For relative links, prepend /docs/{repo}/.
	const url = link.is_absolute_docs
		? `https://svelte.dev${link.clean_path}/llms.txt`
		: `https://svelte.dev/docs/${repo}/${link.clean_path}/llms.txt`;

	console.log(`Fetching: ${url}${link.hash ? ` (section: #${link.hash})` : ''}`);

	try {
		const response = await fetch(url);

		if (!response.ok) {
			console.warn(`  Warning: ${response.status} ${response.statusText} for ${url}`);
			continue;
		}

		let fetched_content = await response.text();

		if (link.hash) {
			fetched_content = extract_section(fetched_content, link.hash);
		}

		const ref_filename = `${name}.md`;
		const ref_path = path.join(references_dir, ref_filename);
		const reference_repo = link.is_absolute_docs ? link.clean_path.split('/')[2]! : repo;
		const reference_content = resolve_reference_links(
			remove_llm_ignore_blocks(remove_cut_preambles(fetched_content)),
			reference_repo,
		);

		await fs.writeFile(ref_path, reference_content);
		console.log(`  Saved: references/${ref_filename}`);

		// Replace the link in the markdown
		const new_link = `[${link.text}](references/${ref_filename})`;
		updated_content = updated_content.replace(link.full_match, new_link);
	} catch (error) {
		console.warn(`  Error fetching ${url}:`, error);
	}
}

/**
 * In fenced code blocks, removes everything from the start of the block
 * up to and including a `// ---cut---` comment. If no such comment exists
 * the code block is left unchanged.
 */
function remove_cut_preambles(content: string) {
	const lines = content.split('\n');
	const result: string[] = [];
	let in_code_block = false;
	let code_block_buffer: string[] = [];
	let fence_line = '';

	for (const line of lines) {
		if (!in_code_block && line.match(/^```\w*$/)) {
			in_code_block = true;
			fence_line = line;
			code_block_buffer = [];
			continue;
		}

		if (in_code_block && line.match(/^```$/)) {
			// End of code block — check if there was a cut comment
			const cut_index = code_block_buffer.findIndex((l) => l.match(/^\s*\/\/\s*---cut---\s*$/));

			result.push(fence_line);
			if (cut_index !== -1) {
				result.push(...code_block_buffer.slice(cut_index + 1));
			} else {
				result.push(...code_block_buffer);
			}
			result.push(line);

			in_code_block = false;
			code_block_buffer = [];
			continue;
		}

		if (in_code_block) {
			code_block_buffer.push(line);
		} else {
			result.push(line);
		}
	}

	// If file ends mid-code-block, flush as-is
	if (in_code_block) {
		result.push(fence_line);
		result.push(...code_block_buffer);
	}

	return result.join('\n');
}

// Write the updated markdown content to the output folder
updated_content = remove_cut_preambles(updated_content);

const output_filename = path.join(output, 'SKILL.md');
await fs.writeFile(output_filename, updated_content);
console.log(`\nUpdated markdown written to: ${output_filename}`);
