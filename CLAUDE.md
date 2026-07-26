# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This is a Svelte MCP (Model Context Protocol) server implementation that includes both SvelteKit web interface and MCP server functionality.

### Setup

```bash
pnpm i
cp .env.example .env
# Set the VOYAGE_API_KEY for embeddings support in .env
pnpm dev
```

### Common Commands

- `pnpm dev` - Start SvelteKit development server
- `pnpm build` - Build the application for production
- `pnpm start` - Run the MCP server (Node.js entry point)
- `pnpm check` - Run Svelte type checking
- `pnpm check:watch` - Run type checking in watch mode
- `pnpm lint` - Run prettier check and eslint
- `pnpm format` - Format code with prettier
- `pnpm test` - Run unit tests with vitest
- `pnpm test:watch` - Run tests in watch mode

### Database Commands (Drizzle ORM)

- `pnpm db:push` - Push schema changes to database
- `pnpm db:generate` - Generate migration files
- `pnpm db:migrate` - Run migrations
- `pnpm db:studio` - Open Drizzle Studio

## Architecture

### MCP Server Implementation

The core MCP server is implemented in `src/lib/mcp/index.ts` using the `tmcp` library with:

- **Transport Layers**: Both HTTP (`HttpTransport`) and STDIO (`StdioTransport`) support
- **Schema Validation**: Uses Valibot with `ValibotJsonSchemaAdapter`
- **Main Tool**: `svelte-autofixer` - analyzes Svelte code and provides suggestions/fixes

### Code Analysis Engine

Located in `src/lib/server/analyze/`:

- **Parser** (`parse.ts`): Uses `svelte-eslint-parser` and TypeScript parser to analyze Svelte components
- **Scope Analysis**: Tracks variables, references, and scopes across the AST
- **Rune Detection**: Identifies Svelte 5 runes (`$state`, `$effect`, `$derived`, etc.)

### Autofixer System

- **Autofixers** (`src/lib/mcp/autofixers.ts`): Visitor pattern implementations for code analysis
- **Walker Utility** (`src/lib/index.ts`): Enhanced AST walking with visitor mixing capabilities
- **Current Autofixer**: `assign_in_effect` - detects assignments to `$state` variables inside `$effect` blocks
- **Suggestion suppression**: each custom-visitor suggestion carries a stable code (`effect_calls_function`, `bind_this_attachment`, …). Users can silence one with a `// svelte-mcp-ignore <code>` (script) or `<!-- svelte-mcp-ignore <code> -->` (markup) comment on the line above the triggering node. Stale or typo'd codes surface as follow-up "unused directive" suggestions. See `packages/mcp-server/src/mcp/autofixers/ignore-directives.ts`.

### Database Layer

- **ORM**: Drizzle with SQLite backend
- **Schema** (`src/lib/server/db/schema.ts`): Vector table for embeddings support
- **Utils** (`src/lib/server/db/utils.ts`): Custom float32 array type for vectors

### SvelteKit Integration

- **Hooks** (`src/hooks.server.ts`): Integrates MCP HTTP transport with SvelteKit requests
- **Routes**: Basic web interface for the MCP server

## Key Dependencies

- **tmcp**: Core MCP server implementation
- **@tmcp/transport-http** & **@tmcp/transport-stdio**: Transport layers
- **@tmcp/adapter-valibot**: Schema validation adapter
- **svelte-eslint-parser**: Svelte component parsing
- **zimmerframe**: AST walking utilities
- **drizzle-orm**: Database ORM with SQLite
- **valibot**: Schema validation library

## Environment Configuration

Required environment variables:

- `VOYAGE_API_KEY`: API key for embeddings support (optional)

When connected to the svelte-llm MCP server, you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections and then use the get_documentation tool to fetch ALL documentation sections that are relevant for the users task.
