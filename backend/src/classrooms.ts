import type { User } from './types.js';

export interface Classroom {
  id: number; teacher_id: number; teacher_name: string; name: string; section: string;
  join_code: string; archived: boolean; member_count: number; created_at: string;
}
export interface ClassMember { id: number; name: string; joined_at: string }
export interface Announcement { id: number; class_id: number; author_id: number; author_name: string; body: string; created_at: string }
export interface ClassPatch { name?: string; section?: string; archived?: true }
export interface ClassStore {
  list(user: User): Promise<Classroom[]>;
  get(id: number): Promise<Classroom | undefined>;
  getByCode(code: string): Promise<Classroom | undefined>;
  isMember(classId: number, userId: number): Promise<boolean>;
  create(teacher: User, input: { name: string; section: string; join_code: string }): Promise<number>;
  update(id: number, teacherId: number, input: ClassPatch): Promise<boolean>;
  addMember(classId: number, userId: number): Promise<boolean>;
  removeMember(classId: number, teacherId: number, userId: number): Promise<boolean>;
  members(classId: number): Promise<ClassMember[]>;
  announcements(classId: number): Promise<Announcement[]>;
  post(classId: number, teacherId: number, body: string): Promise<Announcement | undefined>;
}
