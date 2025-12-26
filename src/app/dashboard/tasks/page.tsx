'use client';

import { useState, useEffect } from 'react';
import { Task, CreateTaskRequest, UpdateTaskRequest, ExperienceLevel } from '@/types';
import { Plus, CheckSquare, Edit, Trash2 } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import TaskForm from '@/components/TaskForm';
import Modal, { ConfirmModal } from '@/components/Modal';

export default function TasksManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' }>({ isOpen: false, message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; task: Task | null }>({ isOpen: false, task: null });

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    try {
      const response = await authenticatedFetch('/api/tasks');
      const result = await response.json();
      if (result.success) {
        setTasks(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateTask = async (data: CreateTaskRequest) => {
    try {
      const response = await authenticatedFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchTasks();
        setShowTaskForm(false);
        setAlert({ isOpen: true, message: 'Task created successfully!', type: 'success' });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to create task', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      setAlert({ isOpen: true, message: 'Failed to create task', type: 'error' });
    }
  };

  const handleUpdateTask = async (data: UpdateTaskRequest) => {
    if (!selectedTask) return;
    try {
      const response = await authenticatedFetch(`/api/tasks/${selectedTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchTasks();
        setShowTaskForm(false);
        setSelectedTask(null);
        setAlert({ isOpen: true, message: 'Task updated successfully!', type: 'success' });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to update task', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      setAlert({ isOpen: true, message: 'Failed to update task', type: 'error' });
    }
  };

  const handleSubmit = async (data: CreateTaskRequest | UpdateTaskRequest) => {
    if (selectedTask) {
      await handleUpdateTask(data as UpdateTaskRequest);
    } else {
      await handleCreateTask(data as CreateTaskRequest);
    }
  };

  const handleDeleteTask = (task: Task) => {
    setConfirmModal({ isOpen: true, task });
  };

  const confirmDeleteTask = async () => {
    const task = confirmModal.task;
    if (!task) return;
    
    try {
      const response = await authenticatedFetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        await fetchTasks();
        setAlert({ isOpen: true, message: `Task "${task.name}" deleted successfully!`, type: 'success' });
        setConfirmModal({ isOpen: false, task: null });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to delete task', type: 'error' });
        setConfirmModal({ isOpen: false, task: null });
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      setAlert({ isOpen: true, message: 'Failed to delete task', type: 'error' });
      setConfirmModal({ isOpen: false, task: null });
    }
  };

  const categories = Array.from(new Set(tasks.map(t => t.category))).sort();
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = 
      task.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !filterCategory || task.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
          <div className="loader-spinner loader-spinner-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Task Management</h1>
          <p className="text-sm text-gray-500">Create and manage tasks for any shift</p>
        </div>
        <button
          onClick={() => {
            setSelectedTask(null);
            setShowTaskForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium shadow-sm whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Create Task
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white w-48"
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTasks.map(task => (
          <div 
            key={task.id} 
            className={`bg-white rounded-xl border shadow-sm p-6 hover:shadow-md transition-all ${
              task.isActive ? 'border-gray-200/60' : 'border-gray-300 opacity-60'
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-base text-gray-900">
                    {task.name}
                  </h3>
                  {task.description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600">Category:</span>
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                  {task.category}
                </span>
              </div>
              {task.requiredExperience && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600">Experience:</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded capitalize">
                    {task.requiredExperience}
                  </span>
                </div>
              )}
              {task.estimatedDuration && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600">Duration:</span>
                  <span className="text-xs text-gray-700">
                    {task.estimatedDuration} minutes
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              {!task.isActive && (
                <p className="text-xs text-red-500">Inactive</p>
              )}
              {task.isActive && <div></div>}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedTask(task);
                    setShowTaskForm(true);
                  }}
                  className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                >
                  <Edit className="w-3 h-3 inline mr-1" />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteTask(task)}
                  className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
                >
                  <Trash2 className="w-3 h-3 inline mr-1" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTasks.length === 0 && !loading && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200/60">
          <CheckSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">
            {searchTerm || filterCategory ? 'No tasks match your filters' : 'No tasks defined'}
          </p>
          <p className="text-sm text-gray-500">Create your first task to get started</p>
        </div>
      )}

      {showTaskForm && (
        <TaskForm
          task={selectedTask || undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowTaskForm(false);
            setSelectedTask(null);
          }}
          isOpen={showTaskForm}
        />
      )}

      {/* Alert Modal */}
      <Modal
        isOpen={alert.isOpen}
        onClose={() => setAlert({ isOpen: false, message: '' })}
        message={alert.message}
        type={alert.type || 'info'}
        title={alert.type === 'success' ? 'Success' : alert.type === 'error' ? 'Error' : 'Information'}
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, task: null })}
        onConfirm={confirmDeleteTask}
        title="Delete Task"
        message={confirmModal.task ? `Delete task "${confirmModal.task.name}"? This action cannot be undone.` : ''}
        type="warning"
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonStyle="danger"
      />
    </div>
  );
}

