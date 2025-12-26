'use client';

import { useState, useEffect } from 'react';
import { ShiftDefinition, CreateShiftRequest, UpdateShiftRequest } from '@/types';
import { X } from 'lucide-react';

interface ShiftFormProps {
  shift?: ShiftDefinition;
  onSubmit: (data: CreateShiftRequest | UpdateShiftRequest) => Promise<void>;
  onCancel: () => void;
  isOpen: boolean;
}

export default function ShiftForm({ shift, onSubmit, onCancel, isOpen }: ShiftFormProps) {
  const [formData, setFormData] = useState<CreateShiftRequest>({
    name: shift?.name || '',
    startTime: shift?.startTime || '08:00',
    endTime: shift?.endTime || '18:00',
    isActive: shift?.isActive !== undefined ? shift.isActive : true
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calculatedDuration, setCalculatedDuration] = useState<number>(0);

  useEffect(() => {
    if (shift) {
      setFormData({
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        isActive: shift.isActive
      });
    } else {
      setFormData({
        name: '',
        startTime: '08:00',
        endTime: '18:00',
        isActive: true
      });
    }
  }, [shift]);

  useEffect(() => {
    // Calculate duration when times change
    if (formData.startTime && formData.endTime) {
      const start = new Date(`2000-01-01T${formData.startTime}`);
      const end = new Date(`2000-01-01T${formData.endTime}`);
      if (end < start) {
        end.setDate(end.getDate() + 1);
      }
      const durationMs = end.getTime() - start.getTime();
      const hours = Math.round(durationMs / (1000 * 60 * 60) * 10) / 10;
      setCalculatedDuration(hours);
    }
  }, [formData.startTime, formData.endTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    // Validate name
    if (!formData.name.trim()) {
      setErrors({ name: 'Shift name is required' });
      setIsSubmitting(false);
      return;
    }

    // Validate duration
    if (calculatedDuration > 10) {
      setErrors({ duration: 'Shift duration cannot exceed 10 hours' });
      setIsSubmitting(false);
      return;
    }

    if (calculatedDuration <= 0) {
      setErrors({ duration: 'End time must be after start time' });
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error: any) {
      setErrors({ submit: error.message || 'Failed to save shift' });
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
            {shift ? 'Edit Shift' : 'Create New Shift'}
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
            <label className="block text-sm font-medium mb-1 text-gray-700">Shift Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900"
              placeholder="e.g., Morning Shift, Evening Shift, Night Shift"
              required
            />
            {errors.name && (
              <div className="text-red-600 text-sm mt-1">{errors.name}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Start Time *</label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">End Time *</label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900"
                required
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-900">
              <span className="font-medium">Duration:</span> {calculatedDuration.toFixed(1)} hours
              {calculatedDuration > 10 && (
                <span className="text-red-600 ml-2">(Exceeds 10 hour limit!)</span>
              )}
            </p>
          </div>

          {errors.duration && (
            <div className="text-red-600 text-sm">{errors.duration}</div>
          )}

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
              disabled={isSubmitting || calculatedDuration > 10}
              className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? 'Saving...' : shift ? 'Update Shift' : 'Create Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

