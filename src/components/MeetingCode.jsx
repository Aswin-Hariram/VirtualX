import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const MeetingCode = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="bg-gray-700/50 p-4 rounded-lg mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-300">Meeting Code</h3>
        <button
          onClick={copyToClipboard}
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
          title="Copy meeting code"
        >
          {copied ? (
            <>
              <Check size={16} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={16} />
              Copy
            </>
          )}
        </button>
      </div>
      <div className="bg-gray-800 p-3 rounded flex items-center justify-center">
        <code className="text-lg font-mono text-white">{code}</code>
      </div>
    </div>
  );
};

export default MeetingCode; 