// Utility functions for handling emotion-based alerts
import { db } from '../firebase-config';
import * as firebase from 'firebase/app';
import 'firebase/firestore';

// Threshold for considering consecutive detections as a persistent state
const ALERT_THRESHOLD = 3;
const SLEEPING_THRESHOLD = 2; // Lower threshold for sleeping detection

class AlertManager {
  constructor() {
    this.emotionCounts = new Map(); // Track consecutive emotion detections
    this.lastAlertTime = {};
    this.alertThreshold = 0.7; // Threshold for triggering alerts
    this.alertCooldown = 60000; // 1 minute cooldown between alerts
  }

  // Reset counts for a student
  resetCounts(studentId) {
    this.emotionCounts.set(studentId, {
      sad: 0,
      sleeping: 0,
      lastAlert: null,
      lastSleepingAlert: null
    });
  }

  // Check if we should send an alert based on emotion state
  async checkAndSendAlert(studentId, studentName, emotionData, roomId) {
    // Skip alert processing for teachers
    if (studentId.includes('teacher')) {
      return;
    }

    if (!emotionData || !roomId) return;

    const currentTime = Date.now();
    const lastAlert = this.lastAlertTime[studentId] || 0;

    // Check if enough time has passed since the last alert
    if (currentTime - lastAlert < this.alertCooldown) {
      return;
    }

    // Check for concerning emotions
    const concerningEmotions = ['angry', 'disgusted', 'fearful', 'sad'];
    let highestScore = 0;
    let triggeringEmotion = null;

    concerningEmotions.forEach(emotion => {
      if (emotionData[emotion] > highestScore && emotionData[emotion] > this.alertThreshold) {
        highestScore = emotionData[emotion];
        triggeringEmotion = emotion;
      }
    });

    if (triggeringEmotion) {
      try {
        // Create alert in database
        await db.collection('classrooms').doc(roomId).collection('alerts').add({
          studentId,
          studentName,
          emotion: triggeringEmotion,
          score: highestScore,
          timestamp: new Date().toISOString()
        });

        // Update last alert time
        this.lastAlertTime[studentId] = currentTime;
      } catch (error) {
        console.error('Error sending alert:', error);
      }
    }
  }

  // Send alert to Firestore
  async sendAlert(studentId, studentName, alertType, roomId) {
    try {
      const alertsCollection = db.collection('classrooms').doc(roomId).collection('alerts');
      await alertsCollection.add({
        studentId,
        studentName,
        type: alertType,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'unread'
      });
    } catch (error) {
      console.error('Error sending alert:', error);
    }
  }
}

export const alertManager = new AlertManager(); 