# Node.js Supabase MCP Server

A stdio-based Model Context Protocol server with two tools:

- `get_user_profiles`: reads up to 50 rows from `profiles`, with an optional `status` filter.
- `update_user_bio`: updates the `bio` for a profile found by `username`.

## Requirements

- Node.js 20 or later
- A Supabase project with a `profiles` table containing the columns used in `src/index.ts`

## Install, configure, and build

```bash
npm install
npm run typecheck
npm run build
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment where the server process will run. For a local Linux/macOS terminal, for example:

```bash
export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
npm start
```

The process exits at startup if either variable is missing. It does not read `.env` files automatically.

For an MCP client, configure the command as `node`, the argument as the absolute path to this project's `dist/index.js`, and pass both variables through the client's `env` configuration. For example, the server entry in a Claude Desktop config looks like this (replace the path and placeholder values):

```json
{
  "mcpServers": {
    "supabase-profiles": {
      "command": "node",
      "args": ["/absolute/path/to/nodejs-mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://YOUR_PROJECT_REF.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "YOUR_SERVICE_ROLE_KEY"
      }
    }
  }
}
```

**Security:** a Supabase service-role key bypasses Row Level Security. Use it only in a trusted server process, limit access to this MCP server, and rotate any key that has been committed or shared. Do not hard-code credentials or commit them to source control.

## Database assumptions

The example expects `profiles(id, username, status, created_at, bio)`. Adjust the select list and status enum to match your database schema. Enforce authorization and username uniqueness at the database/application layer; input validation alone is not an authorization boundary.
