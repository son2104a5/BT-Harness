import fs from 'node:fs/promises';
import path from 'node:path';
import { Rubric, StudentSubmission, GradeRecord } from './types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const RUBRIC_PATH = path.join(DATA_DIR, 'rubric.json');
const STUDENTS_PATH = path.join(DATA_DIR, 'students.json');
const GRADES_PATH = path.join(DATA_DIR, 'grades.json');

export async function loadRubric(assignmentId?: string): Promise<Rubric> {
  const content = await fs.readFile(RUBRIC_PATH, 'utf-8');
  const rubric: Rubric = JSON.parse(content);
  if (assignmentId && rubric.assignmentId !== assignmentId) {
    throw new Error(`Không tìm thấy rubric cho bài tập '${assignmentId}'.`);
  }
  return rubric;
}

export async function getStudents(pendingOnly: boolean = false): Promise<StudentSubmission[]> {
  const content = await fs.readFile(STUDENTS_PATH, 'utf-8');
  const students: StudentSubmission[] = JSON.parse(content);
  if (pendingOnly) {
    return students.filter(s => s.status === 'pending');
  }
  return students;
}

export async function getStudentById(studentId: string): Promise<StudentSubmission | null> {
  const students = await getStudents(false);
  const found = students.find(s => s.studentId.toUpperCase() === studentId.trim().toUpperCase());
  return found || null;
}

export async function saveGradeRecord(record: GradeRecord): Promise<void> {
  // 1. Read and append to grades.json
  let grades: GradeRecord[] = [];
  try {
    const content = await fs.readFile(GRADES_PATH, 'utf-8');
    grades = JSON.parse(content);
  } catch {
    grades = [];
  }

  // Remove existing grade for this student if re-grading
  grades = grades.filter(g =>
    g.studentId.toUpperCase() !== record.studentId.toUpperCase() ||
    g.assignmentId.toUpperCase() !== record.assignmentId.toUpperCase()
  );
  grades.push(record);
  await fs.writeFile(GRADES_PATH, JSON.stringify(grades, null, 2), 'utf-8');

  // 2. Update student status in students.json
  const students = await getStudents(false);
  const student = students.find(s => s.studentId.toUpperCase() === record.studentId.toUpperCase());
  if (student) {
    student.status = 'graded';
    await fs.writeFile(STUDENTS_PATH, JSON.stringify(students, null, 2), 'utf-8');
  }
}
