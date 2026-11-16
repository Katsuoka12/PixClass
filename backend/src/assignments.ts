import type { User } from './types.js';

export interface Assignment {
  id: number; class_id: number; class_name: string; class_archived: boolean;
  title: string; description: string; due_at: string | null; max_points: number;
  allow_late: boolean; created_at: string;
}
export interface AssignmentInput { title: string; description: string; due_at: string | null; max_points: number; allow_late: boolean }
export interface Submission {
  id: number; assignment_id: number; student_id: number; answer_text: string;
  file_path: string | null; original_name: string | null; submitted_at: string;
  grade: number | null; feedback: string | null; graded_at: string | null; is_late: boolean;
}
export interface SubmissionInput { answer_text: string; file?: { file_path: string; original_name: string }; remove_file: boolean }
export interface SubmissionRow { student_id: number; student_name: string; status: 'missing' | 'submitted' | 'late'; submission: Submission | null }
export interface Gradebook { assignments: Assignment[]; students: { id: number; name: string; submissions: Submission[] }[] }
export interface TodoRow { assignment: Assignment; submission: Submission | null; status: 'missing' | 'submitted' | 'late' | 'graded' }
export interface AssignmentStore {
  list(classId: number, user: User): Promise<Assignment[]>;
  get(id: number, user: User): Promise<Assignment>;
  create(classId: number, user: User, input: AssignmentInput): Promise<Assignment>;
  update(id: number, user: User, input: Partial<AssignmentInput>): Promise<Assignment>;
  delete(id: number, user: User): Promise<string[]>;
  getSubmission(assignmentId: number, user: User): Promise<Submission | null>;
  submit(assignmentId: number, user: User, input: SubmissionInput): Promise<{ submission: Submission; replacedFile: string | null }>;
  submissions(assignmentId: number, user: User): Promise<SubmissionRow[]>;
  grade(submissionId: number, user: User, input: { grade: number; feedback: string }): Promise<Submission>;
  file(submissionId: number, user: User): Promise<Submission>;
  gradebook(classId: number, user: User): Promise<Gradebook>;
  todo(user: User): Promise<TodoRow[]>;
}
