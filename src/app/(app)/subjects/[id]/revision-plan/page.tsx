'use client';

import { useState, useEffect, use } from 'react';

interface TaskItem {
  id: string;
  topicId: string | null;
  topicName: string | null;
  dayNumber: number;
  taskType: 'review' | 'practice' | 'retest';
  description: string;
  minutes: number;
  completed: boolean;
  completedAt: string | null;
}

interface PlanData {
  id: string;
  version: number;
  isActive: boolean;
  daysAvailable: number;
  minutesPerDay: number;
  totalMinutes: number;
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;
}

export default function RevisionPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subjectId } = use(params);

  const [plan, setPlan] = useState<PlanData | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  // Form state
  const [daysAvailable, setDaysAvailable] = useState(5);
  const [minutesPerDay, setMinutesPerDay] = useState(45);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConfigForm, setShowConfigForm] = useState(false);

  async function loadPlan(version?: number) {
    try {
      setLoading(true);
      const url = version
        ? `/api/subjects/${subjectId}/revision-plan?version=${version}`
        : `/api/subjects/${subjectId}/revision-plan`;

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        setPlan(data.plan);
        setTasks(data.tasks || []);
        setVersions(data.versions || []);
        if (data.plan) {
          setDaysAvailable(data.plan.daysAvailable);
          setMinutesPerDay(data.plan.minutesPerDay);
        }
      } else {
        setError(data.error || 'Failed to load plan');
      }
    } catch {
      setError('Network error loading plan');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlan(selectedVersion || undefined);
  }, [subjectId, selectedVersion]);

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setGenerating(true);

    try {
      const res = await fetch(`/api/subjects/${subjectId}/revision-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daysAvailable: Number(daysAvailable),
          minutesPerDay: Number(minutesPerDay),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowConfigForm(false);
        setSelectedVersion(null);
        await loadPlan();
      } else {
        setError(data.error || 'Failed to generate plan');
      }
    } catch {
      setError('Network error generating revision plan');
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggleTask(taskId: string, currentCompleted: boolean) {
    const nextStatus = !currentCompleted;

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: nextStatus } : t))
    );

    if (plan) {
      const diff = nextStatus ? 1 : -1;
      const nextCompleted = plan.completedTasks + diff;
      const nextPct = Math.round((nextCompleted / plan.totalTasks) * 100);
      setPlan({ ...plan, completedTasks: nextCompleted, progressPercent: nextPct });
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: nextStatus }),
      });

      if (!res.ok) {
        // Revert on failure
        await loadPlan(selectedVersion || undefined);
      }
    } catch {
      await loadPlan(selectedVersion || undefined);
    }
  }

  // Group tasks by dayNumber
  const tasksByDay = new Map<number, TaskItem[]>();
  for (const t of tasks) {
    const arr = tasksByDay.get(t.dayNumber) || [];
    arr.push(t);
    tasksByDay.set(t.dayNumber, arr);
  }
  const dayNumbers = Array.from(tasksByDay.keys()).sort((a, b) => a - b);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <div>
          <h2 className="text-lg font-bold">Adaptive Revision Plan</h2>
          <p className="text-xs text-gray-500">
            Prioritizes weak topics, allocates daily study time proportionally, and adapts after every diagnostic quiz.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {versions.length > 1 && (
            <select
              value={selectedVersion ?? plan?.version ?? ''}
              onChange={(e) => setSelectedVersion(Number(e.target.value))}
              className="text-xs border border-gray-300 rounded p-1.5 bg-white"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.version}>
                  Version {v.version} {v.isActive ? '(Active)' : ''}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowConfigForm(!showConfigForm)}
            className="border border-gray-300 text-xs px-3 py-1.5 rounded hover:bg-gray-50 font-medium"
          >
            {plan ? (showConfigForm ? 'Hide Form' : 'Adjust Plan Time') : 'Create Plan'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Configuration Form */}
      {(showConfigForm || !plan) && (
        <div className="border border-gray-200 rounded p-4 mb-6 bg-gray-50">
          <h3 className="font-semibold text-sm mb-2">
            {plan ? 'Adjust Schedule & Regenerate Plan' : 'Generate Revision Plan'}
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Set your target timeline and daily available study minutes. The algorithm prioritizes your weakest topics.
          </p>

          <form onSubmit={handleCreatePlan} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Days Available (1 - 30 days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={daysAvailable}
                  onChange={(e) => setDaysAvailable(Number(e.target.value))}
                  className="w-full text-xs border border-gray-300 rounded p-2 bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Study Minutes Per Day (15 - 360 min)
                </label>
                <input
                  type="number"
                  min={15}
                  max={360}
                  step={5}
                  value={minutesPerDay}
                  onChange={(e) => setMinutesPerDay(Number(e.target.value))}
                  className="w-full text-xs border border-gray-300 rounded p-2 bg-white"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={generating}
              className="bg-blue-600 text-white text-xs px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {generating ? 'Scheduling Tasks...' : plan ? 'Regenerate Plan' : 'Generate Revision Plan'}
            </button>
          </form>
        </div>
      )}

      {/* Active Plan Overview */}
      {plan && (
        <div className="border border-gray-200 rounded p-4 mb-6 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2 mb-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm">Revision Plan Version {plan.version}</span>
                {plan.isActive ? (
                  <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-bold">
                    Active Plan
                  </span>
                ) : (
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    Archived Version
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">
                {plan.daysAvailable} days • {plan.minutesPerDay} min/day • Total {plan.totalMinutes} minutes
              </span>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold text-gray-700">
                {plan.completedTasks} of {plan.totalTasks} tasks completed ({plan.progressPercent}%)
              </span>
            </div>
          </div>

          {/* Simple Progress Bar */}
          <div className="w-full bg-gray-200 h-2 rounded overflow-hidden">
            <div
              className="bg-blue-600 h-2 transition-all duration-300"
              style={{ width: `${plan.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Tasks Grouped by Day */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading plan tasks...</p>
      ) : dayNumbers.length === 0 ? (
        !showConfigForm && (
          <div className="border border-dashed border-gray-300 rounded p-8 text-center text-xs text-gray-500">
            No revision plan created yet. Click "Create Plan" above to generate your adaptive study schedule.
          </div>
        )
      ) : (
        <div className="space-y-6">
          {dayNumbers.map((day) => {
            const dayTasks = tasksByDay.get(day) || [];
            const dayMinutes = dayTasks.reduce((s, t) => s + t.minutes, 0);

            return (
              <div key={day} className="border border-gray-200 rounded overflow-hidden bg-white">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                  <span className="font-bold text-xs text-gray-800">Day {day}</span>
                  <span className="text-[11px] text-gray-500">{dayMinutes} minutes allocated</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {dayTasks.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3.5 flex items-start space-x-3 transition-colors ${
                        t.completed ? 'bg-gray-50/70 text-gray-400' : 'hover:bg-gray-50 text-gray-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={t.completed}
                        onChange={() => handleToggleTask(t.id, t.completed)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                      />

                      <div className="flex-1 text-xs">
                        <div className="flex items-center space-x-2 mb-1">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                              t.taskType === 'review'
                                ? 'bg-blue-100 text-blue-800'
                                : t.taskType === 'practice'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {t.taskType}
                          </span>

                          <span
                            className={`font-semibold ${
                              t.completed ? 'line-through text-gray-400' : 'text-gray-900'
                            }`}
                          >
                            {t.topicName}
                          </span>

                          <span className="text-gray-400">({t.minutes} min)</span>
                        </div>

                        <p className={t.completed ? 'line-through text-gray-400' : 'text-gray-600'}>
                          {t.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
