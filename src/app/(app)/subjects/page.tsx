'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Subject {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  documentCount: number;
}

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function loadSubjects() {
    try {
      setLoading(true);
      const res = await fetch('/api/subjects');
      const data = await res.json();
      if (res.ok) {
        setSubjects(data.subjects || []);
      } else {
        setError(data.error || 'Failed to load subjects');
      }
    } catch {
      setError('Network error while loading subjects');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubjects();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setError('');
    setCreating(true);

    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setName('');
        setDescription('');
        await loadSubjects();
      } else {
        setError(data.error || 'Failed to create subject');
      }
    } catch {
      setError('Network error creating subject');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, subjectName: string) {
    if (!confirm(`Are you sure you want to delete "${subjectName}" and all its materials, quizzes, and plans?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/subjects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSubjects((prev) => prev.filter((s) => s.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch {
      alert('Network error deleting subject');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Subjects</h1>
          <p className="text-sm text-gray-500">Manage your study subjects and materials</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* Create Subject Form */}
      <div className="border border-gray-200 rounded p-4 mb-8 bg-gray-50">
        <h2 className="font-semibold text-base mb-3">Add New Subject</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subject Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. A-Level Mathematics, Organic Chemistry"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Board exam syllabus covering chapters 1 through 10"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Subject'}
          </button>
        </form>
      </div>

      {/* Subjects List */}
      <div>
        <h2 className="font-semibold text-base mb-3">Your Subjects</h2>

        {loading ? (
          <p className="text-sm text-gray-500">Loading subjects...</p>
        ) : subjects.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded p-6 text-center text-sm text-gray-500">
            No subjects yet. Add your first subject above to get started.
          </div>
        ) : (
          <div className="border border-gray-200 rounded divide-y divide-gray-200">
            {subjects.map((s) => (
              <div key={s.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <Link
                    href={`/subjects/${s.id}/documents`}
                    className="font-semibold text-blue-600 hover:underline text-base"
                  >
                    {s.name}
                  </Link>
                  {s.description && <p className="text-sm text-gray-600 mt-0.5">{s.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {s.documentCount} document{s.documentCount === 1 ? '' : 's'} • Created on{' '}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <Link
                    href={`/subjects/${s.id}/documents`}
                    className="border border-gray-300 rounded px-3 py-1 hover:bg-white"
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => handleDelete(s.id, s.name)}
                    className="text-red-600 hover:text-red-800 text-xs"
                  >
                    Delete
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
