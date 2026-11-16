import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import type { Config } from './config.js';
import type { User, UserStore } from './types.js';

export function createPool(config: Config): Pool {
  return mysql.createPool({
    host: config.DB_HOST, port: config.DB_PORT, database: config.DB_NAME,
    user: config.DB_USER, password: config.DB_PASS,
    charset: 'utf8mb4', timezone: 'Z', connectionLimit: 10,
    waitForConnections: true, queueLimit: 100,
  });
}

export function createUserStore(pool: Pool): UserStore {
  return {
    async findByEmail(email) {
      const [rows] = await pool.execute<(RowDataPacket & User)[]>(
        'SELECT id, role, name, email, password_hash, is_active FROM users WHERE email = ? LIMIT 1', [email],
      );
      return rows[0];
    },
    async findById(id) {
      const [rows] = await pool.execute<(RowDataPacket & User)[]>(
        'SELECT id, role, name, email, password_hash, is_active FROM users WHERE id = ? LIMIT 1', [id],
      );
      return rows[0];
    },
    async create(input) {
      const [result] = await pool.execute<ResultSetHeader>(
        'INSERT INTO users (role, name, email, password_hash) VALUES (?, ?, ?, ?)',
        ['student', input.name, input.email, input.password_hash],
      );
      return result.insertId;
    },
  };
}
