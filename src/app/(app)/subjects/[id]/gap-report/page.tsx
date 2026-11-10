'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface GapItem {
  topicId: string;
  topicName: string;
  attempted: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  classification: 'weak' | 'medium' | 'strong' | 'insufficient_data';
  reason: string;
}

export default function GapReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subjectId } = use(params);

  const [items, setItems] = useState<GapItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [pastReports, setPastReports] = useState<any[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Sort state
  const [sortField, setSortField] = useState<'topicName' | 'attempted' | 'accuracy' | 'classification'>('accuracy');
  const [sortAsc, setSortAsc] = useState(true);

  async function loadReport(attemptId?: string) {
    try {
      setLoading(true);
      const url = attemptId
        ? `/api/subjects/${subjectId}/gap-report?attemptId=${attemptId}`
        : `/api/subjects/${subjectId}/gap-report`;

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        setItems(data.items || []);
        setSummary(data.summary || null);
        setPastReports(data.pastReports || []);
      } else {
        setError(data.error || 'Failed to load gap report');
      }
    } catch {
      setError('Network error loading gap report');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport(selectedAttemptId || undefined);
  }, [subjectId, selectedAttemptId]);

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'topicName');
    }
  }

  const sortedItems = [...items].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'topicName') {
      cmp = a.topicName.localeCompare(b.topicName);
    } else if (sortField === 'accuracy') {
      cmp = a.accuracy - b.accuracy;
    } else if (sortField === 'attempted') {
      cmp = a.attempted - b.attempted;
    } else if (sortField === 'classification') {
      const order = { weak: 0, medium: 1, insufficient_data: 2, strong: 3 };
      cmp = order[a.classification] - order[b.classification];
    }
    return sortAsc ? cmp : -cmp;
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <div>
          <h2 className="text-lg font-bold">Knowledge Gap Analysis</h2>
          <p className="text-xs text-gray-500">
            Deterministic evaluation of strengths and weak areas across all syllabus topics.
          </p>
        </div>

        {/* View mode selector */}
        {pastReports.length > 0 && (
          <div className="flex items-center space-x-2">
            <label className="text-xs text-gray-600">Report View:</label>
            <select
              value={selectedAttemptId}
              onChange={(e) => setSelectedAttemptId(e.target.value)}
              className="text-xs border border-gray-300 rounded p-1.5 bg-white"
            >
              <option value="">Cumulative (All Attempts)</option>
              {pastReports.map((r, idx) => (
                <option key={r.id} value={r.attemptId}>
                  Attempt #{pastReports.length - idx} ({new Date(r.createdAt).toLocaleDateString()}) - {r.score}/{r.total}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6 text-center">
          <div className="bg-white border border-gray-200 rounded p-3">
            <span className="text-[11px] text-gray-500 block">Total Attempted</span>
            <span className="text-xl font-bold text-gray-900">{summary.totalAttempted} Qs</span>
          </div>
          <div className="bg-red-50/50 border border-red-200 rounded p-3">
            <span className="text-[11px] text-red-700 font-semibold block">Weak Topics</span>
            <span className="text-xl font-bold text-red-700">{summary.weak}</span>
          </div>
          <div className="bg-amber-50/50 border border-amber-200 rounded p-3">
            <span className="text-[11px] text-amber-700 font-semibold block">Medium</span>
            <span className="text-xl font-bold text-amber-700">{summary.medium}</span>
          </div>
          <div className="bg-green-50/50 border border-green-200 rounded p-3">
            <span className="text-[11px] text-green-700 font-semibold block">Strong</span>
            <span className="text-xl font-bold text-green-700">{summary.strong}</span>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded p-3">
            <span className="text-[11px] text-gray-600 block">Insufficient Data</span>
            <span className="text-xl font-bold text-gray-700">{summary.insufficient_data}</span>
          </div>
        </div>
      )}

      {/* Main Sortable Table */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading gap report...</p>
      ) : sortedItems.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded p-8 text-center text-xs text-gray-500">
          No topic data available yet. Complete a diagnostic quiz to generate your gap report!
        </div>
      ) : (
        <div className="border border-gray-200 rounded overflow-x-auto bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-[10px]">
              <tr>
                <th
                  onClick={() => handleSort('topicName')}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                >
                  Topic {sortField === 'topicName' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  onClick={() => handleSort('attempted')}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                >
                  Attempted {sortField === 'attempted' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th className="px-3 py-2">Correct</th>
                <th className="px-3 py-2">Incorrect</th>
                <th
                  onClick={() => handleSort('accuracy')}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                >
                  Accuracy {sortField === 'accuracy' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  onClick={() => handleSort('classification')}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                >
                  Status {sortField === 'classification' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th className="px-3 py-2">Deterministic Reason</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedItems.map((item) => (
                <tr key={item.topicId} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{item.topicName}</td>
                  <td className="px-3 py-2 text-gray-600">{item.attempted}</td>
                  <td className="px-3 py-2 text-green-700 font-medium">{item.correct}</td>
                  <td className="px-3 py-2 text-red-700 font-medium">{item.incorrect}</td>
                  <td className="px-3 py-2 font-semibold">
                    {item.attempted > 0 ? `${Math.round(item.accuracy * 100)}%` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {item.classification === 'weak' && (
                      <span className="bg-red-100 text-red-800 border border-red-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                        Weak
                      </span>
                    )}
                    {item.classification === 'medium' && (
                      <span className="bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        Medium
                      </span>
                    )}
                    {item.classification === 'strong' && (
                      <span className="bg-green-100 text-green-800 border border-green-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                        Strong
                      </span>
                    )}
                    {item.classification === 'insufficient_data' && (
                      <span className="bg-gray-100 text-gray-700 border border-gray-200 px-1.5 py-0.5 rounded text-[10px]">
                        Insufficient Data
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-[11px] max-w-xs">{item.reason}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {item.classification === 'weak' && (
                      <Link
                        href={`/subjects/${subjectId}/assistant?topic=${encodeURIComponent(item.topicName)}`}
                        className="text-blue-600 hover:underline text-[11px] mr-2"
                      >
                        Explain Topic →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

