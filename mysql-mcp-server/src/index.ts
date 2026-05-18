import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const env = z
  .object({
    MYSQL_HOST: z.string().default("localhost"),
    MYSQL_PORT: z.coerce.number().int().positive().default(3306),
    MYSQL_USER: z.string().min(1),
    MYSQL_PASSWORD: z.string().default(""),
    MYSQL_DATABASE: z.string().min(1),
  })
  .parse(process.env);

// 1. 初始化 MySQL 连接池
const pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
});

// 2. 创建 MCP 服务实例
const server = new McpServer({
  name: "mysql-mcp-server",
  version: "1.0.0",
});

server.registerTool(
  "list_tables",
  {
    description: "List all tables in the database.",
    inputSchema: z.object({}),
    outputSchema: z.array(z.string()),
  },
  async () => {
    try {
      const [rows] = await pool.query("SHOW TABLES");

      const tables = (rows as any[]).map((row) => Object.values(row)[0]);

      return {
        content: [
          { type: "text", text: `数据库中的表:\n${tables.join("\n")}` },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `获取表列表失败: ${error.message}` }],
        isError: true,
      };
    }
  },
);

// 5. 启动服务
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MySQL MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
