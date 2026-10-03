#!/usr/bin/env node
import 'dotenv/config';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { get_sections } from '../src/mcp/utils.ts';
import { AnthropicProvider } from '../src/lib/anthropic.ts';
import { type AnthropicBatchRequest, type SummaryData } from '../src/lib/schemas.ts';

const current_filename = fileURLToPath(import.meta.url);
const current_dirname = path.dirname(current_filename);

const USE_CASES_PROMPT = `
You are tasked with analyzing Svelte 5 and SvelteKit documentation pages to identify when they would be useful.

Your task:
1. Read the documentation page content provided
2. Identify the main use cases, scenarios, or queries where this documentation would be relevant
3. Create a VERY SHORT, comma-separated list of use cases (maximum 200 characters total)
4. Think about what a developer might be trying to build or accomplish when they need this documentation

Guidelines:
- Focus on WHEN this documentation would be needed, not WHAT it contains
- Consider specific project types (e.g., "e-commerce site", "blog", "dashboard", "social media app")
- Consider specific features (e.g., "authentication", "forms", "data fetching", "animations")
- Consider specific components (e.g., "slider", "modal", "dropdown", "card")
- Consider development stages (e.g., "project setup", "deployment", "testing", "migration")
- Use "always" for fundamental concepts that apply to virtually all Svelte projects
- Be concise but specific
- Use lowercase
- Separate multiple use cases with commas

Examples of good use_cases:
- "always, any svelte project, core reactivity"
- "authentication, login systems, user management"
- "e-commerce, product listings, shopping carts"
- "forms, user input, data submission"
- "deployment, production builds, hosting setup"
- "animation, transitions, interactive ui"
- "routing, navigation, multi-page apps"
- "blog, content sites, markdown rendering"

Requirements:
- Maximum 200 characters (including spaces and commas)
- Lowercase only
- Comma-separated list of use cases
- Focus on WHEN/WHY someone would need this, not what it is
- Be specific about project types, features, or components when applicable
- Use "always" sparingly, only for truly universal concepts
- Do not include quotes or special formatting in your response
- Respond with ONLY the use cases text, no additional text

Here is the documentation page content to analyze:

`;

async function fetch_section_content(url: string) {
	const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}
	return await response.text();
}

