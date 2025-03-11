import React from 'react';
import { Mic, Pause } from 'lucide-react';

const LiveTranscript = ({ transcript, isRecording, isPaused }) => {
  if (!isRecording) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 bg-gray-800/90 rounded-lg p-4 shadow-lg max-h-48 overflow-y-auto">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1">
          {isPaused ? (
            <>
              <Pause className="w-4 h-4 text-yellow-500" />
              <span className="text-yellow-500 text-sm">Recording Paused</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 text-red-500 animate-pulse" />
              <span className="text-red-500 text-sm">Recording</span>
            </>
          )}
        </div>
      </div>
      <div className="text-sm text-gray-200 whitespace-pre-wrap">
        {transcript || 'Start speaking...'}
      </div>
    </div>
  );
};

export default LiveTranscript; 