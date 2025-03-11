import { jsPDF } from 'jspdf';
import { processTranscriptWithGemini } from './gemini';

class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isPaused = false;
    this.recognition = null;
    this.transcript = '';
    this.stream = null;
    this.onTranscriptUpdate = null;
    this.analysis = null;
    this.hasSpeechDetected = false;
  }

  setTranscriptCallback(callback) {
    this.onTranscriptUpdate = callback;
  }

  async startRecording() {
    try {
      // Check if browser supports required APIs
      if (!('webkitSpeechRecognition' in window)) {
        throw new Error('Speech recognition is not supported in this browser. Please use Chrome.');
      }

      // Get audio stream
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up media recorder
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];
      this.transcript = '';
      this.analysis = null;
      this.isPaused = false;
      this.hasSpeechDetected = false;

      // Set up speech recognition
      this.recognition = new webkitSpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      // Handle recognition results
      this.recognition.onresult = (event) => {
        if (this.isPaused) return; // Skip processing if paused

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + '\n';
            this.hasSpeechDetected = true;
          } else {
            interimTranscript += transcript;
          }
        }

        // Update the transcript
        if (finalTranscript) {
          this.transcript += finalTranscript;
        }

        // Call the callback with both final and interim results
        if (this.onTranscriptUpdate) {
          const currentTranscript = this.transcript + interimTranscript;
          this.onTranscriptUpdate(currentTranscript || 'Listening... (Start speaking)');
        }
      };

      // Handle recognition errors
      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          if (this.onTranscriptUpdate) {
            this.onTranscriptUpdate('No speech detected. Please speak louder or check your microphone.');
          }
        }
        // Don't stop recording on all errors, only fatal ones
        if (event.error === 'network' || event.error === 'service-not-allowed') {
          this.stopRecording();
        }
      };

      // Handle recognition end
      this.recognition.onend = () => {
        if (this.isRecording && !this.isPaused) {
          // Attempt to restart recognition if it ends unexpectedly
          try {
            this.recognition.start();
          } catch (error) {
            console.error('Error restarting recognition:', error);
          }
        }
      };

      // Start recording
      this.mediaRecorder.ondataavailable = (event) => {
        if (!this.isPaused) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // Collect data every second
      this.recognition.start();
      this.isRecording = true;
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      this.stopRecording();
      throw error;
    }
  }

  pauseRecording() {
    if (this.isRecording && !this.isPaused) {
      this.isPaused = true;
      if (this.recognition) {
        this.recognition.stop();
      }
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.pause();
      }
      return true;
    }
    return false;
  }

  resumeRecording() {
    if (this.isRecording && this.isPaused) {
      this.isPaused = false;
      if (this.recognition) {
        this.recognition.start();
      }
      if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
        this.mediaRecorder.resume();
      }
      return true;
    }
    return false;
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.isPaused = false;

      if (this.recognition) {
        this.recognition.stop();
      }

      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      // Clear the callback
      this.onTranscriptUpdate = null;
    }
  }

  async processTranscript() {
    if (!this.hasSpeechDetected || !this.transcript.trim()) {
      throw new Error('No speech detected. Please ensure you spoke during the recording and your microphone is working properly.');
    }

    try {
      console.log('Starting transcript processing...');
      console.log('Transcript length:', this.transcript.length);
      
      // Clean up the transcript
      const cleanedTranscript = this.transcript
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanedTranscript.length === 0) {
        throw new Error('No valid speech detected in the recording. Please ensure you spoke clearly during the recording.');
      }

      console.log('Sending transcript to Gemini for analysis...');
      this.analysis = await processTranscriptWithGemini(cleanedTranscript);
      
      if (!this.analysis) {
        throw new Error('No analysis received from Gemini API');
      }

      console.log('Successfully received analysis from Gemini');
      return this.analysis;
    } catch (error) {
      console.error('Error in processTranscript:', error);
      this.analysis = null;
      throw error;
    }
  }

  async saveToPDF() {
    if (!this.transcript.trim()) {
      throw new Error('No transcript available. Please ensure you spoke during the recording.');
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const lineHeight = 7;
      const maxWidth = pageWidth - 2 * margin;

      // Add title
      doc.setFontSize(16);
      doc.text('Class Lecture Transcript', margin, margin + lineHeight);

      // Add timestamp
      doc.setFontSize(10);
      const timestamp = new Date().toLocaleString();
      doc.text(`Recorded on: ${timestamp}`, margin, margin + 2 * lineHeight);

      // Add transcript
      doc.setFontSize(12);
      doc.text('Original Transcript:', margin, margin + 4 * lineHeight);
      const splitTranscript = doc.splitTextToSize(this.transcript, maxWidth);
      let y = margin + 6 * lineHeight;

      for (let i = 0; i < splitTranscript.length; i++) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(splitTranscript[i], margin, y);
        y += lineHeight;
      }

      // Add analysis if available
      if (this.analysis) {
        doc.addPage();
        y = margin;
        doc.setFontSize(14);
        doc.text('AI Analysis', margin, y);
        y += 2 * lineHeight;
        doc.setFontSize(12);
        const splitAnalysis = doc.splitTextToSize(this.analysis, maxWidth);
        
        for (let i = 0; i < splitAnalysis.length; i++) {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(splitAnalysis[i], margin, y);
          y += lineHeight;
        }
      }

      // Save the PDF
      doc.save('lecture-transcript.pdf');
      return true;
    } catch (error) {
      console.error('Error saving PDF:', error);
      throw new Error('Failed to generate PDF. Please try again.');
    }
  }
}

export const voiceRecorder = new VoiceRecorder(); 