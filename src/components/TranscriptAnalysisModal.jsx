import React from 'react';
import { X, Download } from 'lucide-react';

const TranscriptAnalysisModal = ({ 
  isOpen, 
  onClose, 
  transcript, 
  analysis, 
  onSavePDF 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 p-6 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Transcript Analysis</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={onSavePDF}
              className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Save as PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Original Transcript */}
          <div>
            <h3 className="text-lg font-semibold mb-2">Original Transcript</h3>
            <div className="bg-gray-700 p-4 rounded-lg whitespace-pre-wrap">
              {transcript}
            </div>
          </div>

          {/* Gemini Analysis */}
          <div>
            <h3 className="text-lg font-semibold mb-2">AI Analysis</h3>
            <div className="bg-gray-700 p-4 rounded-lg whitespace-pre-wrap">
              {analysis}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscriptAnalysisModal; 