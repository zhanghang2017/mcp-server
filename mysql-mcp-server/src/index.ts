import nsp from "node-sql-parser";
const { Parser } = nsp;
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const sqlParser = new Parser();

const env = z
  .object({
    MYSQL_HOST: z.string().default("localhost"),
    MYSQL_PORT: z.coerce.number().int().positive().default(3306),
    MYSQL_USER: z.string().min(1),
    MYSQL_PASSWORD: z.string().default(""),
    MYSQL_DATABASE: z.string().min(1),
    MYSQL_ALLOW_WRITE_SQL: z.preprocess(
      (value) => {
        if (typeof value === "string") {
          const normalized = value.trim().toLowerCase();
          if (["1", "true", "yes", "y", "on"].includes(normalized)) {
            return true;
          }
          if (["0", "false", "no", "n", "off"].includes(normalized)) {
            return false;
          }
        }

        return value;
      },
      z.boolean().default(false),
    ),
    MYSQL_SELECT_LIMIT: z.coerce.number().int().positive().default(100),
  })
  .parse(process.env);

const pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
});


const server = new McpServer({
  name: "mysql-mcp-server",
  version: "1.0.4",
});

/**
 * Normalize parser output to a statement array.
 */
function getStatements(ast: unknown): any[] {
  return Array.isArray(ast) ? ast : [ast];
}

/**
 * Extract the normalized SQL statement type.
 */
function getStatementType(statement: any): string {
  return typeof statement?.type === "string" ? statement.type.toUpperCase() : "";
}

/**
 * Check whether a statement mutates data.
 */
function isWriteStatement(statement: any): boolean {
  const writeStatementTypes = new Set([
    "UPDATE",
    "INSERT",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "TRUNCATE",
    "RENAME",
    "GRANT",
    "REVOKE",
  ]);
  return writeStatementTypes.has(getStatementType(statement));
}

/**
 * Enforce a max row limit on SELECT statements.
 */
function setSelectLimit(statement: any, maxRows: number): boolean {
  if (getStatementType(statement) !== "SELECT") {
    return false;
  }

  if (!statement.limit) {
    statement.limit = { seperator: "", value: [{ type: "number", value: maxRows }] };
    return true;
  }

  const limitIndex = statement.limit.seperator === "," ? 1 : 0;
  statement.limit.value ??= [];
  const currentLimit = Number(statement.limit.value[limitIndex]?.value);

  if (!Number.isFinite(currentLimit) || currentLimit > maxRows) {
    statement.limit.value[limitIndex] = { type: "number", value: maxRows };
    return true;
  }

  return false;
}

/**
 * Apply SELECT limit enforcement and return executable SQL.
 */
function applySelectLimit(sql: string, ast: unknown): string {
  const statements = getStatements(ast);

  if (statements.length !== 1) {
    throw new Error("Only one SQL statement can be executed at a time.");
  }

  const statement = statements[0];
  if (!setSelectLimit(statement, env.MYSQL_SELECT_LIMIT)) {
    return sql;
  }

  return sqlParser.sqlify(statement, { database: "mysql" });
}

server.registerTool(
  "query_tables_list",
  {
    description: "List all tables in the database.",
    inputSchema: z.object({}),
  },
  /**
   * Fetch and return all table names in the current database.
   */
  async () => {
    try {
      const [rows] = await pool.query("SHOW TABLES");

      const tables = (rows as any[]).map((row) => Object.values(row)[0]);

      return {
        content: [{ type: "text", text: `tables:\n${tables.join("\n")}` }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `error: ${error.message}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "query_table_description",
  {
    description: "Describe a table in the database.",
    inputSchema: { tableName: z.string().describe("The name of the table to describe") },
  },
  /**
   * Return column metadata for a specified table.
   */
  async ({ tableName }) => {
    try {
      const [rows] = await pool.query("DESCRIBE ??", [tableName]);
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    } catch (error: any) {
      return { content: [{ type: "text", text: `error: ${error.message}` }], isError: true };
    }
  },
);

server.registerTool(
  "execute_query_sql",
  {
    description:
      "Execute a SQL. UPDATE, INSERT, DELETE, CREATE, ALTER, DROP, TRUNCATE, RENAME, GRANT, and REVOKE require MYSQL_ALLOW_WRITE_SQL=true. SELECT is limited by MYSQL_SELECT_LIMIT.",
    inputSchema: { sql: z.string().describe("The SQL to execute") },
  },
  /**
   * Validate and execute SQL with write-guard and SELECT limit enforcement.
   */
  async ({ sql }) => {
    try {
      const ast = sqlParser.astify(sql, { database: "mysql" });
      const statements = getStatements(ast);

      if (statements.some(isWriteStatement) && !env.MYSQL_ALLOW_WRITE_SQL) {
        return {
          content: [
            {
              type: "text",
                text: "Write SQL is disabled. Set MYSQL_ALLOW_WRITE_SQL=true to allow UPDATE, INSERT, DELETE, CREATE, ALTER, DROP, TRUNCATE, RENAME, GRANT, and REVOKE statements.",
            },
          ],
          isError: true,
        };
      }

      const executableSql = applySelectLimit(sql, ast);
      const [rows] = await pool.query(executableSql);

      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    } catch (error: any) {
      return { content: [{ type: "text", text: `error: ${error.message}` }], isError: true };
    }
  },
);

/**
 * Bootstrap the MCP server over stdio.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MySQL MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
