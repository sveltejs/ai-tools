export const SECTIONS_LIST_INTRO =
	'List of available Svelte documentation sections with their intended use cases. The "use_cases" field describes WHEN each section would be useful - analyze these carefully to determine which sections match the user\'s query:';

export const SECTIONS_LIST_OUTRO =
	"Carefully analyze the use_cases field for each section to identify which documentation is relevant for the user's specific query. The use_cases contain keywords for project types, features, components, and development stages. After identifying relevant sections, use the get-documentation tool with ALL relevant section titles or paths at once (can pass multiple sections as an array).";

export const NEXT_DOCUMENTATION_INSTRUCTIONS =
	"This MCP server is using Next documentation from https://next.svelte.dev. Before relying on this documentation, check the project's package.json dependencies and devDependencies to verify that the relevant Svelte or SvelteKit package uses a Next release (the next tag or a corresponding prerelease version). If it does not, tell the user to change their MCP configuration: remove ?next=true from the remote server URL, or unset SVELTE_MCP_NEXT (or set it to false) for the STDIO server. Explain that they are currently reading Next documentation, which may be ahead of or behind their installed version and describe unavailable or outdated APIs.";
