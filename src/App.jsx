import React, { useState, useEffect, useRef } from 'react';
import { Clock, MicOff, VideoOff, X, Copy, Check, Hand, AlertTriangle } from 'lucide-react';
import { db, auth, authInitialized } from './firebase-config';
import { voiceRecorder } from './utils/voiceRecording';
import LiveTranscript from './components/LiveTranscript';
import TranscriptAnalysisModal from './components/TranscriptAnalysisModal';

import { useMediaDevices } from './hooks/useMediaDevices';
import { startLocalStream, formatDuration } from './utils/webrtc';
import { loadModels, detectEmotions } from './utils/faceDetection';
import { ClassroomManager } from './utils/classroom';
import { ChatManager } from './utils/chat';
import { alertManager } from './utils/alerts';
import VideoControls from './components/VideoControls';
import Chat from './components/Chat';
import JoinForm from './components/JoinForm';
import EmotionDisplay from './components/EmotionDisplay';
import StudentGrid from './components/StudentGrid';
import AlertPanel from './components/AlertPanel';
import { jsPDF } from 'jspdf';

const App = () => {
  // State management
  const [localStream, setLocalStream] = useState(null);
  const [students, setStudents] = useState([]);
  
  // Styles
  const containerStyle = "min-h-screen bg-gray-900 text-white p-2 sm:p-4";
  const gridStyle = "grid grid-cols-1 xl:grid-cols-4 lg:grid-cols-3 gap-2 sm:gap-4 h-[calc(100vh-1rem)]";
  const videoContainerStyle = "lg:col-span-2 xl:col-span-3 bg-gray-800 rounded-xl overflow-hidden relative";
  const sidebarStyle = "bg-gray-800 rounded-xl p-2 sm:p-4 flex flex-col h-full max-h-[calc(100vh-1rem)] overflow-hidden";
  const participantVideoStyle = "absolute inset-0 w-full h-full object-cover";
  const localVideoStyle = "absolute bottom-4 right-4 w-32 sm:w-48 h-24 sm:h-32 object-cover rounded-lg border-2 border-blue-500 bg-gray-800";

  const [roomId, setRoomId] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [showControls, setShowControls] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [networkQuality, setNetworkQuality] = useState('good');
  const [showChat, setShowChat] = useState(false);
  const [participantRole, setParticipantRole] = useState('student');
  const [participantName, setParticipantName] = useState('');
  const [currentEmotion, setCurrentEmotion] = useState(null);
  const [emotionData, setEmotionData] = useState(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [remoteStream, setRemoteStream] = useState(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isWebcamStarted, setIsWebcamStarted] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [isProcessingTranscript, setIsProcessingTranscript] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  // Custom hooks
  const { 
    selectedAudioDevice, 
    selectedVideoDevice,
    setSelectedAudioDevice,
    setSelectedVideoDevice 
  } = useMediaDevices();

  // Refs
  const mainVideoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const callTimerRef = useRef(null);
  const chatRoomRef = useRef(null);
  const emotionDetectionRef = useRef(null);
  const classroomManagerRef = useRef(null);
  const chatManagerRef = useRef(null);

  // Add new ref for component mounting
  const isMountedRef = useRef(false);
  const setupAttemptsRef = useRef(0);
  
  // Add useEffect for component mounting
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize face-api models
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const modelsLoaded = await loadModels();
        setIsModelLoaded(modelsLoaded);
        console.log('Models loaded:', modelsLoaded);
      } catch (error) {
        console.error('Error initializing models:', error);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      if (classroomManagerRef.current) {
        classroomManagerRef.current.cleanup();
      }
      if (chatManagerRef.current) {
        chatManagerRef.current.cleanup();
      }
      stopCallTimer();
      if (chatRoomRef.current) {
        chatRoomRef.current();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (emotionDetectionRef.current) {
        cancelAnimationFrame(emotionDetectionRef.current);
      }
    };
  }, []);

  // Start emotion detection when students are available
  useEffect(() => {
    let isActive = true;

    const detectEmotionsLoop = async () => {
      if (!isActive) return;

      if (participantRole === 'teacher' && students.length > 0 && isModelLoaded) {
        try {
          // Detect emotions for each student
          for (const student of students) {
            const videoElement = document.querySelector(`[data-student-id="${student.id}"]`);
            if (videoElement) {
              const result = await detectEmotions(videoElement);
              if (result && isActive) {
                setEmotionData(prevData => ({
                  ...prevData,
                  [student.id]: result
                }));
                
                // Check and send alerts if needed
                await alertManager.checkAndSendAlert(
                  student.id,
                  student.name,
                  result,
                  roomId
                );
              }
            }
          }
        } catch (error) {
          console.error('Error in emotion detection loop:', error);
        }
      }
      emotionDetectionRef.current = requestAnimationFrame(detectEmotionsLoop);
    };

    if (isModelLoaded && participantRole === 'teacher' && !isLoading) {
      detectEmotionsLoop();
    }

    return () => {
      isActive = false;
      if (emotionDetectionRef.current) {
        cancelAnimationFrame(emotionDetectionRef.current);
      }
    };
  }, [students, isModelLoaded, participantRole, isLoading]);

  const startCallTimer = () => {
    setCallDuration(0);
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  };

  const startWebcam = async () => {
    try {
      console.log('Starting webcam...');
      const stream = await startLocalStream();
      
      if (!stream) {
        throw new Error('Failed to get media stream');
      }

      console.log('Got media stream:', stream);
      console.log('Video tracks:', stream.getVideoTracks());
      console.log('Audio tracks:', stream.getAudioTracks());

      // Ensure we have video tracks
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw new Error('No video tracks found in stream');
      }

      // Log video track settings
      const videoTrack = videoTracks[0];
      console.log('Video track settings:', videoTrack.getSettings());
      
      // Store the stream and update state
      setLocalStream(stream);
      setIsWebcamStarted(true);
      
      return stream;
    } catch (error) {
      console.error('Error starting webcam:', error);
      setError('Failed to start webcam: ' + error.message);
      throw error;
    }
  };

  // Update video setup useEffect
  useEffect(() => {
    if (!localStream || !isMountedRef.current) return;

    let mounted = true;
    const maxRetries = 10;
    const retryDelay = 500;
    const initialDelay = 1000;

    const setupVideo = async (videoRef, stream, description) => {
      return new Promise((resolve) => {
        if (!videoRef.current) {
          console.warn(`Cannot setup ${description} video: No video element, will retry`);
          resolve(false);
          return;
        }

        try {
          console.log(`Setting up ${description} video stream:`, {
            videoRef: !!videoRef.current,
            stream: !!stream,
            tracks: stream.getTracks().length
          });

          // Only set srcObject if it's not already set
          if (videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.muted = true;
          }

          // Ensure video track is enabled
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = true;
          }

          // Add loadedmetadata event listener
          videoRef.current.addEventListener('loadedmetadata', async () => {
            try {
              await videoRef.current.play();
              console.log(`${description} video playing successfully`);
              resolve(true);
            } catch (playError) {
              console.error(`Error playing ${description} video:`, playError);
              videoRef.current.addEventListener('click', () => {
                videoRef.current.play().catch(console.error);
              }, { once: true });
              resolve(false);
            }
          }, { once: true });

          // Force a reload to trigger loadedmetadata
          videoRef.current.load();
        } catch (error) {
          console.error(`Error setting up ${description} video:`, error);
          resolve(false);
        }
      });
    };

    const attemptVideoSetup = async () => {
      if (!mounted || !isMountedRef.current) return;

      setupAttemptsRef.current++;
      console.log('Attempting video setup:', {
        attempt: setupAttemptsRef.current,
        previewRef: !!previewVideoRef.current,
        mainRef: !!mainVideoRef.current,
        participantRole
      });

      let previewSuccess = false;
      let mainSuccess = participantRole === 'teacher';

      // Try to set up preview video
      if (previewVideoRef.current) {
        previewSuccess = await setupVideo(previewVideoRef, localStream, 'preview');
      }

      // Try to set up main video for students
      if (participantRole !== 'teacher' && mainVideoRef.current) {
        mainSuccess = await setupVideo(mainVideoRef, localStream, 'main');
      }

      // If either setup failed and we haven't exceeded retries, try again
      if ((!previewSuccess || !mainSuccess) && setupAttemptsRef.current < maxRetries) {
        console.log(`Retrying video setup, attempt ${setupAttemptsRef.current + 1} of ${maxRetries}`);
        setTimeout(attemptVideoSetup, retryDelay);
      } else if (!previewSuccess || !mainSuccess) {
        console.error('Failed to set up video after all retries');
      } else {
        console.log('Video setup completed successfully');
      }
    };

    // Reset attempt counter when stream changes
    setupAttemptsRef.current = 0;

    // Start the setup process with initial delay
    const timer = setTimeout(() => {
      if (mounted && isMountedRef.current) {
        console.log('Starting video setup after initial delay');
        attemptVideoSetup();
      }
    }, initialDelay);

    return () => {
      mounted = false;
      clearTimeout(timer);
      // Cleanup function
      [previewVideoRef, mainVideoRef].forEach(ref => {
        if (ref.current && ref.current.srcObject) {
          const stream = ref.current.srcObject;
          stream.getTracks().forEach(track => track.stop());
          ref.current.srcObject = null;
        }
      });
    };
  }, [localStream, participantRole]);

  // Add useEffect to handle remote stream
  useEffect(() => {
    if (remoteStream && participantRole === 'student' && mainVideoRef.current) {
        console.log('Remote stream changed, updating main video');
        
        // Enhanced remote stream handling
        const setupRemoteVideo = async () => {
            try {
                // Ensure video element is ready
                if (!mainVideoRef.current) {
                    console.warn('Main video ref not ready');
                    return;
                }

                // Log remote stream details
                console.log('Remote stream details:', {
                    id: remoteStream.id,
                    active: remoteStream.active,
                    tracks: remoteStream.getTracks().map(track => ({
                        kind: track.kind,
                        enabled: track.enabled,
                        muted: track.muted,
                        readyState: track.readyState
                    }))
                });

                // Ensure all tracks are enabled
                remoteStream.getTracks().forEach(track => {
                    track.enabled = true;
                });

                // Set up video element
                if (mainVideoRef.current.srcObject !== remoteStream) {
                    mainVideoRef.current.srcObject = remoteStream;
                    mainVideoRef.current.muted = true;
                }
                
                // Add play error handling with retry mechanism
                const playVideo = async (retries = 3) => {
                    try {
                        if (mainVideoRef.current.paused) {
                            await mainVideoRef.current.play();
                            console.log('Remote video playing successfully');
                        }
                    } catch (error) {
                        console.error('Error playing remote video:', error);
                        if (retries > 0) {
                            console.log(`Retrying playback, ${retries} attempts left`);
                            setTimeout(() => playVideo(retries - 1), 1000);
                        } else {
                            // Add click-to-play fallback
                            const retryPlay = async () => {
                                try {
                                    await mainVideoRef.current.play();
                                    document.removeEventListener('click', retryPlay);
                                } catch (e) {
                                    console.error('Retry play failed:', e);
                                }
                            };
                            document.addEventListener('click', retryPlay);
                        }
                    }
                };

                await playVideo();

                // Monitor remote stream health
                const healthCheck = setInterval(() => {
                    if (remoteStream && mainVideoRef.current) {
                        const tracks = remoteStream.getTracks();
                        const hasDisabledTracks = tracks.some(track => !track.enabled);
                        const hasEndedTracks = tracks.some(track => track.readyState === 'ended');
                        
                        if (hasDisabledTracks || hasEndedTracks) {
                            console.log('Detected issues with remote stream, attempting recovery...');
                            tracks.forEach(track => {
                                if (track.readyState !== 'ended') {
                                    track.enabled = true;
                                }
                            });
                        }

                        // Check if video is actually playing
                        if (mainVideoRef.current.paused) {
                            console.log('Video is paused, attempting to resume...');
                            playVideo();
                        }

                        // Log video element state
                        console.log('Video element state:', {
                            paused: mainVideoRef.current.paused,
                            currentTime: mainVideoRef.current.currentTime,
                            readyState: mainVideoRef.current.readyState,
                            networkState: mainVideoRef.current.networkState,
                            error: mainVideoRef.current.error
                        });
                    }
                }, 2000);

                return () => {
                    clearInterval(healthCheck);
                    if (mainVideoRef.current) {
                        const oldStream = mainVideoRef.current.srcObject;
                        if (oldStream) {
                            oldStream.getTracks().forEach(track => track.stop());
                        }
                        mainVideoRef.current.srcObject = null;
                    }
                };
            } catch (error) {
                console.error('Error setting up remote video:', error);
            }
        };

        setupRemoteVideo();
    }
  }, [remoteStream, participantRole]);

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await authInitialized;
        console.log('Auth initialized');
      } catch (error) {
        console.warn('Auth initialization failed:', error);
      }
    };

    initializeAuth();
  }, []);

  // Initialize chat manager when room is created/joined
  const initializeChat = (roomId) => {
    try {
      console.log('Initializing chat for room:', roomId);
      chatManagerRef.current = new ChatManager(roomId);
      
      // Subscribe to messages
      const unsubscribe = chatManagerRef.current.subscribeToMessages((message) => {
        console.log('Received message:', message);
        
        // Check if this message was sent by the current user
        const isOwnMessage = message.senderName === participantName && message.role === participantRole;
        
        setChatMessages(prev => {
          // Check if message already exists
          const isDuplicate = prev.some(msg => msg.id === message.id);
          
          if (isDuplicate) {
            console.log('Duplicate message detected, ignoring:', message);
            return prev;
          }
          
          // If message is from another user and chat is not visible, update unread count
          if (!isOwnMessage && !showChat) {
            setUnreadMessageCount(chatManagerRef.current.getUnreadCount());
          }
          
          return [...prev, { 
            ...message,
            isCurrentUser: isOwnMessage 
          }];
        });
      }, `${participantRole}-${participantName}`);

      // Store unsubscribe function
      chatRoomRef.current = unsubscribe;
    } catch (error) {
      console.error('Error initializing chat:', error);
    }
  };

  const handleMarkMessagesAsRead = async () => {
    try {
      if (chatManagerRef.current) {
        await chatManagerRef.current.markMessagesAsRead();
        setUnreadMessageCount(0);
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const handleSendMessage = async (text) => {
    let messageData = null;
    try {
      if (!chatManagerRef.current) {
        console.error('Chat manager not initialized');
        throw new Error('Chat not initialized');
      }
      
      const messageId = Date.now().toString();
      messageData = {
        id: messageId,
        text,
        sender: `${participantRole}-${participantName}`,
        senderName: participantName,
        role: participantRole,
        timestamp: new Date().toISOString(),
        isCurrentUser: true
      };
      
      console.log('Sending message:', messageData);
      
      // First add to local state to show immediately
      setChatMessages(prev => [...prev, messageData]);
      
      // Then send to other participants (include all required fields)
      await chatManagerRef.current.sendMessage({
        id: messageId,
        text: messageData.text,
        sender: messageData.sender,
        senderName: messageData.senderName,
        role: messageData.role,
        timestamp: messageData.timestamp
      });
    } catch (error) {
      console.error('Error sending message:', error);
      // Only remove the message if it was added to the state
      if (messageData) {
        setChatMessages(prev => prev.filter(msg => msg.id !== messageData.id));
      }
      alert('Failed to send message. Please try again.');
    }
  };

  const handleCreateClassroom = async () => {
    try {
      // Start webcam first to ensure we have camera access
      const stream = await startWebcam();
      if (!stream) {
        throw new Error('Failed to start webcam');
      }

      // Log stream state
      console.log('Stream state before creating classroom:', stream.getTracks().map(track => ({
        kind: track.kind,
        enabled: track.enabled,
        id: track.id,
        label: track.label
      })));

      // Create classroom manager
      const manager = new ClassroomManager(db);
      classroomManagerRef.current = manager;

      // Set up callbacks for student management
      manager.onParticipantJoined = (studentId, studentStream) => {
        console.log('Student joined:', studentId, studentStream?.getTracks().map(track => ({
          kind: track.kind,
          enabled: track.enabled,
          id: track.id,
          label: track.label
        })));
        setStudents(prev => {
          // Check if student already exists
          if (prev.some(s => s.id === studentId)) {
            return prev;
          }
          return [...prev, { 
            id: studentId, 
            stream: studentStream,
            name: `Student ${prev.length + 1}`,
            isHandRaised: false
          }];
        });
      };

      // Set up hand raise callback
      manager.onHandRaiseUpdate = (studentId, isRaised) => {
        console.log('Hand raise update received:', studentId, isRaised);
        setStudents(prev => {
          const updatedStudents = prev.map(student => 
            student.id === studentId 
              ? { ...student, isHandRaised: isRaised }
              : student
          );
          console.log('Updated students state:', updatedStudents);
          return updatedStudents;
        });
      };

      manager.onParticipantLeft = (studentId) => {
        console.log('Student left:', studentId);
        setStudents(prev => prev.filter(s => s.id !== studentId));
      };

      // Generate room ID first
      const newRoomId = db.collection('classrooms').doc().id;
      console.log('Created room ID:', newRoomId);
      setRoomId(newRoomId);

      // Initialize as teacher
      await manager.initializeAsTeacher(newRoomId, stream);
      console.log('Initialized as teacher');
      
      // Initialize chat
      initializeChat(newRoomId);
      
      setIsCallActive(true);
      startCallTimer();
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Error creating classroom:', error);
      alert(error.message || 'Failed to create classroom. Please try again.');
      setIsCallActive(false);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
      if (classroomManagerRef.current) {
        classroomManagerRef.current.cleanup();
        classroomManagerRef.current = null;
      }
    }
  };

  const handleJoinClassroom = async (roomId) => {
    try {
      const stream = await startWebcam();
      if (!stream) {
        throw new Error('Failed to start webcam');
      }

      const manager = new ClassroomManager(db);
      classroomManagerRef.current = manager;

      // Set up callback for teacher's stream
      manager.onParticipantJoined = (teacherId, teacherStream) => {
        console.log('Received teacher stream:', teacherStream);
        if (teacherStream && teacherStream.getTracks().length > 0) {
          // Create a new MediaStream to avoid reference issues
          const newStream = new MediaStream();
          teacherStream.getTracks().forEach(track => {
            track.enabled = true;
            newStream.addTrack(track);
          });
          setRemoteStream(newStream);
        } else {
          console.error('Received invalid teacher stream:', teacherStream);
        }
      };

      await manager.joinAsStudent(roomId, stream);
      setRoomId(roomId);
      
      // Initialize chat
      initializeChat(roomId);
      
      setIsCallActive(true);
      startCallTimer();
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Error joining classroom:', error);
      alert(error.message || 'Failed to join classroom. Please check the room ID and try again.');
      setIsCallActive(false);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
      if (classroomManagerRef.current) {
        classroomManagerRef.current.cleanup();
        classroomManagerRef.current = null;
      }
    }
  };

  const handleLeaveCall = () => {
    if (classroomManagerRef.current) {
      classroomManagerRef.current.cleanup();
      classroomManagerRef.current = null;
    }
    if (chatManagerRef.current) {
      chatManagerRef.current.cleanup();
      chatManagerRef.current = null;
    }
    stopCallTimer();
    setIsCallActive(false);
    setConnectionStatus('disconnected');
    setStudents([]);
    setChatMessages([]);
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
  };

  const toggleMute = async () => {
    try {
      if (localStream) {
        const newMuteState = !isMuted;
        
        // Update local tracks first
        const audioTracks = localStream.getAudioTracks();
        console.log('Toggling mute state. Current audio tracks:', audioTracks);

        audioTracks.forEach(track => {
          track.enabled = newMuteState;
          console.log(`Audio track ${track.label} enabled:`, track.enabled);
        });

        // Update through ClassroomManager to sync with peers
        if (classroomManagerRef.current) {
          await classroomManagerRef.current.updateAudioState(newMuteState);
        }

        setIsMuted(!newMuteState);
      }
    } catch (error) {
      console.error('Error toggling mute:', error);
      alert('Failed to toggle mute. Please try again.');
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const handleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        
        // Store the original video track to restore later
        const originalVideoTrack = localStream.getVideoTracks()[0];
        setLocalStream(prev => {
          const newStream = prev.clone();
          const [videoTrack] = screenStream.getVideoTracks();
          const senders = classroomManagerRef.current?.peerConnections;
          
          // Replace video track in all peer connections
          if (senders) {
            senders.forEach(pc => {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender) {
                sender.replaceTrack(videoTrack);
              }
            });
          }

          // Replace video track in local stream
          newStream.removeTrack(newStream.getVideoTracks()[0]);
          newStream.addTrack(videoTrack);
          
          // Handle screen share stop
          videoTrack.onended = () => {
            handleScreenShareStop(originalTrack);
          };

          return newStream;
        });

        setIsScreenSharing(true);
      } else {
        handleScreenShareStop();
      }
    } catch (error) {
      console.error('Error sharing screen:', error);
      alert('Failed to share screen. Please try again.');
    }
  };

  const handleScreenShareStop = async (originalTrack) => {
    try {
      if (!originalTrack) {
        originalTrack = await (async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          return stream.getVideoTracks()[0];
        })();
      }

      setLocalStream(prev => {
        const newStream = prev.clone();
        const senders = classroomManagerRef.current?.peerConnections;
        
        // Replace video track in all peer connections
        if (senders) {
          senders.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(originalTrack);
            }
          });
        }

        // Replace video track in local stream
        newStream.removeTrack(newStream.getVideoTracks()[0]);
        newStream.addTrack(originalTrack);
        return newStream;
      });

      setIsScreenSharing(false);
    } catch (error) {
      console.error('Error stopping screen share:', error);
    }
  };

  const handleOpenSettings = () => {
    setShowSettings(true);
  };

  // Add copy function
  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy room ID:', err);
    }
  };

  const handleToggleRecording = async () => {
    if (!isRecording) {
      try {
        // Set up transcript callback
        voiceRecorder.setTranscriptCallback((transcript) => {
          setLiveTranscript(transcript);
        });

        const success = await voiceRecorder.startRecording();
        if (success) {
          setIsRecording(true);
          setIsPaused(false);
        }
      } catch (error) {
        console.error('Error starting recording:', error);
        alert(error.message || 'Failed to start recording. Please ensure you have microphone access and are using a supported browser (Chrome recommended).');
      }
    } else {
      try {
        voiceRecorder.stopRecording();
        setIsRecording(false);
        setIsPaused(false);
        setLiveTranscript('');
        
        // Process transcript with Gemini
        setIsProcessingTranscript(true);
        const analysis = await voiceRecorder.processTranscript();
        setIsProcessingTranscript(false);
        
        // Show analysis modal
        setShowAnalysisModal(true);
      } catch (error) {
        console.error('Error processing transcript:', error);
        alert(error.message || 'Failed to process transcript. Please try again.');
        setIsProcessingTranscript(false);
        setIsRecording(false);
        setIsPaused(false);
        setLiveTranscript('');
      }
    }
  };

  const handleTogglePause = async () => {
    try {
      if (isPaused) {
        const success = voiceRecorder.resumeRecording();
        if (success) {
          setIsPaused(false);
        }
      } else {
        const success = voiceRecorder.pauseRecording();
        if (success) {
          setIsPaused(true);
        }
      }
    } catch (error) {
      console.error('Error toggling pause:', error);
      alert('Failed to toggle recording pause state. Please try again.');
    }
  };

  const handleSavePDF = async () => {
    try {
      await voiceRecorder.saveToPDF();
      setShowAnalysisModal(false);
      alert('Transcript saved successfully as lecture-transcript.pdf');
    } catch (error) {
      console.error('Error saving PDF:', error);
      alert(error.message || 'Failed to save transcript. Please try again.');
    }
  };

  const handleSendPDF = async (pdfBase64, filename) => {
    try {
      // For teachers, handle lecture transcript PDF if no direct PDF is provided
      if (!pdfBase64 && participantRole === 'teacher') {
        if (!voiceRecorder.transcript) {
          throw new Error('No transcript available to send. Please record a lecture first.');
        }

        // Generate PDF from transcript
        const pdfDoc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });
        
        const pageWidth = pdfDoc.internal.pageSize.getWidth();
        const pageHeight = pdfDoc.internal.pageSize.getHeight();
        const margin = 20;
        const lineHeight = 7;
        const maxWidth = pageWidth - 2 * margin;

        // Add title
        pdfDoc.setFontSize(16);
        pdfDoc.text('Class Lecture Transcript', margin, margin + lineHeight);

        // Add timestamp
        pdfDoc.setFontSize(10);
        const timestamp = new Date().toLocaleString();
        pdfDoc.text(`Recorded on: ${timestamp}`, margin, margin + 2 * lineHeight);

        // Add transcript
        pdfDoc.setFontSize(12);
        pdfDoc.text('Original Transcript:', margin, margin + 4 * lineHeight);
        const splitTranscript = pdfDoc.splitTextToSize(voiceRecorder.transcript, maxWidth);
        let y = margin + 6 * lineHeight;

        for (let i = 0; i < splitTranscript.length; i++) {
          if (y > pageHeight - margin) {
            pdfDoc.addPage();
            y = margin;
          }
          pdfDoc.text(splitTranscript[i], margin, y);
          y += lineHeight;
        }

        // Add analysis if available
        if (voiceRecorder.analysis) {
          pdfDoc.addPage();
          y = margin;
          pdfDoc.setFontSize(14);
          pdfDoc.text('AI Analysis', margin, y);
          y += 2 * lineHeight;
          pdfDoc.setFontSize(12);
          const splitAnalysis = pdfDoc.splitTextToSize(voiceRecorder.analysis, maxWidth);
          
          for (let i = 0; i < splitAnalysis.length; i++) {
            if (y > pageHeight - margin) {
              pdfDoc.addPage();
              y = margin;
            }
            pdfDoc.text(splitAnalysis[i], margin, y);
            y += lineHeight;
          }
        }

        // Convert PDF to base64
        pdfBase64 = pdfDoc.output('datauristring');
        filename = 'lecture-transcript.pdf';
      }

      // Send PDF through chat
      if (!chatManagerRef.current) {
        throw new Error('Chat manager not initialized');
      }

      // For direct PDF uploads (both teachers and students)
      if (pdfBase64) {
        await chatManagerRef.current.sendPDF(pdfBase64, {
          sender: `${participantRole}-${participantName}`,
          senderName: participantName,
          role: participantRole,
          filename: filename || `shared-document-${new Date().toISOString()}.pdf`
        });

        alert('PDF sent successfully!');
      }
    } catch (error) {
      console.error('Error sending PDF:', error);
      alert(error.message || 'Failed to send PDF. Please try again.');
    }
  };

  const handleToggleHand = async () => {
    try {
      const newHandRaiseState = !isHandRaised;
      setIsHandRaised(newHandRaiseState);
      
      if (classroomManagerRef.current) {
        console.log('Updating hand raise status:', newHandRaiseState);
        await classroomManagerRef.current.updateHandRaiseStatus(newHandRaiseState);
      }
    } catch (error) {
      console.error('Error toggling hand raise:', error);
      // Revert state if update fails
      setIsHandRaised(!newHandRaiseState);
      alert('Failed to update hand raise status. Please try again.');
    }
  };

  return (
    <div className={containerStyle}>
      {!isCallActive ? (
        <JoinForm
          onCreateRoom={handleCreateClassroom}
          onJoinRoom={handleJoinClassroom}
          setParticipantRole={setParticipantRole}
          setParticipantName={setParticipantName}
        />
      ) : (
        <>
          <div className={gridStyle}>
            <div className={videoContainerStyle}>
              {/* Main video container */}
              <div className="relative h-full">
                {participantRole === 'teacher' ? (
                  <StudentGrid 
                    students={students} 
                    isTeacher={true}
                    emotionData={emotionData}
                  />
                ) : (
                  <video
                    key="main-video"
                    ref={mainVideoRef}
                    autoPlay
                    playsInline
                    muted={true}
                    className={participantVideoStyle}
                    style={{ transform: 'scaleX(-1)' }}
                    onLoadedMetadata={(e) => {
                      console.log('Main video metadata loaded:', {
                        videoWidth: e.target.videoWidth,
                        videoHeight: e.target.videoHeight,
                        readyState: e.target.readyState
                      });
                      const video = e.target;
                      if (video.paused) {
                        video.play().catch(err => {
                          console.error('Error playing main video:', err);
                          video.addEventListener('click', () => {
                            video.play().catch(console.error);
                          }, { once: true });
                        });
                      }
                    }}
                    onError={(e) => {
                      console.error('Main video error:', e.target.error);
                    }}
                    onStalled={() => {
                      console.warn('Main video stalled');
                    }}
                    onSuspend={() => {
                      console.warn('Main video suspended');
                    }}
                    onWaiting={() => {
                      console.warn('Main video waiting');
                    }}
                    onPlaying={() => {
                      console.log('Main video started playing');
                    }}
                  />
                )}
                
                {/* Local video preview - always show */}
                <div className={localVideoStyle}>
                  <video
                    key="preview-video"
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                    onLoadedMetadata={(e) => {
                      console.log('Preview video metadata loaded');
                      const video = e.target;
                      if (video.paused) {
                        video.play().catch(err => {
                          console.error('Error playing preview video:', err);
                          video.addEventListener('click', () => {
                            video.play().catch(console.error);
                          }, { once: true });
                        });
                      }
                    }}
                  />
                </div>

                {/* Video controls */}
                {showControls && (
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <VideoControls
                      isMuted={isMuted}
                      isVideoOff={isVideoOff}
                      isScreenSharing={isScreenSharing}
                      isHandRaised={isHandRaised}
                      showChat={showChat}
                      showParticipants={showParticipants}
                      participantCount={students.length}
                      onToggleMute={toggleMute}
                      onToggleVideo={toggleVideo}
                      onToggleScreenShare={handleScreenShare}
                      onToggleHand={handleToggleHand}
                      onToggleChat={() => {
                        setShowChat(!showChat);
                        if (!showChat) {
                          handleMarkMessagesAsRead();
                        }
                      }}
                      onToggleParticipants={() => setShowParticipants(!showParticipants)}
                      onOpenSettings={handleOpenSettings}
                      onLeaveCall={handleLeaveCall}
                      participantRole={participantRole}
                      isRecording={isRecording}
                      isPaused={isPaused}
                      onToggleRecording={handleToggleRecording}
                      onTogglePause={handleTogglePause}
                      unreadMessageCount={unreadMessageCount}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className={sidebarStyle}>
              {/* Show either participants list or chat */}
              {showParticipants ? (
                <div className="flex-1 overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Participants ({students.length + 1})</h3>
                    <button
                      onClick={() => setShowParticipants(false)}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {/* Teacher */}
                    <div className="flex items-center justify-between p-2 bg-gray-700 rounded">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                          T
                        </div>
                        <span className="font-medium">Teacher</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {isMuted && <MicOff className="w-4 h-4 text-red-500" />}
                        {isVideoOff && <VideoOff className="w-4 h-4 text-red-500" />}
                      </div>
                    </div>
                    {/* Students */}
                    {students.map((student, index) => (
                      <div key={student.id} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                            S{index + 1}
                          </div>
                          <span className="font-medium">{student.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {student.isHandRaised && (
                            <div className="bg-yellow-500 text-white px-2 py-1 rounded-full flex items-center gap-1">
                              <Hand className="w-4 h-4" />
                              <span className="text-xs">Hand Raised</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {/* Connection status and timer */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${
                        connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      <span className="text-sm font-medium">{connectionStatus}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm font-medium">{formatDuration(callDuration)}</span>
                    </div>
                  </div>

                  {/* Room ID and Emotion display - hide only when chat is open */}
                  {!showChat && (
                    <>
                      {/* Room ID display for all users */}
                      <div className="bg-gray-700 rounded-lg p-3 mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-sm font-medium">Room ID</h3>
                          <button
                            onClick={handleCopyRoomId}
                            className="p-1 hover:bg-gray-600 rounded transition-colors duration-200 flex items-center gap-1 text-xs"
                            title="Copy Room ID"
                          >
                            {copySuccess ? (
                              <>
                                <Check size={14} className="text-green-500" />
                                <span className="text-green-500">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={14} />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-xs font-mono bg-gray-800 p-2 rounded select-all">
                          {roomId}
                        </p>
                      </div>

                      {/* Emotion display for teacher */}
                      {participantRole === 'teacher' && (
                        <div className="mb-4">
                          <EmotionDisplay
                            emotionData={emotionData}
                            students={students}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Chat - takes full height when open */}
                  {showChat && (
                    <div className="flex-1 min-h-0 h-full">
                      <Chat
                        showChat={showChat}
                        setShowChat={setShowChat}
                        participantName={participantName}
                        chatMessages={chatMessages}
                        newMessage={newMessage}
                        setNewMessage={setNewMessage}
                        sendMessage={handleSendMessage}
                        participantRole={participantRole}
                        handleKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage(newMessage);
                            setNewMessage('');
                          }
                        }}
                        onSendPDF={handleSendPDF}
                        unreadCount={unreadMessageCount}
                        onMarkAsRead={handleMarkMessagesAsRead}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <LiveTranscript transcript={liveTranscript} isRecording={isRecording} isPaused={isPaused} />
          <TranscriptAnalysisModal
            isOpen={showAnalysisModal}
            onClose={() => setShowAnalysisModal(false)}
            transcript={voiceRecorder.transcript}
            analysis={voiceRecorder.analysis}
            onSavePDF={handleSavePDF}
          />
        </>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-gray-700 rounded"
              >
                <X size={20} />
              </button>
            </div>
            {/* Add settings content here */}
          </div>
        </div>
      )}

      {/* Only show AlertPanel for students */}
      {participantRole === 'student' && (
        <div className="absolute top-4 right-4 flex items-center space-x-4">
          <AlertPanel
            roomId={roomId}
            isTeacher={false}
          />
        </div>
      )}
    </div>
  );
};

export default App;