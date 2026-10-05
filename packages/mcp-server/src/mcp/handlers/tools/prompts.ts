export const SECTIONS_LIST_INTRO =
	'List of available Svelte documentation sections with their intended use cases. The "use_cases" field describes WHEN each section would be useful - analyze these carefully to determine which sections match the user\'s query:';

export const SECTIONS_LIST_OUTRO =
	"Carefully analyze the use_cases field for each section to identify which documentation is relevant for the user's specific query. The use_cases contain keywords for project types, features, components, and development stages. After identifying relevant sections, use the get-documentation tool with ALL relevant section titles or paths at once (can pass multiple sections as an array).";

export function documentation_instructions(subdomain?: string, fallback = false) {
	if (!subdomain) return '';
	if (fallback) {
		return `WARNING: Documentation from https://${subdomain}.svelte.dev is unavailable. The server has fallen back to https://svelte.dev. You MUST warn the user that the requested documentation could not be loaded and that these are the default svelte.dev docs, which may not match their installed version. Ask them to check the subdomain in their MCP configuration (?subdomain=${subdomain} or SVELTE_MCP_SUBDOMAIN=${subdomain}).\n\n`;
	}
	return `This MCP server is using documentation from https://${subdomain}.svelte.dev. Before relying on this documentation, check the project's package.json dependencies and devDependencies to verify that the relevant Svelte or SvelteKit version matches these docs. If it does not, tell the user to change their MCP configuration: choose the appropriate subdomain, or remove the subdomain query parameter or unset SVELTE_MCP_SUBDOMAIN to use svelte.dev. Explain that these docs may be ahead of or behind their installed version and describe unavailable or outdated APIs.\n\n`;
}
