export interface RubricCriterion {
  id: string;
  name: string;
  maxScore: number;
  description: string;
}

export interface Rubric {
  assignmentId: string;
  assignmentTitle: string;
  totalMaxScore: number;
  criteria: RubricCriterion[];
}

export interface StudentSubmission {
  studentId: string;
  fullName: string;
  assignmentId: string;
  status: 'pending' | 'graded';
  submissionCode: string;
  filePath?: string;
}

export interface GradeRecord {
  studentId: string;
  assignmentId: string;
  scores: Record<string, number>;
  totalScore: number;
  feedback: string;
  gradedAt: string;
  approvedBy: string;
}

export interface ToolApprovalRequest {
  toolName: string;
  studentId: string;
  studentName?: string;
  scores: Record<string, number>;
  totalScore: number;
  feedback: string;
}

export interface CostBreakdown {
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;
  costVND: number;
  cacheSavingsUSD: number;
  cacheHitRatio: number;
}
