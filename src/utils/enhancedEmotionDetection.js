import * as faceapi from 'face-api.js';

// Configuration constants
const CONFIG = {
  CONFIDENCE_THRESHOLD: 0.6,
  ATTENTION_ANGLE_THRESHOLD: 25,
  TEMPORAL_WINDOW_SIZE: 5,
  MIN_FACE_SIZE: 100,
  FACE_DETECTION_TIMEOUT: 2000, // 2 seconds timeout for face detection
  NO_FACE_THRESHOLD: 3, // Number of consecutive frames before declaring no face
  EMOTION_STALE_THRESHOLD: 0.01, // Threshold for emotion change detection
  MAX_STABLE_FRAMES: 5, // Maximum number of frames with stable emotions before considering no face
  MIN_DETECTION_CONFIDENCE: 0.7,
  // Sleep detection parameters
  EYE_CLOSURE_THRESHOLD: 0.15,  // Lower EAR indicates closed eyes
  HEAD_TILT_THRESHOLD: 30,      // Maximum head tilt angle for sleep detection
  SLEEP_DETECTION_FRAMES: 10,    // Number of frames to confirm sleep
  DETECTION_OPTIONS: new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.5
  })
};

// Attention states enum
const AttentionState = {
  ATTENTIVE: 'attentive',
  DISTRACTED: 'distracted',
  NO_FACE: 'no_face',
  SLEEPING: 'sleeping'  // Add sleeping state
};

// Load all required models
export const loadRequiredModels = async () => {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      faceapi.nets.faceExpressionNet.loadFromUri('/models'),
      faceapi.nets.ageGenderNet.loadFromUri('/models'), // Add age and gender detection
      faceapi.nets.ssdMobilenetv1.loadFromUri('/models') // Add alternative detector
    ]);
    return true;
  } catch (error) {
    console.error('Error loading models:', error);
    return false;
  }
};

class EmotionBuffer {
  constructor(size = CONFIG.TEMPORAL_WINDOW_SIZE) {
    this.size = size;
    this.buffer = [];
    this.lastFaceDetectionTime = Date.now();
    this.consecutiveNoFaceFrames = 0;
    this.stableEmotionFrames = 0;
    this.lastEmotions = null;
    this.sleepDetectionBuffer = [];
    this.consecutiveSleepFrames = 0;
  }

  add(emotion) {
    if (emotion === null) {
      this.consecutiveNoFaceFrames++;
      this.stableEmotionFrames = 0;
      this.lastEmotions = null;
      this.sleepDetectionBuffer = [];
    } else {
      // Check if emotions are unchanged
      if (this.lastEmotions && this.areEmotionsSimilar(emotion.emotions, this.lastEmotions)) {
        this.stableEmotionFrames++;
        if (this.stableEmotionFrames >= CONFIG.MAX_STABLE_FRAMES) {
          this.consecutiveNoFaceFrames++;
          emotion = null; // Treat as no face detected
        }
      } else {
        this.consecutiveNoFaceFrames = 0;
        this.stableEmotionFrames = 0;
        this.lastFaceDetectionTime = Date.now();
        this.lastEmotions = { ...emotion.emotions };
      }

      // Track sleep-related metrics
      if (emotion.sleepMetrics) {
        this.sleepDetectionBuffer.push(emotion.sleepMetrics);
        if (this.sleepDetectionBuffer.length > CONFIG.SLEEP_DETECTION_FRAMES) {
          this.sleepDetectionBuffer.shift();
        }
      }
    }

    this.buffer.push(emotion);
    if (this.buffer.length > this.size) {
      this.buffer.shift();
    }
  }

  areEmotionsSimilar(emotions1, emotions2) {
    if (!emotions1 || !emotions2) return false;
    
    const emotions = ['angry', 'disgusted', 'fearful', 'happy', 'neutral', 'sleeping', 'surprised'];
    return emotions.every(emotion => 
      Math.abs((emotions1[emotion] || 0) - (emotions2[emotion] || 0)) < CONFIG.EMOTION_STALE_THRESHOLD
    );
  }

