import type { ApiResponse, Assignment, AssignmentInput, Gradebook, PublicSubmission, SubmissionRow, TodoRow } from '~/types/api';

export function useAssignments() {
  const api = useApi();
  return {
    list: (classId: number) => api<ApiResponse<{ assignments: Assignment[] }>>(`/classes/${classId}/assignments`),
    get: (id: number) => api<ApiResponse<{ assignment: Assignment }>>(`/assignments/${id}`),
    create: (classId: number, input: AssignmentInput) => api<ApiResponse<{ assignment: Assignment }>>(`/classes/${classId}/assignments`, { method: 'POST', body: input }),
    update: (id: number, input: AssignmentInput) => api<ApiResponse<{ assignment: Assignment }>>(`/assignments/${id}`, { method: 'PATCH', body: input }),
    remove: (id: number) => api(`/assignments/${id}`, { method: 'DELETE' }),
    ownSubmission: (id: number) => api<ApiResponse<{ submission: PublicSubmission | null }>>(`/assignments/${id}/submission`),
    submit: (id: number, body: FormData | { answer_text: string; remove_file: boolean }) => api<ApiResponse<{ submission: PublicSubmission }>>(`/assignments/${id}/submission`, { method: 'PUT', body, ...(body instanceof FormData ? { timeout: 120000 } : {}) }),
    submissions: (id: number) => api<ApiResponse<{ submissions: SubmissionRow[] }>>(`/assignments/${id}/submissions`),
    grade: (id: number, input: { grade: number; feedback: string }) => api<ApiResponse<{ submission: PublicSubmission }>>(`/submissions/${id}/grade`, { method: 'PATCH', body: input }),
    gradebook: (classId: number) => api<ApiResponse<Gradebook>>(`/classes/${classId}/gradebook`),
    todo: () => api<ApiResponse<{ items: TodoRow[] }>>('/me/todo'),
  };
}

export function assignmentStatus(status: SubmissionRow['status'] | 'graded'): string {
  return { missing: 'ยังไม่ส่ง', submitted: 'ส่งแล้ว', late: 'ส่งช้า', graded: 'ตรวจแล้ว' }[status];
}
