'use client';

import { useState, useEffect } from 'react';
import { Task, CreateTaskRequest, UpdateTaskRequest, ExperienceLevel } from '@/types';
import { X } from 'lucide-react';

interface TaskFormProps {
  task?: Task;
  onSubmit: (data: CreateTaskRequest | UpdateTaskRequest) => Promise<void>;
  onCancel: () => void;
  isOpen: boolean;
}

const TASK_CATEGORIES = [
  'picking',
  'packing',
  'sorting',
  'inventory',
  'customer-service',
  'warehouse',
  'quality-control',
  'shipping',
  'receiving',
  'other'
];

export default function TaskForm({ task, onSubmit, onCancel, isOpen }: TaskFormProps) {
  const [formData, setFormData] = useState<CreateTaskRequest>({
    name: task?.name || '',
    description: task?.description || '',
    category: task?.category || 'other',
    requiredExperience: task?.requiredExperience,
    estimatedDuration: task?.estimatedDuration,
    isActive: task?.isActive !== undefined ? task.isActive : true
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name,
        description: task.description || '',
        category: task.category,
        requiredExperience: task.requiredExperience,
        estimatedDuration: task.estimatedDuration,
        isActive: task.isActive
      });
    } else {
      setFormData({
        name: '',
        description: '',
        category: 'other',
        requiredExperience: undefined,
        estimatedDuration: undefined,
        isActive: true
      });
    }
  }, [task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    if (!formData.name.trim()) {
      setErrors({ name: 'Task name is required' });
      setIsSubmitting(false);
      return;
    }

    if (!formData.category) {
      setErrors({ category: 'Category is required' });
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error: any) {
      setErrors({ submit: error.message || 'Failed to save task' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {task ? 'Edit Task' : 'Create New Task'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Task Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900"
              placeholder="e.g., Pick Orders"
              required
            />
            {errors.name && (
              <div className="text-red-600 text-sm mt-1">{errors.name}</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900"
              rows={3}
              placeholder="Optional description of the task"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Category *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900"
              required
            >
              {TASK_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
                </option>
              ))}
            </select>
            {errors.category && (
              <div className="text-red-600 text-sm mt-1">{errors.category}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Required Experience</label>
              <select
                value={formData.requiredExperience || ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  requiredExperience: e.target.value ? e.target.value as ExperienceLevel : undefined 
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900"
              >
                <option value="">No requirement</option>
                <option value={ExperienceLevel.FRESHER}>Fresher</option>
                <option value={ExperienceLevel.EXPERIENCED}>Experienced</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Duration (minutes)</label>
              <input
                type="number"
                min="1"
                value={formData.estimatedDuration || ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  estimatedDuration: e.target.value ? parseInt(e.target.value) : undefined 
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="mr-2"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active</label>
          </div>

          {errors.submit && (
            <div className="text-red-600 text-sm">{errors.submit}</div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