  getSmoothedEmotions() {
    if (this.buffer.length === 0) return null;

    const validEmotions = this.buffer.filter(entry => entry !== null);
    if (validEmotions.length === 0) return null;

    const emotions = ['angry', 'disgusted', 'fearful', 'happy', 'neutral', 'sleeping', 'surprised'];
    const smoothed = {};

    emotions.forEach(emotion => {
      if (emotion === 'sleeping') {
        // Map sad to sleeping in the smoothed emotions
        const values = validEmotions.map(entry => entry.emotions['sad'] || 0);
        smoothed[emotion] = this.calculateWeightedAverage(values);
      } else {
        const values = validEmotions.map(entry => entry.emotions[emotion] || 0);
        smoothed[emotion] = this.calculateWeightedAverage(values);
      }
    });

    return smoothed;
  }

  isFacePresent() {
    return this.consecutiveNoFaceFrames < CONFIG.NO_FACE_THRESHOLD;
  }

  isEmotionStale() {
    return this.stableEmotionFrames >= CONFIG.MAX_STABLE_FRAMES;
  }

  calculateWeightedAverage(values) {
    if (values.length === 0) return 0;
    const weights = values.map((_, index) => index + 1);
    const weightedSum = values.reduce((sum, value, index) => sum + value * weights[index], 0);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    return weightedSum / weightSum;
  }

  isSleeping() {
    if (this.sleepDetectionBuffer.length < CONFIG.SLEEP_DETECTION_FRAMES) return false;
    
    const recentMetrics = this.sleepDetectionBuffer.slice(-CONFIG.SLEEP_DETECTION_FRAMES);
    const sleepingFrames = recentMetrics.filter(metrics => 
      metrics.isEyesClosed && metrics.isHeadTilted
    ).length;

    return sleepingFrames >= CONFIG.SLEEP_DETECTION_FRAMES * 0.8; // 80% of frames show sleeping
  }
}

