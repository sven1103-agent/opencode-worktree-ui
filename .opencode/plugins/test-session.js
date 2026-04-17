import { tool } from "@opencode-ai/plugin";
import fs from "node:fs/promises";

const LOG_FILE = "/tmp/opencode-session-test.log";

async function log(message, level = "info") {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level}] ${message}\n`;
  try {
    await fs.appendFile(LOG_FILE, entry);
  } catch (e) {
    console.error(`Failed to write to log: ${e.message}`);
  }
}

export const TestSessionPlugin = async ({ client, directory, $, sessionID }) => {
  await log(`=== PLUGIN START ===`);
  await log(`parent session: ${sessionID}, directory: ${directory}`);

  const parentSessionId = sessionID;

  return {
    // Tool definition
    tool: {
      test_session_create: tool({
        description: "Create a child session in a specified directory",
        args: {
          targetDirectory: tool.schema.string().describe("Directory path"),
        },
        async execute(args, context) {
          await log(`=== TOOL EXECUTE ===`);
          await log(`Args: ${JSON.stringify(args)}`);
          
          const targetDir = args.targetDirectory;
          try {
            await fs.access(targetDir);
          } catch {
            await fs.mkdir(targetDir, { recursive: true });
          }

          const childSession = await client.session.create({
            query: { directory: targetDir },
            body: {
              parentID: parentSessionId,
              title: `Test Session ${new Date().toISOString()}`,
            },
          });

          await log(`Session created: ${childSession.id}`);
          return `Created session ${childSession.id} in ${targetDir}`;
        },
      }),
    },
    
    // Monitor all tool calls to see if our tool is being called
    "tool.execute.before": async (input, output) => {
      await log(`TOOL CALL: ${input.tool}`);
    },
    
    // Hook to intercept commands
    "command.executed": async (input, output) => {
      await log(`COMMAND: ${input.command}`);
      
      if (input.command === "test-session") {
        await log("Intercepted /test-session!");
        
        let targetDir = "/tmp/test-opencode-session";
        if (input.args && input.args.length > 0) {
          targetDir = input.args[0];
        }
        
        await log(`Creating session in: ${targetDir}`);
        
        try {
          try {
            await fs.access(targetDir);
          } catch {
            await fs.mkdir(targetDir, { recursive: true });
          }
          
          const childSession = await client.session.create({
            query: { directory: targetDir },
            body: {
              parentID: parentSessionId,
              title: `Test Session ${new Date().toISOString()}`,
            },
          });
          
          await log(`SUCCESS: ${childSession.id}`);
          
          // Return success message
          return `✅ Created session: ${childSession.id}\n📂 Directory: ${targetDir}`;
        } catch (error) {
          await log(`ERROR: ${error.message}`);
          return `❌ Error: ${error.message}`;
        }
      }
    },
  };
};
