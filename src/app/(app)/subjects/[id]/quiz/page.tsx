'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface QuestionItem {
  id: string;
  topicId: string;
  topicName: string;
  question: string;
  options: string[];
  citations: { document: string; page: number }[];
}

interface AttemptReviewItem {
  responseId: string;
  selectedIndex: number;
  isCorrect: boolean;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  wrongOptionNotes: string[];
  citations: { document: string; page: number }[];
  supportingQuote: string;
  topicName: string;
}

export default function QuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subjectId } = use(params);

  // Setup state
  const [requestedCount, setRequestedCount] = useState(10);
  const [topicFilterId, setTopicFilterId] = useState<string>('');
  const [availableTopics, setAvailableTopics] = useState<{ id: string; name: string }[]>([]);
  const [pastAttempts, setPastAttempts] = useState<any[]>([]);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  // Active quiz state
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showReviewMode, setShowReviewMode] = useState(false);

  // Completed results state
  const [completedAttemptId, setCompletedAttemptId] = useState<string | null>(null);
  const [attemptDetails, setAttemptDetails] = useState<any>(null);
  const [reviewQuestions, setReviewQuestions] = useState<AttemptReviewItem[]>([]);

  // Load topics and past attempts
  useEffect(() => {
    async function init() {
      try {
        const [topRes, qRes] = await Promise.all([
          fetch(`/api/subjects/${subjectId}/topics`),
          fetch(`/api/subjects/${subjectId}/quizzes`),
        ]);

        if (topRes.ok) {
          const topData = await topRes.json();
          // Flatten tree into list
          const flat: { id: string; name: string }[] = [];
          function flatten(nodes: any[]) {
            for (const n of nodes) {
              flat.push({ id: n.id, name: `${n.level === 'chapter' ? '📂 ' : '• '}${n.name}` });
              if (n.children) flatten(n.children);
            }
          }
          flatten(topData.topics || []);
          setAvailableTopics(flat);
        }

        if (qRes.ok) {
          const qData = await qRes.json();
          setPastAttempts(qData.attempts || []);
        }
      } catch {
        setError('Network error initializing quiz');
      }
    }
    init();
  }, [subjectId]);

  async function handleStartQuiz(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setWarning('');
    setGenerating(true);

    try {
      const res = await fetch(`/api/subjects/${subjectId}/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedCount: Number(requestedCount),
          topicFilterId: topicFilterId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to generate quiz');
        setGenerating(false);
        return;
      }

      if (data.warning) {
        setWarning(data.warning);
      }

      // Fetch created quiz questions
      const quizRes = await fetch(`/api/quizzes/${data.quizId}`);
      const quizData = await quizRes.json();

      if (quizRes.ok && quizData.questions?.length > 0) {
        setActiveQuizId(data.quizId);
        setQuestions(quizData.questions);
        setCurrentIndex(0);
        setSelectedAnswers({});
        setCompletedAttemptId(null);
      } else {
        setError('No questions were generated. Ensure study materials are uploaded and mapped.');
      }
    } catch {
      setError('Network error starting quiz');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmitQuiz() {
    if (!activeQuizId) return;

    // Check if unanswered questions exist
    const answeredCount = Object.keys(selectedAnswers).length;
    if (answeredCount < questions.length) {
      if (!confirm(`You have only answered ${answeredCount} of ${questions.length} questions. Submit anyway?`)) {
        return;
      }
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        answers: questions.map((q) => ({
          questionId: q.id,
          selectedIndex: selectedAnswers[q.id] ?? -1,
        })),
      };

      const res = await fetch(`/api/quizzes/${activeQuizId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setActiveQuizId(null);
        await loadAttemptReview(data.attemptId);
      } else {
        setError(data.error || 'Failed to submit quiz');
      }
    } catch {
      setError('Network error submitting quiz');
    } finally {
      setSubmitting(false);
    }
  }

  async function loadAttemptReview(attemptId: string) {
    try {
      const res = await fetch(`/api/attempts/${attemptId}`);
      const data = await res.json();
      if (res.ok) {
        setCompletedAttemptId(attemptId);
        setAttemptDetails(data.attempt);
        setReviewQuestions(data.questions || []);

        // Refresh past attempts list
        const qRes = await fetch(`/api/subjects/${subjectId}/quizzes`);
        if (qRes.ok) {
          const qData = await qRes.json();
          setPastAttempts(qData.attempts || []);
        }
      }
    } catch {
      setError('Failed to load attempt review');
    }
  }

  // 1. ACTIVE QUIZ TAKING VIEW
  if (activeQuizId && questions.length > 0) {
    const currentQ = questions[currentIndex];
    const selectedOption = selectedAnswers[currentQ.id];

    return (
      <div>
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-6">
          <div>
            <span className="text-xs text-gray-500 block">Diagnostic Assessment</span>
            <span className="font-semibold text-sm">
              Question {currentIndex + 1} of {questions.length}
            </span>
          </div>
          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-mono">
            Topic: {currentQ.topicName}
          </span>
        </div>

        {/* Question card */}
        <div className="border border-gray-200 rounded p-6 bg-white mb-6">
          <p className="font-semibold text-base text-gray-900 mb-4">{currentQ.question}</p>

          <div className="space-y-3">
            {currentQ.options.map((option, idx) => (
              <label
                key={idx}
                className={`flex items-start p-3 border rounded cursor-pointer text-sm transition-colors ${
                  selectedOption === idx
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-800'
                }`}
              >
                <input
                  type="radio"
                  name={`q-${currentQ.id}`}
                  checked={selectedOption === idx}
                  onChange={() => setSelectedAnswers((prev) => ({ ...prev, [currentQ.id]: idx }))}
                  className="mt-1 mr-3 text-blue-600"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>

          {currentQ.citations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-400">
              Source: {currentQ.citations.map((c) => `${c.document} (p. ${c.page})`).join(', ')}
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((prev) => prev - 1)}
            className="border border-gray-300 text-gray-700 text-xs px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            ← Previous
          </button>

          <div className="flex space-x-2">
            {currentIndex < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => prev + 1)}
                className="bg-blue-600 text-white text-xs px-4 py-2 rounded hover:bg-blue-700 font-medium"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitQuiz}
                className="bg-green-600 text-white text-xs px-6 py-2 rounded hover:bg-green-700 font-bold disabled:opacity-50"
              >
                {submitting ? 'Evaluating...' : 'Submit Quiz'}
              </button>
            )}
          </div>
        </div>

        {/* Quick Question Selector */}
        <div className="mt-8 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2">Jump to question:</p>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-7 h-7 text-xs rounded border ${
                  currentIndex === idx
                    ? 'border-blue-600 bg-blue-600 text-white font-bold'
                    : selectedAnswers[q.id] !== undefined
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 2. RESULTS / REVIEW VIEW
  if (completedAttemptId && attemptDetails) {
    const pct = Math.round((attemptDetails.score / attemptDetails.total) * 100);

    return (
      <div>
        <div className="border border-gray-200 rounded p-6 bg-white mb-6">
          <div className="flex items-center justify-between border-b border-gray-200 pb-4 mb-4">
            <div>
              <span className="text-xs text-gray-500 block">Assessment Complete</span>
              <h2 className="text-xl font-bold">Quiz Results</h2>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-blue-600">
                {attemptDetails.score} / {attemptDetails.total}
              </span>
              <span className="text-xs text-gray-500 block">Accuracy: {pct}%</span>
            </div>
          </div>

          <div className="flex space-x-3">
            <Link
              href={`/subjects/${subjectId}/gap-report`}
              className="bg-blue-600 text-white text-xs px-4 py-2 rounded hover:bg-blue-700 font-medium"
            >
              View Gap Analysis Report →
            </Link>
            <button
              onClick={() => {
                setCompletedAttemptId(null);
                setAttemptDetails(null);
                setReviewQuestions([]);
              }}
              className="border border-gray-300 text-gray-700 text-xs px-4 py-2 rounded hover:bg-gray-50"
            >
              Take Another Quiz
            </button>
          </div>
        </div>

        {/* Per-Question Review List */}
        <h3 className="font-semibold text-sm mb-3">Detailed Question Review</h3>
        <div className="space-y-4">
          {reviewQuestions.map((q, idx) => (
            <div
              key={q.responseId}
              className={`border rounded p-4 text-xs ${
                q.isCorrect ? 'border-green-200 bg-green-50/20' : 'border-red-200 bg-red-50/20'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-gray-700">
                  Question {idx + 1} • Topic: {q.topicName}
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                    q.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {q.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                </span>
              </div>

              <p className="font-semibold text-gray-900 text-sm mb-3">{q.question}</p>

              <div className="space-y-1.5 mb-3">
                {q.options.map((opt, oIdx) => {
                  const isUserPick = q.selectedIndex === oIdx;
                  const isRight = q.correctIndex === oIdx;

                  let style = 'border-gray-200 bg-white text-gray-700';
                  if (isRight) {
                    style = 'border-green-500 bg-green-50 text-green-900 font-semibold';
                  } else if (isUserPick && !isRight) {
                    style = 'border-red-500 bg-red-50 text-red-900 line-through';
                  }

                  return (
                    <div key={oIdx} className={`p-2 border rounded flex items-center justify-between ${style}`}>
                      <span>
                        {String.fromCharCode(65 + oIdx)}. {opt}
                      </span>
                      {isRight && <span className="text-[10px] text-green-700 font-bold ml-2">Correct Answer</span>}
                      {isUserPick && !isRight && (
                        <span className="text-[10px] text-red-700 font-bold ml-2">Your Answer</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="bg-white p-3 rounded border border-gray-200 space-y-1.5 text-gray-700">
                <p>
                  <span className="font-semibold text-gray-900">Explanation:</span> {q.explanation}
                </p>
                {q.supportingQuote && (
                  <p className="italic text-gray-500">
                    <span className="font-semibold not-italic text-gray-900">Source Quote:</span> "
                    {q.supportingQuote}"
                  </p>
                )}
                {q.citations && q.citations.length > 0 && (
                  <p className="text-[10px] text-gray-400">
                    Sources: {q.citations.map((c) => `${c.document} (p. ${c.page})`).join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 3. QUIZ SETUP & HISTORY VIEW
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold">Diagnostic Quiz</h2>
        <p className="text-xs text-gray-500">
          Answer multiple choice questions grounded strictly in your study material to identify gaps in knowledge.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 mb-4">
          {error}
        </div>
      )}

      {warning && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 mb-4">
          {warning}
        </div>
      )}

      {/* Start Quiz Form */}
      <div className="border border-gray-200 rounded p-4 mb-8 bg-gray-50">
        <h3 className="font-semibold text-sm mb-3">Configure Diagnostic Quiz</h3>
        <form onSubmit={handleStartQuiz} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Number of Questions (5 - 30)
              </label>
              <input
                type="number"
                min={5}
                max={30}
                value={requestedCount}
                onChange={(e) => setRequestedCount(Number(e.target.value))}
                className="w-full text-xs border border-gray-300 rounded p-2 bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Focus on Topic (Optional)
              </label>
              <select
                value={topicFilterId}
                onChange={(e) => setTopicFilterId(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded p-2 bg-white"
              >
                <option value="">All Topics (Balanced Coverage)</option>
                {availableTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={generating}
            className="bg-blue-600 text-white text-xs px-5 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {generating ? 'Generating Questions from Sources...' : 'Start Diagnostic Quiz'}
          </button>
        </form>
      </div>

      {/* Past Quiz Attempts */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Past Assessment History ({pastAttempts.length})</h3>

        {pastAttempts.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded p-6 text-center text-xs text-gray-400">
            No quiz attempts yet. Start your first diagnostic quiz above!
          </div>
        ) : (
          <div className="border border-gray-200 rounded divide-y divide-gray-200 bg-white">
            {pastAttempts.map((att, idx) => (
              <div key={att.id} className="p-3 flex items-center justify-between text-xs hover:bg-gray-50">
                <div>
                  <span className="font-medium text-gray-900 block">
                    Attempt #{pastAttempts.length - idx}
                  </span>
                  <span className="text-gray-400 text-[10px]">
                    {new Date(att.submittedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="font-bold text-blue-600">
                    {att.score} / {att.total} ({Math.round((att.score / att.total) * 100)}%)
                  </span>
                  <button
                    onClick={() => loadAttemptReview(att.id)}
                    className="border border-gray-300 rounded px-2.5 py-1 text-gray-700 hover:bg-gray-100"
                  >
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

