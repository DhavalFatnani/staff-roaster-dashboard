'use client';

import { useState, useEffect } from 'react';
import { ShiftDefinition, CreateShiftRequest, UpdateShiftRequest } from '@/types';
import { Plus, Clock, Edit, Trash2, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import ShiftForm from '@/components/ShiftForm';
import Modal, { ConfirmModal } from '@/components/Modal';

export default function ShiftsManagementPage() {
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [selectedShift, setSelectedShift] = useState<ShiftDefinition | null>(null);
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' }>({ isOpen: false, message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; shift: ShiftDefinition | null }>({ isOpen: false, shift: null });

  useEffect(() => {
    fetchShifts();
  }, []);

  async function fetchShifts(skipAutoInit = false) {
    try {
      const response = await authenticatedFetch('/api/shift-definitions?includeInactive=true');
      const result = await response.json();
      if (result.success) {
        // Sort by displayOrder if available, otherwise by name
        const sortedShifts = (result.data || []).sort((a: ShiftDefinition, b: ShiftDefinition) => {
          if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
            return a.displayOrder - b.displayOrder;
          }
          if (a.displayOrder !== undefined) return -1;
          if (b.displayOrder !== undefined) return 1;
          return a.name.localeCompare(b.name);
        });
        setShifts(sortedShifts);
        // If no shifts exist, automatically create default shifts (only on first load)
        if (!skipAutoInit && sortedShifts.length === 0) {
          await initializeDefaultShifts();
          return; // initializeDefaultShifts will refresh the list
        }
      }
    } catch (error) {
      console.error('Failed to fetch shifts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function initializeDefaultShifts() {
    try {
      setLoading(true);
      const response = await authenticatedFetch('/api/shift-definitions/initialize', {
        method: 'POST',
      });
      const result = await response.json();
      if (result.success) {
        // Refresh the shifts list (skip auto-init to prevent loop)
        await fetchShifts(true);
      }
    } catch (error) {
      console.error('Failed to initialize default shifts:', error);
      setLoading(false);
    }
  }

  const handleCreateShift = async (data: CreateShiftRequest) => {
    try {
      const response = await authenticatedFetch('/api/shift-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchShifts();
        setShowShiftForm(false);
        setAlert({ isOpen: true, message: 'Shift created successfully!', type: 'success' });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to create shift', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to create shift:', error);
      setAlert({ isOpen: true, message: 'Failed to create shift', type: 'error' });
    }
  };

  const handleUpdateShift = async (data: UpdateShiftRequest) => {
    if (!selectedShift) return;
    try {
      const response = await authenticatedFetch(`/api/shift-definitions/${selectedShift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchShifts();
        setShowShiftForm(false);
        setSelectedShift(null);
        setAlert({ isOpen: true, message: 'Shift updated successfully!', type: 'success' });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to update shift', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to update shift:', error);
      setAlert({ isOpen: true, message: 'Failed to update shift', type: 'error' });
    }
  };

  const handleSubmit = async (data: CreateShiftRequest | UpdateShiftRequest) => {
    if (selectedShift) {
      await handleUpdateShift(data as UpdateShiftRequest);
    } else {
      await handleCreateShift(data as CreateShiftRequest);
    }
  };

  const handleDeleteShift = (shift: ShiftDefinition, event?: React.MouseEvent) => {
    // Prevent event propagation if event is provided
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    setConfirmModal({ isOpen: true, shift });
  };

  const confirmDeleteShift = async () => {
    const shift = confirmModal.shift;
    if (!shift) return;

    try {
      setLoading(true);
      console.log('Deleting shift:', shift.id);
      
      const response = await authenticatedFetch(`/api/shift-definitions/${shift.id}`, {
        method: 'DELETE',
      });
      
      console.log('Delete response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Delete failed:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const result = await response.json();
      console.log('Delete result:', result);
      
      if (result.success) {
        // Refresh the shifts list (will show inactive shifts)
        await fetchShifts(true); // Skip auto-init
        // Show success message
        setAlert({ isOpen: true, message: `Shift "${shift.name}" has been deleted (deactivated).`, type: 'success' });
        setConfirmModal({ isOpen: false, shift: null });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to delete shift', type: 'error' });
        setConfirmModal({ isOpen: false, shift: null });
      }
    } catch (error: any) {
      console.error('Failed to delete shift:', error);
      setAlert({ isOpen: true, message: `Failed to delete shift: ${error.message || 'Unknown error'}`, type: 'error' });
      setConfirmModal({ isOpen: false, shift: null });
    } finally {
      setLoading(false);
    }
  };

  const handleMoveShift = async (shiftId: string, direction: 'up' | 'down') => {
    const currentIndex = shifts.findIndex(s => s.id === shiftId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= shifts.length) return;

    // Create new array with swapped positions
    const newShifts = [...shifts];
    [newShifts[currentIndex], newShifts[newIndex]] = [newShifts[newIndex], newShifts[currentIndex]];

    // Optimistically update UI
    setShifts(newShifts);

    try {
      // Update display_order for all shifts
      const shiftIds = newShifts.map(s => s.id);
      const response = await authenticatedFetch('/api/shift-definitions/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftIds })
      });

      const result = await response.json();
      if (!result.success) {
        // Revert on error
        await fetchShifts();
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to reorder shifts', type: 'error' });
      }
    } catch (error) {
      // Revert on error
      await fetchShifts();
      console.error('Failed to reorder shifts:', error);
      setAlert({ isOpen: true, message: 'Failed to reorder shifts', type: 'error' });
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Shift Management</h1>
          <p className="text-sm text-gray-500">Create and manage shift definitions (max 10 hours each)</p>
        </div>
        <button
          onClick={() => {
            setSelectedShift(null);
            setShowShiftForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium shadow-sm whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Create Shift
        </button>
      </div>

      <div className="space-y-3">
        {shifts.map((shift, index) => (
          <div 
            key={shift.id} 
            className={`bg-white rounded-xl border shadow-sm p-6 hover:shadow-md transition-all ${
              shift.isActive ? 'border-gray-200/60' : 'border-gray-300 opacity-60'
            }`}
          >
            <div className="flex items-center gap-4">
              {/* Reorder Controls */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMoveShift(shift.id, 'up')}
                  disabled={index === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move up"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleMoveShift(shift.id, 'down')}
                  disabled={index === shifts.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move down"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>

              {/* Shift Info */}
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base text-gray-900">
                    {shift.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {shift.startTime} - {shift.endTime}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    Duration: {shift.durationHours} hours
                  </p>
                  {!shift.isActive && (
                    <p className="text-xs text-red-500 mt-1">Inactive</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedShift(shift);
                      setShowShiftForm(true);
                    }}
                    className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                  >
                    <Edit className="w-3 h-3 inline mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={(e) => handleDeleteShift(shift, e)}
                    className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
                  >
                    <Trash2 className="w-3 h-3 inline mr-1" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {shifts.length === 0 && !loading && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200/60">
          <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">No shifts defined</p>
          <p className="text-sm text-gray-500">Create your first shift to get started</p>
        </div>
      )}

      {showShiftForm && (
        <ShiftForm
          shift={selectedShift || undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowShiftForm(false);
            setSelectedShift(null);
          }}
          isOpen={showShiftForm}
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
        onClose={() => setConfirmModal({ isOpen: false, shift: null })}
        onConfirm={confirmDeleteShift}
        title="Delete Shift"
        message={confirmModal.shift ? `Are you sure you want to delete shift "${confirmModal.shift.name}"? This will deactivate the shift.` : ''}
        type="warning"
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonStyle="danger"
      />
    </div>
  );
}

