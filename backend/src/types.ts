export type Role = 'admin' | 'teacher' | 'student';

export interface User {
  id: number;
  role: Role;
  name: string;
  email: string;
  password_hash: string;
  is_active: number;
}

export interface UserStore {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: number): Promise<User | undefined>;
  create(input: { name: string; email: string; password_hash: string }): Promise<number>;
}

export interface AppConfig {
  JWT_SECRET: string;
  WEB_URL: string;
  NODE_ENV: 'development' | 'test' | 'production';
}
