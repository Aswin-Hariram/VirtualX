import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Hand,
  MessageCircle,
  Share2,
  Settings,
  Users,
  Mic2,
  Monitor,
  MonitorOff,
  Pause,
  Play,
} from 'lucide-react';

const ControlButton = ({ onClick, active, activeColor = 'bg-blue-500', children, danger = false, badge = null }) => (
  <button
    onClick={onClick}
    className={`p-3 rounded-full transition-all duration-200 relative ${
      danger 
        ? 'bg-red-500 hover:bg-red-600' 
        : active 
          ? `${activeColor} hover:opacity-90`
          : 'bg-gray-700 hover:bg-gray-600'
    }`}
  >
    {children}
    {badge !== null && badge > 0 && (
      <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
        {badge > 99 ? '99+' : badge}
      </div>
    )}
  </button>
);

const VideoControls = ({
  isMuted,
  isVideoOff,
  isScreenSharing,
  isHandRaised,
  showChat,
  showParticipants,
  participantCount = 0,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleHand,
  onToggleChat,
  onToggleParticipants,
  onOpenSettings,
  onLeaveCall,
  participantRole,
  isRecording,
  isPaused,
  onToggleRecording,
  onTogglePause,
  unreadMessageCount = 0
}) => {
  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
      <div className="flex items-center justify-center space-x-4">
        {/* Audio Control */}
        <ControlButton
          onClick={onToggleMute}
          active={!isMuted}
          activeColor="bg-blue-500 hover:bg-blue-400"
          inactiveColor="bg-red-500 hover:bg-red-400"
        >
          {isMuted ? (
            <div className="relative">
              <MicOff className="w-6 h-6 text-white" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </div>
          ) : (
            <Mic className="w-6 h-6 text-white" />
          )}
        </ControlButton>

        {/* Video Control */}
        <ControlButton
          onClick={onToggleVideo}
          active={!isVideoOff}
        >
          {isVideoOff ? (
            <VideoOff className="w-6 h-6 text-white" />
          ) : (
            <Video className="w-6 h-6 text-white" />
          )}
        </ControlButton>

        {/* Screen Share */}
        <ControlButton
          onClick={onToggleScreenShare}
          active={isScreenSharing}
        >
          {isScreenSharing ? <MonitorOff className="w-6 h-6 text-white" /> : <Monitor className="w-6 h-6 text-white" />}
        </ControlButton>

        {/* Voice Recording - Only for teachers */}
        {participantRole === 'teacher' && (
          <ControlButton
            onClick={onToggleRecording}
            active={isRecording}
            activeColor="bg-red-500"
          >
            <Mic2 className="w-6 h-6 text-white" />
          </ControlButton>
        )}

        {/* Pause/Resume button for teacher when recording */}
        {participantRole === 'teacher' && isRecording && (
          <ControlButton
            onClick={onTogglePause}
            active={isPaused}
            activeColor="bg-gray-700 hover:bg-gray-600"
          >
            {isPaused ? <Play className="w-6 h-6 text-white" /> : <Pause className="w-6 h-6 text-white" />}
          </ControlButton>
        )}

        {/* Hand Raise - Only for students */}
        {participantRole === 'student' && (
          <ControlButton
            onClick={onToggleHand}
            active={isHandRaised}
            activeColor="bg-yellow-500 hover:bg-yellow-600"
          >
            <Hand className={`w-6 h-6 ${isHandRaised ? 'text-white' : 'text-white'}`} />
            {isHandRaised && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
            )}
          </ControlButton>
        )}

        {/* Chat */}
        <ControlButton
          onClick={onToggleChat}
          active={showChat}
          badge={unreadMessageCount}
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </ControlButton>

        {/* Participants */}
        <div className="relative">
          <ControlButton
            onClick={onToggleParticipants}
            active={showParticipants}
            badge={participantCount}
          >
            <Users className="w-6 h-6 text-white" />
          </ControlButton>
        </div>

        {/* Settings */}
        <ControlButton onClick={onOpenSettings}>
          <Settings className="w-6 h-6 text-white" />
        </ControlButton>

        {/* Leave Call */}
        <ControlButton onClick={onLeaveCall} danger>
          <PhoneOff className="w-6 h-6 text-white" />
        </ControlButton>
      </div>
    </div>
  );
};

export default VideoControls; 