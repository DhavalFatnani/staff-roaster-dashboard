'use client';

import { useState } from 'react';
import Loader from './Loader';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (csvText: string) => Promise<void>;
}

const SAMPLE_CSV_DATA = `employeeId,firstName,lastName,email,phone,roleId,experienceLevel,ppType,weekOffsCount,defaultShiftPreference
SM002,Sarah,Director,,+1-555-1002,Store Manager,experienced,,2,
SI001,Mike,Supervisor,,+1-555-2001,Shift In Charge,experienced,,1,morning
SI002,Lisa,Coordinator,,+1-555-2002,Shift In Charge,experienced,,2,evening
IE001,David,Stock,,+1-555-3001,Inventory Executive,experienced,,1,
IE002,Emma,Inventory,,+1-555-3002,Inventory Executive,experienced,,2,
IE003,Frank,Analyst,,,Inventory Executive,fresher,,0,
PP001,Alex,Picker,,+1-555-4001,Picker Packer (Warehouse),experienced,warehouse,2,morning
PP002,Jordan,Packer,,+1-555-4002,Picker Packer (Warehouse),experienced,warehouse,1,evening
PP003,Taylor,Worker,,+1-555-4003,Picker Packer (Warehouse),fresher,warehouse,2,
PP004,Casey,Helper,,+1-555-4004,Picker Packer (Warehouse),fresher,warehouse,0,
PP005,Drew,Operator,,+1-555-4005,Picker Packer (Warehouse),experienced,warehouse,1,morning
PP-ADHOC-001,Sam,Temp,,+1-555-5001,Picker Packer (Ad-Hoc),fresher,adHoc,1,morning
PP-ADHOC-002,Pat,Seasonal,,+1-555-5002,Picker Packer (Ad-Hoc),fresher,adHoc,1,evening
PP-ADHOC-003,Riley,Contract,,,Picker Packer (Ad-Hoc),fresher,adHoc,0,morning
PP-ADHOC-004,Morgan,PartTime,,+1-555-5004,Picker Packer (Ad-Hoc),experienced,adHoc,2,
PP-ADHOC-005,Quinn,Flex,,+1-555-5005,Picker Packer (Ad-Hoc),fresher,adHoc,1,evening
PP-ADHOC-006,Blake,Support,,+1-555-5006,Picker Packer (Ad-Hoc),fresher,adHoc,0,`;

export default function BulkImportModal({ isOpen, onClose, onImport }: BulkImportModalProps) {
  const [csvText, setCsvText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleImport = async () => {
    setError(null);
    setIsImporting(true);
    try {
      await onImport(csvText);
      setCsvText('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCopySample = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_CSV_DATA);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = SAMPLE_CSV_DATA;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePasteSample = () => {
    setCsvText(SAMPLE_CSV_DATA);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative">
        {isImporting && (
          <Loader overlay message={`Importing ${csvText.trim().split('\n').length - 1} users...`} />
        )}
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Bulk Import Users</h2>
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              Paste CSV data. Format: employeeId,firstName,lastName,email,phone,roleId,experienceLevel,ppType,weekOffsCount,defaultShiftPreference
            </p>
            <div className="text-xs text-gray-500 mb-2 space-y-1">
              <p><strong>Notes:</strong></p>
              <p>• roleId: Use role name (e.g., "Store Manager") or UUID</p>
              <p>• email: Optional for all roles (SM, SI, IE can add/update emails later)</p>
              <p>• phone: Optional for all roles</p>
              <p>• experienceLevel: "experienced" or "fresher"</p>
              <p>• ppType: "warehouse" or "adHoc" (required for PP roles only)</p>
              <p>• weekOffsCount: Number of days off per week (0-7), rotational</p>
              <p>• defaultShiftPreference: "morning" or "evening" (optional)</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopySample}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <span>✓</span>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <span>📋</span>
                    <span>Copy Sample Data</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handlePasteSample}
                className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
              >
                Paste Sample Data
              </button>
            </div>
          </div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="PP-ADHOC-006,Chris,Helper,chris.helper@example.com,+1-555-5006,role-temp-pp,fresher,adHoc,0,morning"
          />
          {error && <div className="mt-2 text-red-600 text-sm">{error}</div>}
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!csvText.trim() || isImporting}
              className="btn-primary"
            >
              {isImporting ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
