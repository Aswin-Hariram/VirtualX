export const setupWebRTC = (pc, remoteVideo, setRemoteStream, setConnectionStatus, setNetworkQuality, startCallTimer, stopCallTimer, setIsCallActive) => {
  // Set up remote stream handler
  pc.ontrack = (event) => {
    const stream = new MediaStream();
    event.streams[0].getTracks().forEach((track) => {
      stream.addTrack(track);
    });
    setRemoteStream(stream);
    if (remoteVideo.current) {
      remoteVideo.current.srcObject = stream;
    }
  };

  // Connection state handling
  pc.onconnectionstatechange = () => {
    setConnectionStatus(pc.connectionState);
    if (pc.connectionState === 'connected') {
      setIsCallActive(true);
      startCallTimer();
    } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      setIsCallActive(false);
      stopCallTimer();
    }
  };

  // Network quality monitoring
  pc.oniceconnectionstatechange = () => {
    switch (pc.iceConnectionState) {
      case 'checking':
        setNetworkQuality('checking');
        break;
      case 'connected':
      case 'completed':
        setNetworkQuality('good');
        break;
      case 'disconnected':
      case 'failed':
        setNetworkQuality('poor');
        break;
      default:
        setNetworkQuality('unknown');
    }
  };
};

export const startLocalStream = async (selectedVideoDevice, selectedAudioDevice) => {
  try {
    // First check if the browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support video/audio capture. Please try a different browser.');
    }

    // Set up constraints based on available devices
    const constraints = {
      video: selectedVideoDevice 
        ? { 
            deviceId: { exact: selectedVideoDevice },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        : {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
            facingMode: 'user'
          },
      audio: selectedAudioDevice
        ? { deviceId: { exact: selectedAudioDevice } }
        : true
    };

    // Get the stream with the specified constraints
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Verify we have both audio and video tracks
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (!videoTrack) {
      throw new Error('No video track available in the stream');
    }

    // Enable tracks by default
    videoTrack.enabled = true;
    if (audioTrack) {
      audioTrack.enabled = true;
    }

    // Log track information
    console.log('Stream tracks:', {
      video: videoTrack ? {
        label: videoTrack.label,
        enabled: videoTrack.enabled,
        muted: videoTrack.muted,
        readyState: videoTrack.readyState,
        settings: videoTrack.getSettings()
      } : null,
      audio: audioTrack ? {
        label: audioTrack.label,
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        readyState: audioTrack.readyState
      } : null
    });
    
    return stream;
  } catch (error) {
    console.error('Error accessing media devices:', error);
    
    // Provide more specific error messages
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      throw new Error('Camera/microphone access was denied. Please allow access in your browser settings.');
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      throw new Error('No camera or microphone found. Please check your device connections.');
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      throw new Error('Your camera or microphone is already in use by another application.');
    } else if (error.name === 'OverconstrainedError') {
      throw new Error('Could not find a camera matching the requirements. Please try a different camera.');
    } else {
      throw new Error(`Could not access camera or microphone: ${error.message}`);
    }
  }
};

export const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours > 0 ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}; 