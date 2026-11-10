'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface DashboardData {
  totalSubjects: number;
  totalDocs: number;
  totalAttempts: number;
  overallAccuracy: number;
  classifications: {
    weak: number;
    medium: number;
    strong: number;
    insufficient_data: number;
  };
  recentSubjects: { id: string; name: string; createdAt: string }[];
  recentAttempts: {
    id: string;
    subjectId: string;
    subjectName: string;
    score: number;
    total: number;
    submittedAt: string;
  }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/dashboard');
        const json = await res.json();
        if (res.ok) {
          setData(json);
        } else {
          setError(json.error || 'Failed to load dashboard');
        }
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading dashboard...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!data) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-xs text-gray-500">Overview of your diagnostic assessments and study materials</p>
        </div>
        <Link
          href="/subjects"
          className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 font-medium"
        >
          View Subjects
        </Link>
      </div>

      {/* Metric Cards (Plain borders, no heavy shadows) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="border border-gray-200 rounded p-4 bg-white">
          <p className="text-xs text-gray-500">Total Subjects</p>
          <p className="text-2xl font-bold mt-1">{data.totalSubjects}</p>
        </div>
        <div className="border border-gray-200 rounded p-4 bg-white">
          <p className="text-xs text-gray-500">Materials Uploaded</p>
          <p className="text-2xl font-bold mt-1">{data.totalDocs}</p>
        </div>
        <div className="border border-gray-200 rounded p-4 bg-white">
          <p className="text-xs text-gray-500">Quizzes Completed</p>
          <p className="text-2xl font-bold mt-1">{data.totalAttempts}</p>
        </div>
        <div className="border border-gray-200 rounded p-4 bg-white">
          <p className="text-xs text-gray-500">Overall Accuracy</p>
          <p className="text-2xl font-bold mt-1 text-blue-600">{data.overallAccuracy}%</p>
        </div>
      </div>

      {/* Gap Distribution */}
      <div className="border border-gray-200 rounded p-4 mb-8 bg-gray-50">
        <h2 className="font-semibold text-sm mb-3">Topic Gap Distribution</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="bg-white border border-red-200 rounded p-2.5">
            <span className="text-xs font-semibold text-red-600 block">Weak Areas</span>
            <span className="text-xl font-bold text-red-700">{data.classifications.weak}</span>
          </div>
          <div className="bg-white border border-amber-200 rounded p-2.5">
            <span className="text-xs font-semibold text-amber-600 block">Medium</span>
            <span className="text-xl font-bold text-amber-700">{data.classifications.medium}</span>
          </div>
          <div className="bg-white border border-green-200 rounded p-2.5">
            <span className="text-xs font-semibold text-green-600 block">Strong</span>
            <span className="text-xl font-bold text-green-700">{data.classifications.strong}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2.5">
            <span className="text-xs font-semibold text-gray-500 block">Insufficient Data</span>
            <span className="text-xl font-bold text-gray-700">{data.classifications.insufficient_data}</span>
          </div>
        </div>
      </div>

      {/* Recent Subjects & Recent Attempts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm">Your Subjects</h2>
            <Link href="/subjects" className="text-xs text-blue-600 hover:underline">
              Manage
            </Link>
          </div>
          {data.recentSubjects.length === 0 ? (
            <div className="border border-dashed border-gray-200 rounded p-4 text-center text-xs text-gray-400">
              No subjects created yet.
            </div>
          ) : (
            <div className="border border-gray-200 rounded divide-y divide-gray-100 bg-white">
              {data.recentSubjects.map((s) => (
                <div key={s.id} className="p-3 flex items-center justify-between">
                  <Link
                    href={`/subjects/${s.id}/documents`}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    {s.name}
                  </Link>
                  <span className="text-[10px] text-gray-400">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-semibold text-sm mb-2">Recent Assessments</h2>
          {data.recentAttempts.length === 0 ? (
            <div className="border border-dashed border-gray-200 rounded p-4 text-center text-xs text-gray-400">
              No quiz attempts yet. Start a diagnostic quiz inside a subject.
            </div>
          ) : (
            <div className="border border-gray-200 rounded divide-y divide-gray-100 bg-white">
              {data.recentAttempts.map((a) => (
                <div key={a.id} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium text-gray-900">{a.subjectName}</span>
                    <span className="text-gray-400 block text-[10px]">
                      {new Date(a.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="font-bold text-blue-600">
                    {a.score}/{a.total} ({Math.round((a.score / a.total) * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

