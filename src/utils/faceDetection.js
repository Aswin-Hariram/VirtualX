import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

export const loadModels = async () => {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    console.log('Face detection models loaded successfully');
    return true;
  } catch (error) {
    console.error('Error loading face detection models:', error);
    return false;
  }
};

export const detectEmotions = async (video) => {
  if (!video) {
    console.log('No video element provided');
    return null;
  }

  try {
    if (video.readyState !== 4) {
      console.log('Video not ready yet');
      return null;
    }

    const detection = await faceapi
      .detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 224 })
      )
      .withFaceLandmarks()
      .withFaceExpressions();

    if (!detection) {
      console.log('No face detected - student might be sleeping or away');
      return {
        faceDetected: false,
        sleeping: true,
        emotion: null,
        emotions: null,
        confidence: 0
      };
    }

    console.log('Face detected:', detection.expressions);

    const emotions = detection.expressions;
    const dominantEmotion = Object.entries(emotions)
      .reduce((a, b) => (a[1] > b[1] ? a : b))[0];

    // Check for potential sleeping based on face landmarks
    const landmarks = detection.landmarks;
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    
    // Calculate eye aspect ratio (EAR) to detect closed eyes
    const leftEAR = calculateEyeAspectRatio(leftEye);
    const rightEAR = calculateEyeAspectRatio(rightEye);
    const averageEAR = (leftEAR + rightEAR) / 2;
    
    // If EAR is below threshold, eyes are likely closed
    const isSleeping = averageEAR < 0.2;

    return {
      faceDetected: true,
      sleeping: isSleeping,
      emotion: dominantEmotion,
      emotions: emotions,
      confidence: detection.detection.score
    };
  } catch (error) {
    console.error('Error detecting emotions:', error);
    return null;
  }
};

// Calculate Eye Aspect Ratio (EAR) to detect closed eyes
const calculateEyeAspectRatio = (eyePoints) => {
  // Get vertical eye landmarks
  const p2_p6 = distance(eyePoints[1], eyePoints[5]);
  const p3_p5 = distance(eyePoints[2], eyePoints[4]);
  
  // Get horizontal eye landmarks
  const p1_p4 = distance(eyePoints[0], eyePoints[3]);
  
  // Calculate EAR
  return (p2_p6 + p3_p5) / (2.0 * p1_p4);
};

// Calculate Euclidean distance between two points
const distance = (point1, point2) => {
  return Math.sqrt(
    Math.pow(point2.x - point1.x, 2) + 
    Math.pow(point2.y - point1.y, 2)
  );
};

export const getEmotionColor = (emotion) => {
  const colors = {
    happy: 'bg-green-500',
    sad: 'bg-blue-500',
    angry: 'bg-red-500',
    fearful: 'bg-purple-500',
    disgusted: 'bg-yellow-500',
    surprised: 'bg-pink-500',
    neutral: 'bg-gray-500'
  };
  return colors[emotion] || 'bg-gray-500';
}; 