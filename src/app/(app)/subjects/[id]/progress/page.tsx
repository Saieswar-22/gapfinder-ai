'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';

interface ProgressData {
  totalAttempts: number;
  overallAccuracy: number;
  classifications: {
    weak: number;
    medium: number;
    strong: number;
    insufficient_data: number;
  };
  topicAccuracy: { topic: string; accuracy: number }[];
  scoreOverAttempts: { attempt: string; date: string; accuracy: number; score: number; total: number }[];
  topicImprovement: {
    topic: string;
    firstAccuracy: number;
    latestAccuracy: number;
    change: number;
  }[];
  planProgress: {
    version: number;
    completedTasks: number;
    totalTasks: number;
    percentage: number;
  } | null;
}

export default function ProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subjectId } = use(params);

  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/subjects/${subjectId}/progress`);
        const json = await res.json();
        if (res.ok) {
          setData(json);
        } else {
          setError(json.error || 'Failed to load progress');
        }
      } catch {
        setError('Network error loading progress');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subjectId]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading progress data...</p>;
  }

  if (error) {
    return <div className="p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200">{error}</div>;
  }

  if (!data || data.totalAttempts === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded p-8 text-center text-xs text-gray-500 space-y-2">
        <p className="font-semibold text-gray-700">No assessment progress recorded yet.</p>
        <p>Take your first diagnostic quiz to begin tracking mastery and improvements over time.</p>
        <Link
          href={`/subjects/${subjectId}/quiz`}
          className="inline-block mt-2 bg-blue-600 text-white text-xs px-4 py-2 rounded hover:bg-blue-700"
        >
          Start Diagnostic Quiz →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold">Subject Learning Progress</h2>
        <p className="text-xs text-gray-500">
          Real metrics and historical tracking computed directly from your submitted quizzes and revision tasks.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="border border-gray-200 rounded p-3 bg-white">
          <span className="text-[11px] text-gray-500 block">Total Quizzes</span>
          <span className="text-2xl font-bold mt-0.5 block">{data.totalAttempts}</span>
        </div>
        <div className="border border-gray-200 rounded p-3 bg-white">
          <span className="text-[11px] text-gray-500 block">Overall Accuracy</span>
          <span className="text-2xl font-bold mt-0.5 text-blue-600 block">{data.overallAccuracy}%</span>
        </div>
        <div className="border border-red-200 rounded p-3 bg-red-50/40">
          <span className="text-[11px] text-red-700 font-semibold block">Weak Topics</span>
          <span className="text-2xl font-bold mt-0.5 text-red-700 block">{data.classifications.weak}</span>
        </div>
        <div className="border border-green-200 rounded p-3 bg-green-50/40">
          <span className="text-[11px] text-green-700 font-semibold block">Strong Topics</span>
          <span className="text-2xl font-bold mt-0.5 text-green-700 block">{data.classifications.strong}</span>
        </div>
      </div>

      {/* Active Revision Plan Status */}
      {data.planProgress && (
        <div className="border border-gray-200 rounded p-4 mb-6 bg-gray-50">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-gray-800">
              Active Revision Plan (v{data.planProgress.version}) Progress
            </span>
            <span className="font-bold text-blue-600">
              {data.planProgress.completedTasks}/{data.planProgress.totalTasks} tasks ({data.planProgress.percentage}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 h-2 rounded overflow-hidden">
            <div
              className="bg-blue-600 h-2 transition-all duration-300"
              style={{ width: `${data.planProgress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Chart 1: Topic-wise Accuracy (Bar Chart) */}
      {data.topicAccuracy.length > 0 && (
        <div className="border border-gray-200 rounded p-4 mb-6 bg-white">
          <h3 className="font-semibold text-xs text-gray-700 mb-3 uppercase tracking-wide">
            Accuracy per Topic (%)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topicAccuracy} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="topic" angle={-25} textAnchor="end" interval={0} tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: any) => [`${value}%`, 'Accuracy']} />
                <Bar dataKey="accuracy" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Chart 2: Score Over Attempts (Line Chart) */}
      {data.scoreOverAttempts.length > 1 && (
        <div className="border border-gray-200 rounded p-4 mb-6 bg-white">
          <h3 className="font-semibold text-xs text-gray-700 mb-3 uppercase tracking-wide">
            Score Progression Over Attempts (%)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.scoreOverAttempts} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="attempt" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: any, name: any, item: any) => [
                    `${value}% (${item.payload.score}/${item.payload.total}) on ${item.payload.date}`,
                    'Score',
                  ]}
                />
                <Line type="monotone" dataKey="accuracy" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Topic Improvement Table */}
      {data.topicImprovement.length > 0 && (
        <div className="border border-gray-200 rounded p-4 bg-white mb-6">
          <h3 className="font-semibold text-xs text-gray-700 mb-2 uppercase tracking-wide">
            Topic Improvement (First vs. Latest Attempt)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2">Topic</th>
                  <th className="px-3 py-2">First Attempt</th>
                  <th className="px-3 py-2">Latest Attempt</th>
                  <th className="px-3 py-2">Net Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.topicImprovement.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{item.topic}</td>
                    <td className="px-3 py-2 text-gray-600">{item.firstAccuracy}%</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{item.latestAccuracy}%</td>
                    <td className="px-3 py-2">
                      <span
                        className={`font-bold ${
                          item.change > 0
                            ? 'text-green-600'
                            : item.change < 0
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {item.change > 0 ? `+${item.change}%` : `${item.change}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

