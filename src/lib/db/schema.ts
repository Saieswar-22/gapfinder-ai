import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  pgEnum,
  customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Custom vector type for pgvector
const vector = (dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      return value
        .replace(/[\[\]]/g, '')
        .split(',')
        .map(Number);
    },
  });

// Enums
export const docTypeEnum = pgEnum('doc_type', ['syllabus', 'textbook', 'notes', 'past_paper', 'other']);
export const docStatusEnum = pgEnum('doc_status', ['pending', 'processing', 'ready', 'failed']);
export const topicLevelEnum = pgEnum('topic_level', ['chapter', 'topic', 'subtopic']);
export const classificationEnum = pgEnum('classification', ['weak', 'medium', 'strong', 'insufficient_data']);
export const taskTypeEnum = pgEnum('task_type', ['review', 'practice', 'retest']);

// ─── Users ───
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Login Attempts (rate limiting) ───
export const loginAttempts = pgTable('login_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }).notNull(),
  attemptedAt: timestamp('attempted_at').defaultNow().notNull(),
  success: boolean('success').notNull().default(false),
}, (table) => [
  index('login_attempts_email_idx').on(table.email),
  index('login_attempts_ip_idx').on(table.ipAddress),
]);

// ─── Subjects ───
export const subjects = pgTable('subjects', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('subjects_user_id_idx').on(table.userId),
]);

// ─── Documents ───
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  docType: docTypeEnum('doc_type').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  pageCount: integer('page_count').notNull().default(0),
  status: docStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('documents_subject_hash_idx').on(table.subjectId, table.contentHash),
  index('documents_subject_id_idx').on(table.subjectId),
  index('documents_user_id_idx').on(table.userId),
]);

// ─── Chunks ───
export const chunks = pgTable('chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  pageStart: integer('page_start').notNull(),
  pageEnd: integer('page_end').notNull(),
  text: text('text').notNull(),
  tokenEstimate: integer('token_estimate').notNull(),
  embedding: vector(768)('embedding'),
}, (table) => [
  index('chunks_document_id_idx').on(table.documentId),
  index('chunks_subject_id_idx').on(table.subjectId),
  index('chunks_user_id_idx').on(table.userId),
]);

// ─── Topics (hierarchical) ───
export const topics = pgTable('topics', {
  id: uuid('id').defaultRandom().primaryKey(),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  level: topicLevelEnum('level').notNull(),
  name: varchar('name', { length: 500 }).notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  sourceDocumentId: uuid('source_document_id').references(() => documents.id, { onDelete: 'set null' }),
  sourcePage: integer('source_page'),
  sourceQuote: text('source_quote'),
}, (table) => [
  index('topics_subject_id_idx').on(table.subjectId),
  index('topics_parent_id_idx').on(table.parentId),
]);

// ─── Topic-Chunk mapping ───
export const topicChunks = pgTable('topic_chunks', {
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  chunkId: uuid('chunk_id').notNull().references(() => chunks.id, { onDelete: 'cascade' }),
  score: real('score').notNull(),
}, (table) => [
  primaryKey({ columns: [table.topicId, table.chunkId] }),
]);

// ─── Past Paper Questions ───
export const pastPaperQuestions = pgTable('past_paper_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  page: integer('page').notNull(),
  text: text('text').notNull(),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
}, (table) => [
  index('ppq_subject_id_idx').on(table.subjectId),
]);

// ─── Quizzes ───
export const quizzes = pgTable('quizzes', {
  id: uuid('id').defaultRandom().primaryKey(),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestedCount: integer('requested_count').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('generating'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('quizzes_subject_id_idx').on(table.subjectId),
  index('quizzes_user_id_idx').on(table.userId),
]);

// ─── Questions ───
export const questions = pgTable('questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  subtopicId: uuid('subtopic_id').references(() => topics.id, { onDelete: 'set null' }),
  question: text('question').notNull(),
  options: jsonb('options').notNull(), // string[4]
  correctIndex: integer('correct_index').notNull(),
  explanation: text('explanation').notNull(),
  wrongOptionNotes: jsonb('wrong_option_notes'), // string[3] or object
  sourceChunkIds: jsonb('source_chunk_ids'), // string[]
  citations: jsonb('citations'), // {document: string, page: number}[]
  supportingQuote: text('supporting_quote'),
  embedding: vector(768)('embedding'),
}, (table) => [
  index('questions_quiz_id_idx').on(table.quizId),
  index('questions_topic_id_idx').on(table.topicId),
]);

