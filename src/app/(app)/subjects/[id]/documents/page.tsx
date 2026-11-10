'use client';

import { useState, useEffect, use } from 'react';

interface DocItem {
  id: string;
  filename: string;
  docType: 'syllabus' | 'textbook' | 'notes' | 'past_paper' | 'other';
  pageCount: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  totalChunks: number;
  embeddedChunks: number;
}

export default function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subjectId } = use(params);

  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('syllabus');
  const [uploading, setUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');

  async function loadDocuments() {
    try {
      setLoading(true);
      const res = await fetch(`/api/subjects/${subjectId}/documents`);
      const data = await res.json();
      if (res.ok) {
        setDocuments(data.documents || []);
      } else {
        setError(data.error || 'Failed to load documents');
      }
    } catch {
      setError('Network error loading documents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, [subjectId]);

  // Resumable embedding runner
  async function runEmbeddingProcess(documentId: string, filename: string) {
    let done = false;
    let attempts = 0;
    const maxAttempts = 100;

    while (!done && attempts < maxAttempts) {
      attempts++;
      try {
        const res = await fetch(`/api/documents/${documentId}/process`, {
          method: 'POST',
        });
        const data = await res.json();

        if (!res.ok) {
          setUploadProgressText(`Embedding failed for ${filename}: ${data.error || 'Unknown error'}`);
          await loadDocuments();
          return;
        }

        if (data.done) {
          done = true;
          setUploadProgressText(`✓ Ready! Embedded all chunks for ${filename}.`);
          await loadDocuments();
          return;
        } else {
          const embedded = data.total - data.remaining;
          const pct = Math.round((embedded / data.total) * 100);
          setUploadProgressText(
            `Embedding chunks for ${filename}: ${embedded} of ${data.total} (${pct}%)...`
          );
          // Small pause between batches
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch (err: any) {
        setUploadProgressText(`Network error processing ${filename}`);
        await loadDocuments();
        return;
      }
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setError('');
    setUploading(true);
    setUploadProgressText(`Extracting text and chunking ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', docType);

      const res = await fetch(`/api/subjects/${subjectId}/documents`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Upload failed');
        setUploadProgressText('');
        setUploading(false);
        return;
      }

      setFile(null);
      // Reset file input element
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      const uploadedDoc = data.document;
      await loadDocuments();

      // Begin embedding chunks loop
      setUploadProgressText(`Embedding ${uploadedDoc.chunkCount} chunks...`);
      await runEmbeddingProcess(uploadedDoc.id, uploadedDoc.filename);
    } catch (err: any) {
      setError(err.message || 'Upload error');
      setUploadProgressText('');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(documentId: string, filename: string) {
    if (!confirm(`Delete "${filename}"? All associated chunks and embeddings will be removed.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      } else {
        const data = await res.json();
        alert(data.error || 'Delete failed');
      }
    } catch {
      alert('Network error deleting document');
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold">Study Materials</h2>
        <p className="text-xs text-gray-500">
          Upload your syllabus, textbooks, past papers, and study notes. Only .pdf and .txt files up to 4 MB are supported.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Upload Form */}
      <div className="border border-gray-200 rounded p-4 mb-6 bg-gray-50">
        <h3 className="font-semibold text-sm mb-3">Upload Material</h3>
        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Select File (.pdf, .txt, max 4 MB) *
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".pdf,.txt"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-gray-600 border border-gray-300 rounded p-1.5 bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Document Type *
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded p-2 bg-white"
              >
                <option value="syllabus">Syllabus (defines topic map)</option>
                <option value="textbook">Textbook (study content)</option>
                <option value="notes">Lecture Notes</option>
                <option value="past_paper">Past Paper / Exam Questions</option>
                <option value="other">Other Reference Material</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-1">
            <button
              type="submit"
              disabled={uploading || !file}
              className="bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? 'Processing...' : 'Upload & Process'}
            </button>
            {uploadProgressText && (
              <span className="text-xs text-blue-800 font-medium">{uploadProgressText}</span>
            )}
          </div>
        </form>
      </div>

      {/* Uploaded Documents List */}
      <div>
        <h3 className="font-semibold text-sm mb-2">Uploaded Documents ({documents.length})</h3>

        {loading ? (
          <p className="text-sm text-gray-500">Loading documents...</p>
        ) : documents.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded p-6 text-center text-xs text-gray-500">
            No documents uploaded yet. Upload a syllabus or textbook above to begin.
          </div>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2">Filename</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Pages</th>
                  <th className="px-3 py-2">Chunks</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{doc.filename}</td>
                    <td className="px-3 py-2">
                      <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                        {doc.docType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{doc.pageCount}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {doc.embeddedChunks}/{doc.totalChunks} embedded
                    </td>
                    <td className="px-3 py-2">
                      {doc.status === 'ready' && (
                        <span className="text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded text-[10px]">
                          Ready
                        </span>
                      )}
                      {doc.status === 'processing' && (
                        <span className="text-yellow-800 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded text-[10px]">
                          Processing...
                        </span>
                      )}
                      {doc.status === 'pending' && (
                        <span className="text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded text-[10px]">
                          Pending
                        </span>
                      )}
                      {doc.status === 'failed' && (
                        <div>
                          <span className="text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[10px]">
                            Failed
                          </span>
                          {doc.errorMessage && (
                            <p className="text-[10px] text-red-600 mt-0.5">{doc.errorMessage}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      {doc.status !== 'ready' && doc.status !== 'failed' && (
                        <button
                          onClick={() => runEmbeddingProcess(doc.id, doc.filename)}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Resume
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