// Enhanced emotion detection with temporal smoothing and confidence filtering
export const detectEmotionsEnhanced = async (video, emotionBuffer = new EmotionBuffer()) => {
  try {
    // Try multiple detectors for better accuracy
    let detection = await faceapi
      .detectSingleFace(video, CONFIG.DETECTION_OPTIONS)
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender(); // Add age and gender detection

    // If primary detector fails, try SSD Mobilenet
    if (!detection || detection.detection.score < CONFIG.MIN_DETECTION_CONFIDENCE) {
      detection = await faceapi
        .detectSingleFace(video, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceExpressions()
        .withAgeAndGender();
    }

    const noFaceResult = {
      emotions: null,
      dominantEmotion: { emotion: 'neutral', score: 0 },
      attention: {
        state: AttentionState.NO_FACE,
        confidence: 1,
        metrics: null,
        lastFaceDetectionTime: emotionBuffer.lastFaceDetectionTime,
        consecutiveNoFaceFrames: emotionBuffer.consecutiveNoFaceFrames,
        isEmotionStale: emotionBuffer.isEmotionStale()
      },
      demographics: null,
      faceMetrics: null,
      timestamp: Date.now(),
      confidence: 0,
      facePresent: false
    };

    if (!detection) {
      emotionBuffer.add(null);
      return noFaceResult;
    }

    // Check if face size is adequate for accurate detection
    const faceSize = detection.detection.box.area;
    if (faceSize < CONFIG.MIN_FACE_SIZE) {
      console.warn('Face too small for accurate detection');
      emotionBuffer.add(null);
      return noFaceResult;
    }

    // Map sad to sleeping in raw emotions immediately after detection
    const rawEmotions = {
      angry: detection.expressions.angry,
      disgusted: detection.expressions.disgusted,
      fearful: detection.expressions.fearful,
      happy: detection.expressions.happy,
      neutral: detection.expressions.neutral,
      surprised: detection.expressions.surprised,
      sleeping: detection.expressions.sad // Map sad to sleeping
    };

    // Calculate face metrics before sleep detection
    const landmarks = detection.landmarks;
    const faceMetrics = calculateFaceMetrics(landmarks);
    
    const sleepMetrics = detectSleepState(detection, faceMetrics);
    
    emotionBuffer.add({ 
      emotions: rawEmotions,
      timestamp: Date.now(),
      sleepMetrics 
    });

    // If sleeping is detected, override attention state
    const isSleeping = emotionBuffer.isSleeping();
    
    // Get temporally smoothed emotions
    const smoothedEmotions = emotionBuffer.getSmoothedEmotions();
    if (!smoothedEmotions) return noFaceResult;

    // Enhanced attention detection
    const attention = calculateEnhancedAttention(faceMetrics, detection);

    // Get dominant emotion with confidence threshold and context
    const dominantEmotion = calculateDominantEmotion(smoothedEmotions, detection.age, detection.gender);

    // Calculate additional face analysis metrics
    const faceAnalysis = analyzeFaceDetails(detection, faceMetrics);

    return {
      emotions: smoothedEmotions,
      rawEmotions: rawEmotions, // Include mapped raw emotions
      dominantEmotion,
      attention: {
        ...attention,
        state: isSleeping ? AttentionState.SLEEPING : attention.state,
        consecutiveNoFaceFrames: emotionBuffer.consecutiveNoFaceFrames,
        isEmotionStale: emotionBuffer.isEmotionStale(),
        isSleeping
      },
      demographics: {
        age: Math.round(detection.age),
        gender: detection.gender,
        genderProbability: detection.genderProbability
      },
      faceMetrics,
      faceAnalysis,
      sleepAnalysis: {
        isSleeping,
        confidence: calculateSleepConfidence(sleepMetrics),
        metrics: sleepMetrics
      },
      timestamp: Date.now(),
      confidence: detection.detection.score,
      facePresent: true
    };
  } catch (error) {
    console.error('Error in emotion detection:', error);
    emotionBuffer.add(null);
    return {
      emotions: null,
      dominantEmotion: { emotion: 'neutral', score: 0 },
      attention: {
        state: AttentionState.NO_FACE,
        confidence: 1,
        metrics: null,
        lastFaceDetectionTime: emotionBuffer.lastFaceDetectionTime,
        consecutiveNoFaceFrames: emotionBuffer.consecutiveNoFaceFrames,
        isEmotionStale: emotionBuffer.isEmotionStale()
      },
      demographics: null,
      faceMetrics: null,
      timestamp: Date.now(),
      confidence: 0,
      facePresent: false
    };
  }
};

// Calculate comprehensive face metrics
const calculateFaceMetrics = (landmarks) => {
  const nose = landmarks.getNose();
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const jawline = landmarks.getJawOutline();

  // Calculate eye aspect ratio (EAR) for attention
  const leftEAR = calculateEyeAspectRatio(leftEye);
  const rightEAR = calculateEyeAspectRatio(rightEye);
  const averageEAR = (leftEAR + rightEAR) / 2;

  // Calculate face orientation
  const faceOrientation = calculateFaceOrientation(nose, leftEye, rightEye);

  // Calculate face symmetry
  const symmetry = calculateFaceSymmetry(jawline);

  return {
    eyeAspectRatio: averageEAR,
    orientation: faceOrientation,
    symmetry
  };
};

// Calculate Eye Aspect Ratio
const calculateEyeAspectRatio = (eye) => {
  const height1 = euclideanDistance(eye[1], eye[5]);
  const height2 = euclideanDistance(eye[2], eye[4]);
  const width = euclideanDistance(eye[0], eye[3]);
  return (height1 + height2) / (2.0 * width);
};

// Calculate face symmetry score
const calculateFaceSymmetry = (jawline) => {
  const midpoint = jawline[8]; // Chin point
  const leftPoints = jawline.slice(0, 8);
  const rightPoints = jawline.slice(9);
  
  const symmetryScores = leftPoints.map((point, index) => {
    const rightPoint = rightPoints[7 - index];
    const leftDist = euclideanDistance(point, midpoint);
    const rightDist = euclideanDistance(rightPoint, midpoint);
    return 1 - Math.abs(leftDist - rightDist) / Math.max(leftDist, rightDist);
  });

  return symmetryScores.reduce((a, b) => a + b, 0) / symmetryScores.length;
};

// Enhanced attention detection
const calculateEnhancedAttention = (faceMetrics, detection) => {
  const { eyeAspectRatio, orientation, symmetry } = faceMetrics;
  
  // Combine multiple factors for attention detection
  const isEyesOpen = eyeAspectRatio > 0.2;
  const isFacingCamera = Math.abs(orientation.angles.eyeLineAngle) < CONFIG.ATTENTION_ANGLE_THRESHOLD &&
                        Math.abs(orientation.angles.noseTilt) < CONFIG.ATTENTION_ANGLE_THRESHOLD;
  const isSymmetrical = symmetry > 0.8;
  
  // Calculate overall attention confidence
  const attentionConfidence = (
    (isEyesOpen ? 0.4 : 0) +
    (isFacingCamera ? 0.4 : 0) +
    (isSymmetrical ? 0.2 : 0)
  );

  return {
    state: attentionConfidence >= 0.6 ? AttentionState.ATTENTIVE : AttentionState.DISTRACTED,
    confidence: attentionConfidence,
    metrics: {
      eyeAspectRatio,
      faceOrientation: orientation.angles,
      symmetry,
      isEyesOpen,
      isFacingCamera,
      isSymmetrical
    }
  };
};

// Calculate face orientation
const calculateFaceOrientation = (nose, leftEye, rightEye) => {
  const eyeLineAngle = Math.atan2(
    rightEye[0].y - leftEye[0].y,
    rightEye[0].x - leftEye[0].x
  );
  
  const noseTilt = Math.atan2(
    nose[3].y - nose[0].y,
    nose[3].x - nose[0].x
  );

  const angles = {
    eyeLineAngle: (eyeLineAngle * 180) / Math.PI,
    noseTilt: (noseTilt * 180) / Math.PI
  };

  return {
    angles,
    isAligned: Math.abs(angles.eyeLineAngle) < CONFIG.ATTENTION_ANGLE_THRESHOLD
  };
};

// Utility function to calculate Euclidean distance
const euclideanDistance = (point1, point2) => {
  return Math.sqrt(
    Math.pow(point2.x - point1.x, 2) + 
    Math.pow(point2.y - point1.y, 2)
  );
};

// Calculate dominant emotion with context awareness
const calculateDominantEmotion = (emotions, age, gender) => {
  // Check for sleep state based on sleeping emotion (previously sad)
  if (emotions.sleeping >= CONFIG.CONFIDENCE_THRESHOLD) {
    return {
      emotion: 'sleeping',
      score: emotions.sleeping,
      confidence: emotions.sleeping,
      context: {
        age,
        gender
      }
    };
  }

  const dominantEmotion = Object.entries(emotions)
    .filter(([emotion]) => emotion !== 'sleeping') // Exclude sleeping from normal emotion detection
    .reduce(
      (max, [emotion, score]) => {
        if (score > max.score && score >= CONFIG.CONFIDENCE_THRESHOLD) {
          // Apply age-based adjustments
          let adjustedScore = score;
          if (age < 18) {
            // Adjust for younger subjects who might show more extreme emotions
            adjustedScore *= 0.9;
          }
          return { emotion, score: adjustedScore };
        }
        return max;
      },
      { emotion: 'neutral', score: 0 }
    );

  return {
    ...dominantEmotion,
    confidence: dominantEmotion.score,
    context: {
      age,
      gender
    }
  };
};

// Analyze additional face details
const analyzeFaceDetails = (detection, faceMetrics) => {
  const { landmarks } = detection;
  const jawline = landmarks.getJawOutline();
  const nose = landmarks.getNose();
  const mouth = landmarks.getMouth();

  // Calculate mouth openness
  const mouthOpenness = calculateMouthOpenness(mouth);
  
  // Calculate face tilt
  const faceTilt = calculateFaceTilt(jawline);

  // Calculate nose-mouth alignment
  const alignment = calculateFaceAlignment(nose, mouth);

  return {
    mouthMetrics: {
      isOpen: mouthOpenness > 0.3,
      openness: mouthOpenness
    },
    facePosition: {
      tilt: faceTilt,
      alignment
    },
    quality: {
      clarity: detection.detection.score,
      confidence: faceMetrics.symmetry
    }
  };
};

// Calculate mouth openness
const calculateMouthOpenness = (mouth) => {
  const topLip = mouth[13]; // Center of top lip
  const bottomLip = mouth[19]; // Center of bottom lip
  const mouthWidth = euclideanDistance(mouth[0], mouth[6]);
  const mouthHeight = euclideanDistance(topLip, bottomLip);
  return mouthHeight / mouthWidth;
};

// Calculate face tilt
const calculateFaceTilt = (jawline) => {
  const leftJaw = jawline[0];
  const rightJaw = jawline[16];
  const chin = jawline[8];
  
  const tiltAngle = Math.atan2(
    rightJaw.y - leftJaw.y,
    rightJaw.x - leftJaw.x
  ) * (180 / Math.PI);

  const verticalDeviation = Math.abs(chin.y - (leftJaw.y + rightJaw.y) / 2);
  
  return {
    angle: tiltAngle,
    deviation: verticalDeviation
  };
};

// Calculate face alignment
const calculateFaceAlignment = (nose, mouth) => {
  const noseCenter = nose[3];
  const mouthCenter = mouth[14];
  
  const horizontalOffset = Math.abs(noseCenter.x - mouthCenter.x);
  const verticalOffset = Math.abs(noseCenter.y - mouthCenter.y);
  
  return {
    horizontal: horizontalOffset,
    vertical: verticalOffset,
    isAligned: horizontalOffset < 5 && verticalOffset > 10
  };
};

// Detect sleep state based on face metrics
const detectSleepState = (detection, faceMetrics) => {
  const { landmarks } = detection;
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const nose = landmarks.getNose();
  const jawline = landmarks.getJawOutline();

  // Calculate eye closure
  const leftEAR = calculateEyeAspectRatio(leftEye);
  const rightEAR = calculateEyeAspectRatio(rightEye);
  const averageEAR = (leftEAR + rightEAR) / 2;
  const isEyesClosed = averageEAR < CONFIG.EYE_CLOSURE_THRESHOLD;

  // Calculate head tilt
  const headTilt = calculateHeadTilt(nose, jawline);
  const isHeadTilted = Math.abs(headTilt.angle) > CONFIG.HEAD_TILT_THRESHOLD;

  // Check for drooping features
  const eyeAlignment = calculateEyeAlignment(leftEye, rightEye);
  const mouthRelaxation = calculateMouthRelaxation(landmarks.getMouth());

  // Use sleeping instead of sad for sleep detection
  const sleepingScore = detection.expressions.sad || 0; // Still use sad internally
  const isInSleepingState = sleepingScore >= CONFIG.CONFIDENCE_THRESHOLD;

  return {
    isEyesClosed,
    isHeadTilted,
    isInSleepingState,
    sleepingScore,
    eyeAspectRatio: averageEAR,
    headTiltAngle: headTilt.angle,
    eyeAlignment,
    mouthRelaxation,
    confidence: calculateSleepConfidence({
      isEyesClosed,
      isHeadTilted,
      isInSleepingState,
      sleepingScore,
      eyeAspectRatio: averageEAR,
      headTiltAngle: headTilt.angle,
      eyeAlignment,
      mouthRelaxation
    })
  };
};

// Calculate head tilt
const calculateHeadTilt = (nose, jawline) => {
  const noseBase = nose[3];
  const noseTip = nose[0];
  const leftJaw = jawline[0];
  const rightJaw = jawline[16];

  // Calculate vertical angle
  const verticalAngle = Math.atan2(
    noseTip.y - noseBase.y,
    noseTip.x - noseBase.x
  ) * (180 / Math.PI);

  // Calculate head rotation
  const jawAngle = Math.atan2(
    rightJaw.y - leftJaw.y,
    rightJaw.x - leftJaw.x
  ) * (180 / Math.PI);

  return {
    angle: verticalAngle,
    rotation: jawAngle,
    deviation: Math.abs(verticalAngle) + Math.abs(jawAngle) / 2
  };
};

// Calculate eye alignment (drooping)
const calculateEyeAlignment = (leftEye, rightEye) => {
  const leftCenter = {
    x: (leftEye[0].x + leftEye[3].x) / 2,
    y: (leftEye[0].y + leftEye[3].y) / 2
  };
  const rightCenter = {
    x: (rightEye[0].x + rightEye[3].x) / 2,
    y: (rightEye[0].y + rightEye[3].y) / 2
  };

  const alignment = Math.abs(rightCenter.y - leftCenter.y);
  return {
    value: alignment,
    isDrooping: alignment > 5
  };
};

// Calculate mouth relaxation
const calculateMouthRelaxation = (mouth) => {
  const upperLipHeight = euclideanDistance(mouth[13], mouth[14]);
  const lowerLipHeight = euclideanDistance(mouth[19], mouth[18]);
  const mouthWidth = euclideanDistance(mouth[0], mouth[6]);
  
  const relaxationRatio = (upperLipHeight + lowerLipHeight) / (2 * mouthWidth);
  return {
    value: relaxationRatio,
    isRelaxed: relaxationRatio < 0.2
  };
};

// Calculate sleep confidence score
const calculateSleepConfidence = (metrics) => {
  let confidence = 0;
  
  // Eye closure contributes 30%
  if (metrics.isEyesClosed) {
    confidence += 0.3;
  } else {
    confidence += 0.3 * (1 - metrics.eyeAspectRatio / CONFIG.EYE_CLOSURE_THRESHOLD);
  }

  // Head tilt contributes 20%
  if (metrics.isHeadTilted) {
    confidence += 0.2;
  } else {
    confidence += 0.2 * (Math.abs(metrics.headTiltAngle) / CONFIG.HEAD_TILT_THRESHOLD);
  }

  // Sleeping expression contributes 30%
  if (metrics.isInSleepingState) {
    confidence += 0.3;
  } else {
    confidence += 0.3 * metrics.sleepingScore;
  }

  // Eye alignment contributes 10%
  if (metrics.eyeAlignment.isDrooping) {
    confidence += 0.1;
  }

  // Mouth relaxation contributes 10%
  if (metrics.mouthRelaxation.isRelaxed) {
    confidence += 0.1;
  }

  return confidence;
};

// Enhanced emotion trend tracking
export class EmotionTrendTracker {
  constructor(windowSize = 60) {
    this.windowSize = windowSize;
    this.emotionHistory = [];
    this.attentionHistory = [];
    this.emotionBuffer = new EmotionBuffer();
    this.noFaceDetectionCount = 0;
    this.totalFrames = 0;
    this.lastProcessedTime = Date.now();
  }

  addEmotionData(emotionData) {
    if (!emotionData) return;

    const currentTime = Date.now();
    const timeDiff = currentTime - this.lastProcessedTime;
    this.lastProcessedTime = currentTime;

    this.totalFrames++;
    if (!emotionData.facePresent) {
      this.noFaceDetectionCount++;
    }

    this.emotionHistory.push({
      emotions: emotionData.emotions,
      timestamp: emotionData.timestamp,
      facePresent: emotionData.facePresent,
      timeDiff
    });

    this.attentionHistory.push({
      attention: emotionData.attention,
      timestamp: emotionData.timestamp,
      metrics: emotionData.attention.metrics,
      facePresent: emotionData.facePresent,
      consecutiveNoFaceFrames: emotionData.attention.consecutiveNoFaceFrames
    });

    // Remove old data
    const cutoffTime = Date.now() - (this.windowSize * 1000);
    this.emotionHistory = this.emotionHistory.filter(entry => entry.timestamp > cutoffTime);
    this.attentionHistory = this.attentionHistory.filter(entry => entry.timestamp > cutoffTime);
  }

  getEmotionTrends() {
    if (this.emotionHistory.length === 0) return null;

    const emotions = ['angry', 'disgusted', 'fearful', 'happy', 'neutral', 'sleeping', 'surprised'];
    const trends = {};

    emotions.forEach(emotion => {
      const values = this.emotionHistory
        .filter(entry => entry.facePresent)
        .map(entry => {
          if (emotion === 'sleeping') {
            return entry.emotions?.['sleeping'] || entry.emotions?.['sad'] || 0;
          }
          return entry.emotions?.[emotion] || 0;
        });
      
      const recentValues = values.slice(-5);
      
      trends[emotion] = {
        current: recentValues[recentValues.length - 1],
        average: this.calculateWeightedAverage(values),
        trend: this.calculateTrendWithConfidence(values),
        stability: this.calculateStability(values)
      };
    });

    // Add face presence statistics
    trends.facePresence = {
      rate: 1 - (this.noFaceDetectionCount / this.totalFrames),
      consecutive: this.calculateConsecutiveNoFaceFrames()
    };

    return trends;
  }

  getAttentionMetrics() {
    if (this.attentionHistory.length === 0) return null;

    const recentHistory = this.attentionHistory.slice(-10);
    const presentFaces = recentHistory.filter(entry => entry.facePresent);
    const attentiveCount = presentFaces.filter(entry => 
      entry.attention.state === AttentionState.ATTENTIVE
    ).length;

    return {
      attentionRate: presentFaces.length > 0 ? attentiveCount / presentFaces.length : 0,
      averageConfidence: this.calculateWeightedAverage(
        presentFaces.map(entry => entry.attention.confidence)
      ),
      facePresenceRate: presentFaces.length / recentHistory.length,
      metrics: presentFaces.length > 0 ? {
        averageEAR: this.calculateWeightedAverage(
          presentFaces.map(entry => entry.metrics?.eyeAspectRatio || 0)
        ),
        averageSymmetry: this.calculateWeightedAverage(
          presentFaces.map(entry => entry.metrics?.symmetry || 0)
        )
      } : null
    };
  }

  calculateConsecutiveNoFaceFrames() {
    let count = 0;
    for (let i = this.attentionHistory.length - 1; i >= 0; i--) {
      if (!this.attentionHistory[i].facePresent) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  calculateWeightedAverage(values) {
    const weights = values.map((_, index) => index + 1);
    const weightedSum = values.reduce((sum, value, index) => sum + value * weights[index], 0);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    return weightedSum / weightSum;
  }

  calculateTrendWithConfidence(values) {
    if (values.length < 4) return { direction: 'stable', confidence: 0 };

    const recentAvg = this.calculateWeightedAverage(values.slice(-3));
    const oldAvg = this.calculateWeightedAverage(values.slice(0, 3));
    const diff = recentAvg - oldAvg;
    
    const confidence = Math.min(Math.abs(diff) * 5, 1);
    
    if (diff > 0.1) return { direction: 'increasing', confidence };
    if (diff < -0.1) return { direction: 'decreasing', confidence };
    return { direction: 'stable', confidence };
  }

  calculateStability(values) {
    if (values.length < 2) return 1;
    
    const differences = values.slice(1).map((value, index) => 
      Math.abs(value - values[index])
    );
    
    const avgDifference = differences.reduce((a, b) => a + b, 0) / differences.length;
    return Math.max(0, 1 - avgDifference * 2);
  }
} 