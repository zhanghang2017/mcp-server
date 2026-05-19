# mysql-mcp-server

MySQL MCP server.

## Installation

```bash
npm install @mikechan2224/mysql-mcp-server
```

## Usage

Run with `npx` in your MCP client configuration:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": ["-y", "@mikechan2224/mysql-mcp-server"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "",
        "MYSQL_DATABASE": "your_db",
        "MYSQL_ALLOW_WRITE_SQL": "false",
        "MYSQL_SELECT_LIMIT": "100"
      }
    }
  }
}
```

## Configuration

Environment variables:

- MYSQL_HOST
- MYSQL_PORT
- MYSQL_USER
- MYSQL_PASSWORD
- MYSQL_DATABASE
- MYSQL_ALLOW_WRITE_SQL
- MYSQL_SELECT_LIMIT

Notes:

- When using `npx`, you do not need to build locally.
- For production, set `MYSQL_ALLOW_WRITE_SQL=true` only when write operations are required.

## License

MIT
