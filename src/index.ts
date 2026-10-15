#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// 1. Initialize Supabase Connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Critical Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Define Strict Validation Schemas using Zod
const GetProfilesSchema = z.object({
  limit: z.number().min(1).max(50).default(10),
  status: z.enum(["active", "suspended", "pending"]).optional()
});

const UpdateProfileSchema = z.object({
  username: z.string().min(3).max(30),
  bio: z.string().max(500).optional()
});

// 3. Initialize the MCP Server Instance
const server = new Server(
  {
    name: "production-supabase-mcp",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

// 4. Register Safe Tool Signatures for the Client
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_user_profiles",
        description: "Fetch public user profiles with optional status filtering. Automatically redacts sensitive parameters.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of records to return (Max 50)." },
            status: { type: "string", enum: ["active", "suspended", "pending"] }
          }
        }
      },
      {
        name: "update_user_bio",
        description: "Update a user's system profile description or username information safely.",
        inputSchema: {
          type: "object",
          properties: {
            username: { type: "string", description: "The unique username handle." },
            bio: { type: "string", description: "The new biography or description text." }
          },
          required: ["username"]
        }
      }
    ]
  };
});

// 5. Tool Handler Implementation with Security Redactions
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ---- ACTION: READ USER PROFILES ----
    if (name === "get_user_profiles") {
      // Validate incoming AI payload structurally
      const parsedParams = GetProfilesSchema.parse(args);

      let query = supabase
        .from("profiles")
        // Explicitly white-list columns to prevent leaking sensitive variables (PII)
        .select("id, username, status, created_at, bio");

      if (parsedParams.status) {
        query = query.eq("status", parsedParams.status);
      }

      const { data, error } = await query.limit(parsedParams.limit);
      if (error) throw error;

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    }

    // ---- ACTION: WRITE/UPDATE USER PROFILE ----
    if (name === "update_user_bio") {
      const parsedData = UpdateProfileSchema.parse(args);

      const { data, error } = await supabase
        .from("profiles")
        .update({ bio: parsedData.bio })
        .eq("username", parsedData.username)
        .select("id, username, bio")
        .single();

      if (error) throw error;

      return {
        content: [
          {
            type: "text",
            text: `Successfully updated profile: ${JSON.stringify(data, null, 2)}`
          }
        ]
      };
    }

    throw new Error(`Requested tool execution '${name}' is not supported by this server.`);
  } catch (error: any) {
    // Intercept Zod or database errors cleanly without dropping the protocol connection
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error instanceof z.ZodError
            ? `Validation Input Error: ${JSON.stringify(error.format())}`
            : `Supabase System Error: ${error.message}`
        }
      ]
    };
  }
});

// 6. Connect Using Standard Input/Output
const transport = new StdioServerTransport();
await server.connect(transport);
