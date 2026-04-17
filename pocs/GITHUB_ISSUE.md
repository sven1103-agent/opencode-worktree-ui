# OpenCode Desktop Plugin Context Issue

## Summary
Plugin `context` and `hookContext` objects are missing documented properties (`client`, `serverUrl`, `sessionID`) when running in OpenCode Desktop mode, despite TypeScript definitions indicating they should be available.

## Expected Behavior
According to `@opencode-ai/plugin` TypeScript definitions (`index.d.ts`):

```typescript
export type PluginInput = {
    client: ReturnType<typeof createOpencodeClient>;  // Should be SDK client
    project: Project;
    directory: string;
    worktree: string;
    experimental_workspace: { register(type: string, adaptor: WorkspaceAdaptor): void };
    serverUrl: URL;  // Should be server URL
    $: BunShell;
};
```

Hooks should receive:
```typescript
"tool.execute.after": (input, output, hookContext) => {
    // hookContext should have:
    // - client: OpencodeClient
    // - sessionID: string
}
```

## Actual Behavior
All context properties are `undefined` or `null`:

- `context.client` → `undefined`
- `context.serverUrl` → `undefined`  
- `context.directory` → `undefined`
- `context.sessionID` → `undefined`
- `hookContext.client` → `undefined`
- `hookContext.sessionID` → sometimes available via `input.sessionID`

## Evidence

### Log Output from Plugin
```
[2026-04-17T08:41:22.742Z] Context type: undefined
[2026-04-17T08:41:22.742Z] Context keys: null
[2026-04-17T08:41:22.742Z] serverUrl: NOT AVAILABLE
[2026-04-17T08:41:22.742Z] sessionID: NOT AVAILABLE
[2026-04-17T08:41:22.742Z] directory: NOT AVAILABLE
[2026-04-17T08:41:28.860Z] hookContext keys: null
[2026-04-17T08:41:28.860Z] hookContext.serverUrl: NOT AVAILABLE
[2026-04-17T08:41:28.860Z] hookContext.sessionID: NOT AVAILABLE
[2026-04-17T08:41:28.860Z] hookContext.client type: undefined
```

### Environment
- OpenCode Desktop version: (latest as of 2026-04-17)
- OS: macOS
- Plugin: Custom plugin using `@opencode-ai/plugin`

## Reproduction Steps

1. Create a plugin file `.opencode/plugins/test-context.js`:

```javascript
export default async function testPlugin(args, context) {
  console.log("Context:", context);
  console.log("client:", context?.client);
  console.log("serverUrl:", context?.serverUrl);
  console.log("directory:", context?.directory);
  console.log("sessionID:", context?.sessionID);
  
  return {
    "tool.execute.after": async (input, output, hookContext) => {
      console.log("hookContext:", hookContext);
      console.log("hookContext.client:", hookContext?.client);
      console.log("hookContext.sessionID:", hookContext?.sessionID);
      console.log("input.sessionID:", input?.sessionID);
    }
  };
}
```

2. Register in `opencode.json`:
```json
{
  "plugin": ["/path/to/.opencode/plugins/test-context.js"]
}
```

3. Clear cache and restart Desktop:
```bash
rm -rf ~/Library/Caches/opencode
```

4. Open OpenCode Desktop and run any tool

5. Check logs - all context properties will be undefined

## Impact
This prevents plugins from:
- Creating new sessions programmatically
- Accessing the SDK client to interact with OpenCode server
- Getting server URL to create custom clients
- Implementing workflows like auto-creating worktree sessions

## Workaround Attempted
Tried using `opencode serve` mode where plugins work correctly, but this requires users to use CLI mode instead of Desktop GUI.

## Additional Context
The same plugin works correctly in `opencode serve` mode (context is populated), suggesting this is specific to Desktop mode's plugin initialization.

## Suggested Fix
Either:
1. Fix Desktop to properly populate plugin context
2. Update documentation to clarify which properties are available in Desktop vs serve mode
3. Provide alternative API for Desktop plugins to access session/client info

## References
- Plugin types: `@opencode-ai/plugin/dist/index.d.ts`
- Documentation: https://opencode.ai/docs/plugins
