'use client';

import { useState, useEffect, use } from 'react';

interface TopicNode {
  id: string;
  parentId: string | null;
  level: 'chapter' | 'topic' | 'subtopic';
  name: string;
  sourcePage: number | null;
  sourceQuote: string | null;
  linkedMaterials: {
    documentName: string;
    pageStart: number;
    pageEnd: number;
    score: number;
  }[];
  linkedQuestions: {
    id: string;
    page: number;
    text: string;
  }[];
  children: TopicNode[];
}

export default function TopicMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subjectId } = use(params);

  const [topicTree, setTopicTree] = useState<TopicNode[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function loadTopics() {
    try {
      setLoading(true);
      const res = await fetch(`/api/subjects/${subjectId}/topics`);
      const data = await res.json();
      if (res.ok) {
        setTopicTree(data.topics || []);
        setTotalCount(data.totalCount || 0);
      } else {
        setError(data.error || 'Failed to load topic map');
      }
    } catch {
      setError('Network error loading topic map');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTopics();
  }, [subjectId]);

  async function handleGenerate() {
    setError('');
    setSuccessMsg('');
    setGenerating(true);

    try {
      const res = await fetch(`/api/subjects/${subjectId}/topics/generate`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        setSuccessMsg(
          `Topic Map generated: ${data.result.chapterCount} chapters, ${data.result.topicCount} topics, ${data.result.subtopicCount} subtopics extracted.${
            data.result.isLowerConfidence ? ' (Extracted from general notes - upload syllabus for higher fidelity)' : ''
          }`
        );
        await loadTopics();
      } else {
        setError(data.error || 'Topic map generation failed');
      }
    } catch {
      setError('Network error while generating topic map');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`/api/topics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        setEditingId(null);
        await loadTopics();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to rename');
      }
    } catch {
      alert('Network error renaming topic');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete topic node "${name}"?`)) return;

    try {
      const res = await fetch(`/api/topics/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadTopics();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch {
      alert('Network error deleting topic');
    }
  }

  function renderNode(node: TopicNode, depth = 0) {
    const isEditing = editingId === node.id;
    const paddingLeft = `${depth * 24}px`;

    return (
      <div key={node.id} className="mb-2">
        <div
          style={{ paddingLeft }}
          className="flex items-start justify-between py-2 border-b border-gray-100 hover:bg-gray-50"
        >
          <div className="flex-1 pr-4">
            <div className="flex items-center space-x-2">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${
                  node.level === 'chapter'
                    ? 'bg-blue-100 text-blue-800 font-bold'
                    : node.level === 'topic'
                    ? 'bg-gray-200 text-gray-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {node.level}
              </span>

              {isEditing ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-0.5 text-xs"
                    autoFocus
                  />
                  <button
                    onClick={() => handleRename(node.id)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs text-gray-400 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span className="text-sm font-medium text-gray-900">{node.name}</span>
              )}
            </div>

            {/* Source quote from syllabus */}
            {node.sourceQuote && (
              <p className="text-[11px] text-gray-500 italic mt-0.5">
                "{node.sourceQuote}" (p. {node.sourcePage || 1})
              </p>
            )}

            {/* Linked non-syllabus materials */}
            <div className="mt-1">
              {node.linkedMaterials.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {node.linkedMaterials.map((m, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded"
                    >
                      {m.documentName} pp. {m.pageStart}-{m.pageEnd} (
                      {Math.round(m.score * 100)}% match)
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  No supporting material found
                </span>
              )}
            </div>

            {/* Linked past paper questions */}
            {node.linkedQuestions.length > 0 && (
              <div className="mt-1">
                <p className="text-[10px] font-semibold text-gray-600">Past Paper Questions:</p>
                {node.linkedQuestions.map((q) => (
                  <p key={q.id} className="text-[10px] text-gray-600 pl-2">
                    • p. {q.page}: {q.text.slice(0, 80)}...
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 text-xs text-gray-400 pt-0.5">
            {!isEditing && (
              <button
                onClick={() => {
                  setEditingId(node.id);
                  setEditName(node.name);
                }}
                className="hover:text-blue-600"
              >
                Rename
              </button>
            )}
            <button
              onClick={() => handleDelete(node.id, node.name)}
              className="hover:text-red-600"
            >
              Delete
            </button>
          </div>
        </div>

        {node.children && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Syllabus Topic Map</h2>
          <p className="text-xs text-gray-500">
            Hierarchical structure grounded strictly in your uploaded syllabus with cross-references to textbooks.
          </p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {generating ? 'Extracting Topics...' : totalCount > 0 ? 'Rebuild Topic Map' : 'Generate Topic Map'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 mb-4">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-xs text-green-800 mb-4">
          {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading topic map...</p>
      ) : topicTree.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded p-8 text-center text-xs text-gray-500 space-y-2">
          <p className="font-semibold text-gray-700">No topic map generated yet.</p>
          <p>
            Make sure you have uploaded a document (preferably marked as "Syllabus" in the Documents tab).
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="mt-2 bg-blue-600 text-white text-xs px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? 'Extracting Topics...' : 'Generate Topic Map from Uploads'}
          </button>
        </div>
      ) : (
        <div className="border border-gray-200 rounded p-4 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3 text-xs text-gray-500">
            <span>Hierarchy: Chapters &gt; Topics &gt; Subtopics ({totalCount} total nodes)</span>
          </div>
          <div className="divide-y divide-gray-100">
            {topicTree.map((root) => renderNode(root, 0))}
          </div>
        </div>
      )}
    </div>
  );
}
