---
'@sveltejs/mcp': patch
---

fix: stop `$effect` suggestions at nested function boundaries and ignore harmless calls like `setTimeout`, `console.log` and `untrack`
