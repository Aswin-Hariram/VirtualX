import { useState, useEffect } from 'react';

export const useMediaDevices = () => {
  const [availableDevices, setAvailableDevices] = useState({
    audioDevices: [],
    videoDevices: []
  });
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(null);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState(null);

  useEffect(() => {
    const getAvailableDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setAvailableDevices({ audioDevices, videoDevices });
        
        if (audioDevices.length > 0) setSelectedAudioDevice(audioDevices[0].deviceId);
        if (videoDevices.length > 0) setSelectedVideoDevice(videoDevices[0].deviceId);
      } catch (error) {
        console.error('Error enumerating devices:', error);
      }
    };

    getAvailableDevices();
  }, []);

  return {
    availableDevices,
    selectedAudioDevice,
    selectedVideoDevice,
    setSelectedAudioDevice,
    setSelectedVideoDevice
  };
}; 