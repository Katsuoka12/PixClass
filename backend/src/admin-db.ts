import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AdminStore, AdminUser } from './admin.js';
import type { User } from './types.js';
import { ApiError } from './middleware/errors.js';

type AdminUserRow = RowDataPacket & Omit<AdminUser, 'is_active' | 'created_at'> & { is_active: number; created_at: Date };
const publicUser = (row: AdminUserRow): AdminUser => ({
  id: row.id, role: row.role, name: row.name, email: row.email,
  is_active: Boolean(row.is_active), created_at: row.created_at.toISOString(),
});

export function createAdminStore(pool: Pool): AdminStore {
  async function authorized<T>(actor: User, operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<(RowDataPacket & { role: User['role']; is_active: number })[]>(
        'SELECT role, is_active FROM users WHERE id = ? LOCK IN SHARE MODE', [actor.id],
      );
      if (!rows[0]?.is_active) throw new ApiError(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบอีกครั้ง');
      if (rows[0].role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์จัดการผู้ใช้');
      const result = await operation(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
  async function find(connection: PoolConnection, id: number, current = false) {
    const [rows] = await connection.execute<AdminUserRow[]>(
      current
        ? 'SELECT id, role, name, email, is_active, created_at FROM users WHERE id = ? FOR UPDATE'
        : 'SELECT id, role, name, email, is_active, created_at FROM users WHERE id = ?', [id],
    );
    if (!rows[0]) throw new ApiError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้');
    return rows[0];
  }
  return {
    list(actor, page) {
      return authorized(actor, async connection => {
        if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) throw new ApiError(400, 'VALIDATION_ERROR', 'หมายเลขหน้าไม่ถูกต้อง');
        const [count] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM users');
        const [rows] = await connection.execute<AdminUserRow[]>(
          'SELECT id, role, name, email, is_active, created_at FROM users ORDER BY id DESC LIMIT ? OFFSET ?', [50, (page - 1) * 50],
        );
        return { users: rows.map(publicUser), total: Number(count[0]!.total), page, page_size: 50 };
      });
    },
    createTeacher(actor, input) {
      return authorized(actor, async connection => {
        let id: number;
        try {
          const [result] = await connection.execute<ResultSetHeader>(
            'INSERT INTO users (role, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
            ['teacher', input.name, input.email.trim().toLowerCase(), input.password_hash],
          );
          id = result.insertId;
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'EMAIL_EXISTS', 'อีเมลนี้ถูกใช้งานแล้ว');
          throw error;
        }
        return publicUser(await find(connection, id));
      });
    },
    setActive(id, actor, active) {
      return authorized(actor, async connection => {
        // Read protected targets before taking a write lock, so two admins cannot deadlock on each other.
        const target = await find(connection, id);
        if (target.role === 'admin') throw new ApiError(409, 'ADMIN_PROTECTED', 'ไม่สามารถเปลี่ยนสถานะผู้ดูแลระบบ');
        await connection.execute('UPDATE users SET is_active = ? WHERE id = ? AND role <> ?', [active, id, 'admin']);
        const updated = await find(connection, id, true);
        if (updated.role === 'admin') throw new ApiError(409, 'ADMIN_PROTECTED', 'ไม่สามารถเปลี่ยนสถานะผู้ดูแลระบบ');
        return publicUser(updated);
      });
    },
  };
}
