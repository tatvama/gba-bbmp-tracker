# Running Instructions: GBA · BBMP Ward & Engineer Tracker

This guide documents the commands to run, test, build, lint, and expose the platform's services.

---

## 1. Local Development Server

To run the Next.js development server locally:
```bash
npm run dev
```
- Access the platform UI at: **`http://localhost:3000`**
- The development server automatically reloads pages when you save source files.

---

## 2. Production Build and Execution

To compile the application into an optimized static/dynamic production bundle and launch the production server:
```bash
# 1. Compile the build traces and pages
npm run build

# 2. Start the production web server
npm start
```
By default, the server runs on port **3000** (`http://localhost:3000`).

---

## 3. Running Checks and Verification

To verify that the code compiles, complies with styling guidelines, and passes all tests:

### 3.1 Run Linter
Validates code style and rules:
```bash
npm run lint
```

### 3.2 Run TypeScript Compilation
Verifies compile-time type safety and signatures:
```bash
npm run typecheck
```

### 3.3 Run Unit and Integration Tests
Executes the Vitest test runner (168 tests across 22 test suites):
```bash
# One-shot test run
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 4. Run the Model Context Protocol (MCP) Server

The repository contains a stdio MCP server in `mcp/bbmp-server.ts` that exposes 16 custom tools (10 read and 6 write tools) to Claude Desktop or Claude Code.

### 4.1 Start the MCP Server
```bash
npm run mcp:start
```

### 4.2 Exposing Tools to Claude Desktop
Add the following snippet to your Claude Desktop configuration file (located at `~/AppData/Roaming/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bbmp": {
      "command": "npx",
      "args": ["tsx", "D:/gba-bbmp-tracker/gba-bbmp-tracker/mcp/bbmp-server.ts"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://<your-project-ref>.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<your-service-role-key>"
      }
    }
  }
}
```
*(Make sure to update the absolute path to your project location and fill in the Supabase credentials).*
Once configured and restarted, Claude Desktop will gain access to tools like `get_job_audit`, `draft_job_letter`, and others.
