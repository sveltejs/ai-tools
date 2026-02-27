# @sveltejs/mcp

## 0.1.20

### Patch Changes

- fix: turn off no-inspect in eslint for mcp ([`2245cb2`](https://github.com/sveltejs/ai-tools/commit/2245cb2dc9e2d217869b6a800795ce59ffb40c51))

## 0.1.19

### Patch Changes

- chore: update svelte ([`7447744`](https://github.com/sveltejs/ai-tools/commit/74477448cea44ec21684ea4d39f2c5c7133b5150))

## 0.1.18

### Patch Changes

- feat: expose playground link as MCP App ([#138](https://github.com/sveltejs/ai-tools/pull/138))

## 0.1.17

### Patch Changes

- fix: add suggestion for snippets declared in script tag ([#132](https://github.com/sveltejs/ai-tools/pull/132))

## 0.1.16

### Patch Changes

- feat: expose tools as JS api + cli ([#128](https://github.com/sveltejs/ai-tools/pull/128))

## 0.1.15

### Patch Changes

- fix: server.json version + update publisher ([`9dfb4de`](https://github.com/sveltejs/ai-tools/commit/9dfb4dedb42837c40c4e660f0f816d7cf9081fc4))

## 0.1.14

### Patch Changes

- fix: improve prompt to reduce token usage ([#124](https://github.com/sveltejs/ai-tools/pull/124))

## 0.1.13

### Patch Changes

- fix: revert name change and add title ([`98efa1e`](https://github.com/sveltejs/ai-tools/commit/98efa1e09ebcca7827b10dc6bc8e1699fc1e5171))

## 0.1.12

### Patch Changes

- fix: update server name on mcp registry ([`60297b3`](https://github.com/sveltejs/ai-tools/commit/60297b3c49bf110b48908e61b5d5d902ea1bdf39))

- chore: update tmcp ([#99](https://github.com/sveltejs/ai-tools/pull/99))

## 0.1.11

### Patch Changes

- fix: add `async` parameter to `svelte-autofixer` ([#94](https://github.com/sveltejs/ai-tools/pull/94))

- fix: install latest eslint svelte packages to support `$state.eager` ([`f6ce89f`](https://github.com/sveltejs/ai-tools/commit/f6ce89ff34faabc3d746a350ea347298ecfed2ec))

## 0.1.10

### Patch Changes

- fix: add icons to `server.json` ([`02c951b`](https://github.com/sveltejs/ai-tools/commit/02c951baa86ac8103ffc158a202c06cfe6b15c01))

- fix: add `preferred-frame-size` to UI resource ([`3fabcc0`](https://github.com/sveltejs/ai-tools/commit/3fabcc0f9bfee916c0deb9c2ffa931ed2168af2d))

- feat: support: `$state.eager` ([#90](https://github.com/sveltejs/ai-tools/pull/90))

## 0.1.9

### Patch Changes

- feat: return `mcp-ui` resource from `playground-link` ([#84](https://github.com/sveltejs/ai-tools/pull/84))

- feat: suggest against js variables in css ([#78](https://github.com/sveltejs/ai-tools/pull/78))

## 0.1.8

### Patch Changes

- fix: upgrade registry publisher cli ([`5fa2baa`](https://github.com/sveltejs/ai-tools/commit/5fa2baa27009f01e0e4e91cee7984b81a81c1c29))

## 0.1.7

### Patch Changes

- fix: use correct server schema version ([`579be87`](https://github.com/sveltejs/ai-tools/commit/579be877fa9f87f7f173450ca5bc918824d68282))

## 0.1.6

### Patch Changes

- fix: prevent `imported_runes` suggestion from being added for libs that are not svelte ([`87af64f`](https://github.com/sveltejs/ai-tools/commit/87af64f4bc6d07b75640eb987a33655654363997))

- feat: add svelte icon and website url for mcp server ([#75](https://github.com/sveltejs/ai-tools/pull/75))

- fix: use `data:` uri for local icon & add icons to tools + resources + prompts ([`cf62286`](https://github.com/sveltejs/ai-tools/commit/cf622869129382a97ad059bb1389f115907adc8e))

## 0.1.5

### Patch Changes

- fix: widen `desired_svelte_version` validation to accommodate some clients ([`3b301d7`](https://github.com/sveltejs/ai-tools/commit/3b301d7d9c2f49758023408f505bc4ca79caaff4))

- fix: minor tweaks to the prompt to allow for automatic sync ([#63](https://github.com/sveltejs/ai-tools/pull/63))

- feat: `read_state_with_dollar` autofixer ([#66](https://github.com/sveltejs/ai-tools/pull/66))

## 0.1.4

### Patch Changes

- fix: pass secrets in action and update `mcpName` ([`044f098`](https://github.com/sveltejs/ai-tools/commit/044f0988b935fff39911a861a648dfb276f5831a))

## 0.1.3

### Patch Changes

- fix: use DNS to publish MCP ([#59](https://github.com/sveltejs/ai-tools/pull/59))

## 0.1.2

### Patch Changes

- fix: publish to MCP registry (I really hope this time for real) ([`ef5241c`](https://github.com/sveltejs/ai-tools/commit/ef5241cbc204ad8bb84bde27db7c9d0a08280245))

## 0.1.1

### Patch Changes

- feat: publish mcp to registry (maybe for real this time) ([`132943d`](https://github.com/sveltejs/ai-tools/commit/132943db3b04dbbd322d08926c0880c990a61f5f))

## 0.1.0

### Minor Changes

- feat: publish to registry ([#45](https://github.com/sveltejs/ai-tools/pull/45))

### Patch Changes

- feat: add autofixer to tell the LLM to check if some function called in effect is assigning state #26 ([`73d7625`](https://github.com/sveltejs/ai-tools/commit/73d7625b3ca6a812ba91883ea668d80ff1e7c703))

- feat: add bind:this -> attachment and action -> attachment autofixer #20 ([`73d7625`](https://github.com/sveltejs/ai-tools/commit/73d7625b3ca6a812ba91883ea668d80ff1e7c703))

## 0.0.4

### Patch Changes

- fix: allow TS `.svelte.ts` modules ([#49](https://github.com/sveltejs/ai-tools/pull/49))

## 0.0.3

### Patch Changes

- fix: check effect.pre in assign-in-effect ([#41](https://github.com/sveltejs/ai-tools/pull/41))

- feat: `use_cases` documentation metadata ([#29](https://github.com/sveltejs/ai-tools/pull/29))

- fix: change title names to allow for claude code to use the prompt ([`725f785`](https://github.com/sveltejs/ai-tools/commit/725f785766d04e9ed810a7c3f6bcfdb2e2b8234c))

- fix: enable doc tools ([`cb316c5`](https://github.com/sveltejs/ai-tools/commit/cb316c5b3ebc712946969d2d57236d159e796d58))

## 0.0.2

### Patch Changes

- feat: latest version ([#25](https://github.com/sveltejs/ai-tools/pull/25))