// ─── Attempts ───
export const attempts = pgTable('attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  total: integer('total').notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
}, (table) => [
  index('attempts_user_id_idx').on(table.userId),
  index('attempts_subject_id_idx').on(table.subjectId),
]);

// ─── Responses ───
export const responses = pgTable('responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  attemptId: uuid('attempt_id').notNull().references(() => attempts.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  selectedIndex: integer('selected_index').notNull(),
  isCorrect: boolean('is_correct').notNull(),
}, (table) => [
  index('responses_attempt_id_idx').on(table.attemptId),
]);

// ─── Gap Reports ───
export const gapReports = pgTable('gap_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  attemptId: uuid('attempt_id').references(() => attempts.id, { onDelete: 'set null' }),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('gap_reports_subject_id_idx').on(table.subjectId),
]);

export const gapReportItems = pgTable('gap_report_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportId: uuid('report_id').notNull().references(() => gapReports.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  attempted: integer('attempted').notNull(),
  correct: integer('correct').notNull(),
  incorrect: integer('incorrect').notNull(),
  accuracy: real('accuracy').notNull(),
  classification: classificationEnum('classification').notNull(),
  reason: text('reason').notNull(),
}, (table) => [
  index('gap_items_report_id_idx').on(table.reportId),
]);

// ─── Revision Plans ───
export const revisionPlans = pgTable('revision_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  daysAvailable: integer('days_available').notNull(),
  minutesPerDay: integer('minutes_per_day').notNull(),
  basedOnAttemptId: uuid('based_on_attempt_id').references(() => attempts.id, { onDelete: 'set null' }),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('plans_subject_id_idx').on(table.subjectId),
  index('plans_user_id_idx').on(table.userId),
]);

export const planTasks = pgTable('plan_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  planId: uuid('plan_id').notNull().references(() => revisionPlans.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  dayNumber: integer('day_number').notNull(),
  taskType: taskTypeEnum('task_type').notNull(),
  description: text('description').notNull(),
  minutes: integer('minutes').notNull(),
  citations: jsonb('citations'),
  completed: boolean('completed').notNull().default(false),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('tasks_plan_id_idx').on(table.planId),
]);

// ─── Relations ───
export const usersRelations = relations(users, ({ many }) => ({
  subjects: many(subjects),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  user: one(users, { fields: [subjects.userId], references: [users.id] }),
  documents: many(documents),
  topics: many(topics),
  quizzes: many(quizzes),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  subject: one(subjects, { fields: [documents.subjectId], references: [subjects.id] }),
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  document: one(documents, { fields: [chunks.documentId], references: [documents.id] }),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, { fields: [topics.subjectId], references: [subjects.id] }),
  parent: one(topics, { fields: [topics.parentId], references: [topics.id] }),
  children: many(topics, { relationName: 'parent_children' }),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  subject: one(subjects, { fields: [quizzes.subjectId], references: [subjects.id] }),
  user: one(users, { fields: [quizzes.userId], references: [users.id] }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  quiz: one(quizzes, { fields: [questions.quizId], references: [quizzes.id] }),
  topic: one(topics, { fields: [questions.topicId], references: [topics.id] }),
}));

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [attempts.quizId], references: [quizzes.id] }),
  user: one(users, { fields: [attempts.userId], references: [users.id] }),
  responses: many(responses),
}));

export const responsesRelations = relations(responses, ({ one }) => ({
  attempt: one(attempts, { fields: [responses.attemptId], references: [attempts.id] }),
  question: one(questions, { fields: [responses.questionId], references: [questions.id] }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Quiz = typeof quizzes.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type Response = typeof responses.$inferSelect;
export type GapReport = typeof gapReports.$inferSelect;
export type GapReportItem = typeof gapReportItems.$inferSelect;
export type RevisionPlan = typeof revisionPlans.$inferSelect;
export type PlanTask = typeof planTasks.$inferSelect;

