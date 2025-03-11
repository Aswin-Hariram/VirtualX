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

    // Enhanced audio constraints for better quality
    const constraints = {
      video: selectedVideoDevice 
        ? { 
            deviceId: { exact: selectedVideoDevice },
            width: { min: 640, ideal: 1920, max: 1920 },
            height: { min: 480, ideal: 1080, max: 1080 },
            frameRate: { min: 24, ideal: 30, max: 60 },
            aspectRatio: { ideal: 1.7777777778 },
            resizeMode: 'crop-and-scale'
          }
        : {
            width: { min: 640, ideal: 1920, max: 1920 },
            height: { min: 480, ideal: 1080, max: 1080 },
            frameRate: { min: 24, ideal: 30, max: 60 },
            aspectRatio: { ideal: 1.7777777778 },
            resizeMode: 'crop-and-scale',
            facingMode: 'user'
          },
      audio: selectedAudioDevice
        ? { 
            deviceId: { exact: selectedAudioDevice },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 2,
            sampleRate: 48000,
            sampleSize: 16,
            latency: 0,
            volume: 1.0
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 2,
            sampleRate: 48000,
            sampleSize: 16,
            latency: 0,
            volume: 1.0
          }
    };

    // Get the stream with the specified constraints
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Verify we have both audio and video tracks
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (!videoTrack) {
      throw new Error('No video track available in the stream');
    }

    if (!audioTrack) {
      throw new Error('No audio track available in the stream');
    }

    // Enable tracks by default
    videoTrack.enabled = true;
    audioTrack.enabled = true;

    // Log audio track capabilities and settings
    console.log('Audio track capabilities:', audioTrack.getCapabilities());
    console.log('Audio track settings:', audioTrack.getSettings());
    console.log('Audio track constraints:', audioTrack.getConstraints());

    // Set up audio track monitoring
    audioTrack.onmute = () => {
      console.warn('Audio track muted unexpectedly');
      audioTrack.enabled = true;
    };

    audioTrack.onunmute = () => {
      console.log('Audio track unmuted');
    };

    audioTrack.onended = () => {
      console.warn('Audio track ended unexpectedly');
      // Attempt to recover the audio track
      navigator.mediaDevices.getUserMedia({ audio: constraints.audio })
        .then(newStream => {
          const newAudioTrack = newStream.getAudioTracks()[0];
          stream.removeTrack(audioTrack);
          stream.addTrack(newAudioTrack);
        })
        .catch(console.error);
    };

    // Apply audio processing constraints
    if (audioTrack.applyConstraints) {
      try {
        await audioTrack.applyConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 2,
          sampleRate: 48000
        });
      } catch (error) {
        console.warn('Could not apply ideal audio constraints:', error);
      }
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
        readyState: audioTrack.readyState,
        settings: audioTrack.getSettings()
      } : null
    });
    
    return stream;
  } catch (error) {
    console.error('Error getting media stream:', error);
    throw error;
  }
};

export const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours > 0 ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}; 