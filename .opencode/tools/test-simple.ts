import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Simple test tool to verify custom tools work",
  args: {
    message: tool.schema.string().optional().describe("Message to echo back"),
  },
  async execute(args, context) {
    const { directory, worktree, sessionID, agent } = context;
    const msg = args.message || "Hello from test tool!";
    
    // Use Bun.$ for shell commands if needed
    // const result = await Bun.$`echo "test"`.text();
    
    return [
      `✅ Tool executed successfully!`,
      `Message: ${msg}`,
      `Directory: ${directory}`,
      `Worktree: ${worktree}`,
      `SessionID: ${sessionID}`,
      `Agent: ${agent}`,
    ].join("\n");
  },
});
