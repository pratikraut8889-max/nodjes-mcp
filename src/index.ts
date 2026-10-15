#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

// Supabase Realtime needs an explicit WebSocket implementation on Node.js 20.
// Install it with: npm install ws
const require = createRequire(import.meta.url);
const WebSocket = require("ws");

// Load the project .env file regardless of the MCP client's working directory.
// Existing process environment variables take precedence over values in .env.
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  loadEnvFile(resolve(projectDir, ".env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

// Keep secrets outside source control. Never fall back to a hard-coded service key.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    "Configuration error: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  realtime: { transport: WebSocket },
});

const GetProfilesSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  status: z.enum(["active", "suspended", "pending"]).optional(),
});

const UpdateProfileSchema = z.object({
  username: z.string().trim().min(3).max(30),
  bio: z.string().max(500),
});

const server = new Server(
  {
    name: "nodejs-supabase-mcp",
    version: "1.0.1",
  },
  {
    capabilities: { tools: {} },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_user_profiles",
      description:
        "Fetch profiles from the profiles table. Returns only id, username, status, created_at, and bio.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            default: 10,
            description: "Maximum number of records to return (1–50; default 10).",
          },
          status: {
            type: "string",
            enum: ["active", "suspended", "pending"],
            description: "Optional status filter.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "update_user_bio",
      description: "Update the bio field for a profile identified by username.",
      inputSchema: {
        type: "object",
        properties: {
          username: {
            type: "string",
            minLength: 3,
            maxLength: 30,
            description: "The profile's username.",
          },
          bio: {
            type: "string",
            maxLength: 500,
            description: "The new bio text (up to 500 characters).",
          },
        },
        required: ["username", "bio"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "get_user_profiles") {
      // MCP clients may omit arguments entirely; treat that as an empty object.
      const params = GetProfilesSchema.parse(args ?? {});
      let query = supabase
        .from("profiles")
        .select("id, username, status, created_at, bio");

      if (params.status) {
        query = query.eq("status", params.status);
      }

      const { data, error } = await query.limit(params.limit);
      if (error) throw error;

      return {
        content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      };
    }

    if (name === "update_user_bio") {
      const params = UpdateProfileSchema.parse(args ?? {});
      const { data, error } = await supabase
        .from("profiles")
        .update({ bio: params.bio })
        .eq("username", params.username)
        .select("id, username, bio")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `No profile found for username '${params.username}'.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully updated profile: ${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  } catch (error: unknown) {
    const message =
      error instanceof z.ZodError
        ? `Validation input error: ${JSON.stringify(error.issues)}`
        : error instanceof Error
          ? error.message
          : String(error);

    return {
      isError: true,
      content: [{ type: "text", text: `Tool error: ${message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