async function main() {
	console.log('🚀 Starting use cases generation...');

	// Check for API key
	const api_key = process.env.ANTHROPIC_API_KEY;
	if (!api_key) {
		console.error('❌ Error: ANTHROPIC_API_KEY environment variable is required');
		console.error('Please set it in packages/mcp-server/.env file or export it:');
		console.error('export ANTHROPIC_API_KEY=your_api_key_here');
		process.exit(1);
	}

	// Get all sections
	console.log('📚 Fetching documentation sections...');
	let { sections } = await get_sections();
	console.log(`Found ${sections.length} sections`);

	// Debug mode: limit to 2 sections
	const debug_mode = process.env.DEBUG_MODE === '1';
	if (debug_mode) {
		console.log('🐛 DEBUG_MODE enabled - processing only 2 sections');
		sections = sections.slice(0, 2);
	}

	// Fetch content for each section
	console.log('📥 Downloading section content...');
	const sections_with_content: Array<{
		section: (typeof sections)[number];
		content: string;
		index: number;
	}> = [];
	const download_errors: Array<{ section: string; error: string }> = [];

	for (let i = 0; i < sections.length; i++) {
		const section = sections[i]!;
		try {
			console.log(`Fetching ${i + 1}/${sections.length}: ${section.title}`);
			const content = await fetch_section_content(section.url);
			sections_with_content.push({
				section,
				content,
				index: i,
			});
		} catch (error) {
			const error_msg = error instanceof Error ? error.message : String(error);
			console.error(`⚠️  Failed to fetch ${section.title}:`, error_msg);
			download_errors.push({ section: section.title, error: error_msg });
		}
	}

	console.log(`✅ Successfully downloaded ${sections_with_content.length} sections`);

	if (sections_with_content.length === 0) {
		console.error('❌ No sections were successfully downloaded');
		process.exit(1);
	}

	// Initialize Anthropic client
	console.log('🤖 Initializing Anthropic API...');
	const anthropic = new AnthropicProvider('claude-sonnet-4-5-20250929', api_key);

	// Prepare batch requests
	console.log('📦 Preparing batch requests...');
	const batch_requests: AnthropicBatchRequest[] = sections_with_content.map(
		({ content, index }) => ({
			custom_id: `section-${index}`,
			params: {
				model: anthropic.get_model_identifier(),
				max_tokens: 250,
				messages: [
					{
						role: 'user',
						content: USE_CASES_PROMPT + content,
					},
				],
				temperature: 0,
			},
		}),
	);

	// Create and process batch
	console.log('🚀 Creating batch job...');
	const batch_response = await anthropic.create_batch(batch_requests);
	console.log(`✅ Batch created with ID: ${batch_response.id}`);

	// Poll for completion
	console.log('⏳ Waiting for batch to complete...');
	let batch_status = await anthropic.get_batch_status(batch_response.id);

	while (batch_status.processing_status === 'in_progress') {
		const { succeeded, processing, errored } = batch_status.request_counts;
		console.log(`  Progress: ${succeeded} succeeded, ${processing} processing, ${errored} errored`);
		await new Promise((resolve) => setTimeout(resolve, 5000));
		batch_status = await anthropic.get_batch_status(batch_response.id);
	}

	console.log('✅ Batch processing completed!');

	// Get results
	if (!batch_status.results_url) {
		throw new Error('Batch completed but no results URL available');
	}

	console.log('📥 Downloading results...');
	const results = await anthropic.get_batch_results(batch_status.results_url);

	// Process results
	console.log('📊 Processing results...');
	const summaries: Record<string, string> = {};
	const errors: Array<{ section: string; error: string }> = [];

	for (const result of results) {
		const index = parseInt(result.custom_id.split('-')[1] ?? '0');
		const section_data = sections_with_content.find((s) => s.index === index);

		if (!section_data) {
			console.warn(`⚠️  Could not find section for index ${index}`);
			continue;
		}

		const { section } = section_data;

		if (result.result.type !== 'succeeded' || !result.result.message) {
			const error_msg = result.result.error?.message || 'Failed or no message';
			console.error(`  ❌ ${section.title}: ${error_msg}`);
			errors.push({ section: section.title, error: error_msg });
			continue;
		}

		const output_content = result.result.message.content[0]?.text;
		if (output_content) {
			summaries[section.slug] = output_content.trim();
			console.log(`  ✅ ${section.title}`);
		}
	}

	// Write output to JSON file
	console.log('💾 Writing results to file...');
	const output_path = path.join(current_dirname, '../src/use_cases.json');
	const output_dir = path.dirname(output_path);

	await mkdir(output_dir, { recursive: true });

	const summary_data: SummaryData = {
		generated_at: new Date().toISOString(),
		model: anthropic.get_model_identifier(),
		total_sections: sections.length,
		successful_summaries: Object.keys(summaries).length,
		failed_summaries: errors.length,
		summaries,
		errors: errors.length > 0 ? errors : undefined,
		download_errors: download_errors.length > 0 ? download_errors : undefined,
	};

	await writeFile(output_path, JSON.stringify(summary_data, null, 2), 'utf-8');

	// Print summary
	console.log('\n📊 Summary:');
	console.log(`  Total sections: ${sections.length}`);
	console.log(`  Successfully downloaded: ${sections_with_content.length}`);
	console.log(`  Download failures: ${download_errors.length}`);
	console.log(`  Successfully analyzed: ${Object.keys(summaries).length}`);
	console.log(`  Analysis failures: ${errors.length}`);
	console.log(`\n✅ Results written to: ${output_path}`);

	if (download_errors.length > 0) {
		console.log('\n⚠️  Some sections failed to download:');
		download_errors.forEach((e) => console.log(`  - ${e.section}: ${e.error}`));
	}

	if (errors.length > 0) {
		console.log('\n⚠️  Some sections failed to analyze:');
		errors.forEach((e) => console.log(`  - ${e.section}: ${e.error}`));
	}
}

main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
