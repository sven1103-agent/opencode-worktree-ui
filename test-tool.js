import { createOpencodeClient } from "@opencode-ai/sdk";

const client = createOpencodeClient();

async function test() {
  try {
    console.log("Listing available tools...");
    
    // Try to list sessions first to verify connection
    const sessions = await client.session.list();
    console.log("Sessions:", sessions.data.map(s => s.title));
    
    // The tool might not be directly listable, but let's check
    console.log("\nTool test complete");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

test();
