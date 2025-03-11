import firebase from 'firebase/app';
import { auth } from '../firebase-config';
import { servers } from '../firebase-webrtc';
import { SDPUtils } from 'sdp-utils';

export class ClassroomManager {
  constructor(firestore) {
    if (!firestore) {
      throw new Error('Firestore instance is required');
    }
    this.firestore = firestore;
    this.peerConnections = new Map();
    this.localStream = null;
    this.onParticipantJoined = null;
    this.onParticipantLeft = null;
    this.role = null;
    this.unsubscribers = new Set();
    this.roomId = null;
    this.onHandRaiseUpdate = null;
  }

  async initializeAsTeacher(roomId, localStream) {
    if (!roomId) throw new Error('Room ID is required');
    if (!localStream) throw new Error('Local stream is required');

    try {
      this.role = 'teacher';
      this.localStream = localStream;
      this.roomId = roomId;
      
      const roomRef = this.firestore.collection('classrooms').doc(roomId);
      
      // Check if room already exists
      const roomDoc = await roomRef.get();
      if (roomDoc.exists) {
        throw new Error('Classroom already exists');
      }

      // Get current user ID or use anonymous
      const currentUser = auth.currentUser;
      const teacherId = currentUser ? currentUser.uid : 'anonymous';

      // Create the room
      await roomRef.set({
        teacherId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        active: true
      });

      // Listen for new students joining
      const unsubscribe = roomRef.collection('participants').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          try {
            const data = change.doc.data();
            if (change.type === 'added' && data.role === 'student') {
              // Wait for the offer to be available
              const unsubscribeOffer = change.doc.ref.onSnapshot(async (participantDoc) => {
                const participantData = participantDoc.data();
                if (participantData?.offer && !this.peerConnections.has(change.doc.id)) {
                  await this.handleNewStudent(change.doc.id, participantData);
                  unsubscribeOffer();
                }
              });
              this.unsubscribers.add(unsubscribeOffer);
            }
            if (change.type === 'removed') {
              this.handleStudentLeft(change.doc.id);
            }
          } catch (error) {
            console.error('Error handling student change:', error);
          }
        });
      });

      this.unsubscribers.add(unsubscribe);
      return roomId;
    } catch (error) {
      console.error('Error initializing as teacher:', error);
      this.cleanup();
      throw error;
    }
  }

  async joinAsStudent(roomId, localStream) {
    if (!roomId) throw new Error('Room ID is required');
    if (!localStream) throw new Error('Local stream is required');

    try {
      this.role = 'student';
      this.localStream = localStream;
      this.roomId = roomId;

      const roomRef = this.firestore.collection('classrooms').doc(roomId);
      
      // Check if room exists
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) {
        throw new Error('Classroom not found');
      }
      if (!roomDoc.data().active) {
        throw new Error('Classroom is no longer active');
      }

      const participantRef = roomRef.collection('participants').doc();
      this.participantId = participantRef.id;

      // First create the participant document
      await participantRef.set({
        role: 'student',
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        isHandRaised: false,
        connectionState: 'connecting'
      });

      // Create connection with teacher with enhanced configuration
      const pc = new RTCPeerConnection({
        ...servers,
        sdpSemantics: 'unified-plan',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10,
        iceServers: [
          {
            urls: [
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302'
            ]
          }
        ],
        // Add enhanced video quality settings
        encodings: [
          {
            rid: 'high',
            maxBitrate: 3500000, // 3.5 Mbps
            maxFramerate: 30,
            scaleResolutionDownBy: 1
          },
          {
            rid: 'medium',
            maxBitrate: 2500000, // 2.5 Mbps
            maxFramerate: 30,
            scaleResolutionDownBy: 1.5
          },
          {
            rid: 'low',
            maxBitrate: 1500000, // 1.5 Mbps
            maxFramerate: 30,
            scaleResolutionDownBy: 2
          }
        ]
      });
      
      this.peerConnections.set('teacher', pc);

      let connectionTimeout;
      const resetConnectionTimeout = () => {
        if (connectionTimeout) clearTimeout(connectionTimeout);
        connectionTimeout = setTimeout(() => {
          if (pc.connectionState !== 'connected') {
            console.log('Connection timeout, attempting reconnection...');
            this.handleConnectionFailure(pc, participantRef);
          }
        }, 15000); // 15 second timeout
      };

      // Enhanced connection state monitoring
      pc.onconnectionstatechange = () => {
        console.log('Connection state changed:', pc.connectionState);
        console.log('ICE connection state:', pc.iceConnectionState);
        console.log('Signaling state:', pc.signalingState);

        // Update connection state in Firestore
        participantRef.update({
          connectionState: pc.connectionState
        }).catch(console.error);

        if (pc.connectionState === 'connected') {
          clearTimeout(connectionTimeout);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.log('Connection failed or disconnected, attempting to reconnect...');
          this.handleConnectionFailure(pc, participantRef);
        }
      };

      // Enhanced ICE candidate handling
      const iceCandidates = [];
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Student sending ICE candidate:', {
            type: event.candidate.type,
            protocol: event.candidate.protocol,
            address: event.candidate.address,
            port: event.candidate.port
          });
          
          // Store candidates temporarily
          iceCandidates.push(event.candidate);
          
          // Send candidate to teacher
          participantRef.collection('candidates').add(event.candidate.toJSON());
        } else {
          console.log('ICE candidate gathering completed');
          // Send all gathered candidates at once
          const batch = this.firestore.batch();
          iceCandidates.forEach((candidate, index) => {
            const candidateRef = participantRef.collection('candidates').doc();
            batch.set(candidateRef, {
              ...candidate.toJSON(),
              timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              index
            });
          });
          batch.commit().catch(console.error);
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', pc.iceGatheringState);
      };

      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state changed:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'checking') {
          resetConnectionTimeout();
        } else if (pc.iceConnectionState === 'failed') {
          console.log('ICE Connection failed, attempting restart...');
          pc.restartIce();
        }
      };

      // Add bandwidth control
      const setBandwidthConstraints = (sdp) => {
        const modifier = new SDPUtils();
        sdp = modifier.setVideoBitrates(sdp, {
          min: 1000, // 1 Mbps
          max: 3500  // 3.5 Mbps
        });
        sdp = modifier.setAudioBitrate(sdp, 128); // 128 kbps for audio
        return sdp;
      };

      // Add video quality monitoring and adaptation
      const monitorVideoQuality = async (sender) => {
        try {
          const stats = await sender.getStats();
          let totalPacketsLost = 0;
          let totalPacketsSent = 0;
          let bitrateSum = 0;
          let statCount = 0;

          stats.forEach(stat => {
            if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
              totalPacketsLost += stat.packetsLost || 0;
              totalPacketsSent += stat.packetsSent || 0;
              if (stat.bytesSent && stat.timestamp) {
                bitrateSum += (stat.bytesSent * 8) / (stat.timestamp / 1000);
                statCount++;
              }
            }
          });

          const packetLossRate = totalPacketsSent ? (totalPacketsLost / totalPacketsSent) : 0;
          const averageBitrate = statCount ? (bitrateSum / statCount) : 0;

          // Adapt video quality based on network conditions
          if (packetLossRate > 0.1) { // More than 10% packet loss
            console.log('High packet loss detected, reducing video quality');
            await sender.setParameters({
              ...sender.getParameters(),
              degradationPreference: 'maintain-framerate'
            });
          } else if (packetLossRate < 0.05 && averageBitrate > 2000000) { // Less than 5% loss and good bandwidth
            console.log('Good network conditions, increasing video quality');
            await sender.setParameters({
              ...sender.getParameters(),
              degradationPreference: 'maintain-resolution'
            });
          }
        } catch (error) {
          console.error('Error monitoring video quality:', error);
        }
      };

      // Add local tracks to the connection with enhanced monitoring
      this.localStream.getTracks().forEach(track => {
        console.log('Adding track to connection:', {
          kind: track.kind,
          label: track.label,
          enabled: track.enabled,
          muted: track.muted
        });
        
        const sender = pc.addTrack(track, this.localStream);
        
        if (track.kind === 'video') {
          // Set up quality monitoring interval
          const qualityMonitor = setInterval(() => {
            if (pc.connectionState === 'connected') {
              monitorVideoQuality(sender);
            }
          }, 5000);

          // Store interval for cleanup
          this.unsubscribers.add(() => clearInterval(qualityMonitor));
        }
      });

      // Create and send offer with enhanced options
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true,
        voiceActivityDetection: true
      });

      // Apply bandwidth constraints
      offer.sdp = setBandwidthConstraints(offer.sdp);

      console.log('Created offer:', {
        type: offer.type,
        sdp: offer.sdp.substring(0, 100) + '...'
      });
      
      await pc.setLocalDescription(offer);
      
      // Update the existing document with the offer
      await participantRef.update({
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Set up remote stream handling with reconnection logic
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          console.log('Received remote stream:', {
            id: remoteStream.id,
            tracks: remoteStream.getTracks().map(t => ({
              kind: t.kind,
              enabled: t.enabled,
              muted: t.muted,
              readyState: t.readyState
            }))
          });

          // Create a new MediaStream to avoid reference issues
          const newStream = new MediaStream();
          
          // Add tracks to the new stream and ensure they're enabled
          remoteStream.getTracks().forEach(track => {
            track.enabled = true;
            newStream.addTrack(track.clone()); // Clone the track to avoid reference issues
            
            // Enhanced track monitoring
            track.onended = () => {
              console.log(`Remote ${track.kind} track ended, attempting to recover...`);
              if (pc.connectionState === 'connected') {
                this.handleTrackEnded(pc, track);
              }
            };

            track.onmute = () => {
              console.log(`Remote ${track.kind} track muted, attempting to unmute...`);
              track.enabled = true;
            };

            track.onunmute = () => {
              console.log(`Remote ${track.kind} track unmuted`);
            };
          });

          // Call the callback with the new stream
          if (this.onParticipantJoined) {
            console.log('Calling onParticipantJoined with new stream');
            this.onParticipantJoined('teacher', newStream);
          }

          // Set up periodic track health check
          const trackHealthCheck = setInterval(() => {
            if (pc.connectionState === 'connected') {
              newStream.getTracks().forEach(track => {
                if (!track.enabled || track.muted) {
                  console.log(`Recovering ${track.kind} track...`);
                  track.enabled = true;
                }

                // Check track stats
                pc.getStats(track).then(stats => {
                  stats.forEach(report => {
                    if (report.type === 'inbound-rtp') {
                      console.log(`Track ${track.kind} stats:`, {
                        packetsReceived: report.packetsReceived,
                        packetsLost: report.packetsLost,
                        jitter: report.jitter
                      });
                    }
                  });
                }).catch(console.error);
              });
            } else {
              clearInterval(trackHealthCheck);
            }
          }, 2000);

          // Store interval for cleanup
          this.unsubscribers.add(() => {
            clearInterval(trackHealthCheck);
            newStream.getTracks().forEach(track => track.stop());
          });
        }
      };

      // Listen for answer from teacher with enhanced retry logic
      const maxRetries = 3;
      let retryCount = 0;
      
      const unsubscribe1 = participantRef.onSnapshot((snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
          console.log('Received teacher answer:', data.answer.type);
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answerDescription).catch(error => {
            console.error('Error setting remote description:', error);
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(() => {
                console.log(`Retrying setRemoteDescription (attempt ${retryCount})`);
                pc.setRemoteDescription(answerDescription).catch(console.error);
              }, 1000 * retryCount);
            }
          });
        }
      });

      this.unsubscribers.add(unsubscribe1);

      // Listen for teacher's ICE candidates with ordering
      const unsubscribe2 = participantRef.collection('teacherCandidates')
        .orderBy('timestamp')
        .onSnapshot((snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const candidate = new RTCIceCandidate(change.doc.data());
              console.log('Student received ICE candidate from teacher:', candidate.protocol);
              pc.addIceCandidate(candidate).catch(error => {
                console.error('Error adding ICE candidate:', error);
                // Queue failed candidates for retry
                setTimeout(() => {
                  if (pc.connectionState !== 'connected') {
                    pc.addIceCandidate(candidate).catch(console.error);
                  }
                }, 1000);
              });
            }
          });
        });

      this.unsubscribers.add(unsubscribe2);
      this.unsubscribers.add(() => clearTimeout(connectionTimeout));

      return participantRef.id;
    } catch (error) {
      console.error('Error joining as student:', error);
      this.cleanup();
      throw error;
    }
  }

  async handleConnectionFailure(pc, participantRef) {
    try {
      // Create a new offer with ICE restart
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      
      // Update the offer in Firestore
      await participantRef.update({
        offer: {
          type: offer.type,
          sdp: offer.sdp
        }
      });

      console.log('Sent new offer after connection failure');
    } catch (error) {
      console.error('Error handling connection failure:', error);
    }
  }

  async handleIceFailure(pc, participantRef) {
    try {
      // Force ICE restart
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      
      // Update the offer in Firestore
      await participantRef.update({
        iceRestartOffer: {
          type: offer.type,
          sdp: offer.sdp
        }
      });

      console.log('Sent ICE restart offer');
    } catch (error) {
      console.error('Error handling ICE failure:', error);
    }
  }

  async handleTeacherReconnection(pc, participantRef, reconnectionOffer) {
    try {
      console.log('Handling teacher reconnection offer');
      await pc.setRemoteDescription(new RTCSessionDescription(reconnectionOffer));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      await participantRef.update({
        reconnectionAnswer: {
          type: answer.type,
          sdp: answer.sdp
        }
      });
      
      console.log('Sent reconnection answer to teacher');
    } catch (error) {
      console.error('Error handling teacher reconnection:', error);
    }
  }

  async handleTrackEnded(pc, track) {
    try {
      // Attempt to restart the specific track
      if (this.localStream) {
        const newTrack = this.localStream.getTracks().find(t => t.kind === track.kind);
        if (newTrack) {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === track.kind);
          if (sender) {
            await sender.replaceTrack(newTrack);
            console.log(`Successfully replaced ended ${track.kind} track`);
          }
        }
      }
    } catch (error) {
      console.error('Error handling ended track:', error);
    }
  }

  async handleNewStudent(studentId, studentData) {
    if (this.role !== 'teacher') return;

    try {
      if (!studentData?.offer) {
        console.log('Waiting for student offer...');
        return;
      }

      console.log('Handling new student with offer:', studentId);
      const pc = new RTCPeerConnection(servers);
      this.peerConnections.set(studentId, pc);

      // Add local tracks to the connection with monitoring
      this.localStream.getTracks().forEach(track => {
        console.log('Adding track to connection:', track.kind, track.label);
        const sender = pc.addTrack(track, this.localStream);
        
        // Monitor sender stats
        setInterval(async () => {
          try {
            const stats = await sender.getStats();
            stats.forEach(report => {
              if (report.type === 'outbound-rtp') {
                console.log(`Outbound ${track.kind} stats:`, {
                  bytesSent: report.bytesSent,
                  packetsSent: report.packetsSent,
                  framesSent: report.framesSent
                });
              }
            });
          } catch (error) {
            console.error('Error getting sender stats:', error);
          }
        }, 5000);
      });

      // Set up remote stream handling with retry logic
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream && this.onParticipantJoined) {
          console.log('Received remote stream from student:', studentId, {
            tracks: remoteStream.getTracks().map(t => ({
              kind: t.kind,
              enabled: t.enabled,
              muted: t.muted
            }))
          });

          // Ensure all tracks are enabled
          remoteStream.getTracks().forEach(track => {
            track.enabled = true;
          });

          this.onParticipantJoined(studentId, remoteStream);
        }
      };

      const participantRef = this.firestore
        .collection('classrooms')
        .doc(this.roomId)
        .collection('participants')
        .doc(studentId);

      // Handle ICE candidates with improved logging
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Teacher sending ICE candidate:', event.candidate.type, event.candidate.protocol);
          participantRef.collection('teacherCandidates').add(event.candidate.toJSON());
        }
      };

      // Handle ICE connection state changes with retry
      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          console.log('ICE Connection failed, attempting restart...');
          this.handleIceRestart(pc, participantRef);
        }
      };

      // Handle connection state changes with reconnection logic
      pc.onconnectionstatechange = () => {
        console.log('Connection state with student:', studentId, pc.connectionState);
        if (pc.connectionState === 'failed') {
          console.log('Connection failed, attempting to reconnect...');
          this.handleReconnection(studentId, pc, participantRef);
        }
      };

      // Listen for ICE restart offers from student
      const unsubscribeIceRestart = participantRef.onSnapshot((snapshot) => {
        const data = snapshot.data();
        if (data?.iceRestartOffer && pc.signalingState !== 'stable') {
          console.log('Received ICE restart offer from student');
          this.handleStudentIceRestart(pc, participantRef, data.iceRestartOffer);
        }
      });

      this.unsubscribers.add(unsubscribeIceRestart);

      // Set remote description (student's offer)
      console.log('Setting remote description from student offer');
      await pc.setRemoteDescription(new RTCSessionDescription(studentData.offer));

      // Create and send answer with specific constraints
      const answer = await pc.createAnswer({
        voiceActivityDetection: true
      });
      console.log('Created answer for student');
      await pc.setLocalDescription(answer);
      await participantRef.update({
        answer: {
          type: answer.type,
          sdp: answer.sdp
        }
      });

      // Listen for student's ICE candidates with improved handling
      const unsubscribe = participantRef.collection('candidates').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            console.log('Teacher received ICE candidate from student:', candidate.protocol);
            pc.addIceCandidate(candidate).catch(error => {
              console.error('Error adding ICE candidate:', error);
              // Queue failed candidates for retry
              setTimeout(() => {
                pc.addIceCandidate(candidate).catch(console.error);
              }, 1000);
            });
          }
        });
      });

      this.unsubscribers.add(unsubscribe);

      // Add listener for hand raise updates
      console.log('Setting up hand raise listener for student:', studentId);
      const unsubscribeHandRaise = participantRef.onSnapshot((snapshot) => {
        const data = snapshot.data();
        console.log('Received hand raise update for student:', studentId, data);
        if (data && this.onHandRaiseUpdate) {
          this.onHandRaiseUpdate(studentId, !!data.isHandRaised);
        }
      });

      this.unsubscribers.add(unsubscribeHandRaise);
    } catch (error) {
      console.error('Error handling new student:', error);
      this.handleStudentLeft(studentId);
      throw error;
    }
  }

  async handleIceRestart(pc, participantRef) {
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await participantRef.update({
        iceRestartOffer: {
          type: offer.type,
          sdp: offer.sdp
        }
      });
      console.log('Sent ICE restart offer');
    } catch (error) {
      console.error('Error during ICE restart:', error);
    }
  }

  async handleStudentIceRestart(pc, participantRef, iceRestartOffer) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(iceRestartOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await participantRef.update({
        iceRestartAnswer: {
          type: answer.type,
          sdp: answer.sdp
        }
      });
      console.log('Sent ICE restart answer');
    } catch (error) {
      console.error('Error handling student ICE restart:', error);
    }
  }

  async handleReconnection(studentId, pc, participantRef) {
    try {
      // Create a new offer for reconnection
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      
      // Send the offer to the student
      await participantRef.update({
        reconnectionOffer: {
          type: offer.type,
          sdp: offer.sdp
        }
      });

      // Listen for reconnection answer
      const unsubscribe = participantRef.onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if (data?.reconnectionAnswer && pc.signalingState !== 'stable') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.reconnectionAnswer));
            console.log('Reconnection successful for student:', studentId);
            unsubscribe();
          } catch (error) {
            console.error('Error setting remote description during reconnection:', error);
          }
        }
      });

      // Clean up listener after 30 seconds if no answer
      setTimeout(() => {
        unsubscribe();
      }, 30000);
    } catch (error) {
      console.error('Error during reconnection:', error);
    }
  }

  handleStudentLeft(studentId) {
    const pc = this.peerConnections.get(studentId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(studentId);
    }
    if (this.onParticipantLeft) {
      this.onParticipantLeft(studentId);
    }
  }

  async updateHandRaiseStatus(isRaised) {
    if (!this.roomId || this.role !== 'student') return;

    try {
      const participantRef = this.firestore
        .collection('classrooms')
        .doc(this.roomId)
        .collection('participants')
        .doc(this.participantId);

      await participantRef.update({
        isHandRaised: isRaised
      });
    } catch (error) {
      console.error('Error updating hand raise status:', error);
    }
  }

  async updateAudioState(isEnabled) {
    try {
      if (this.localStream) {
        const audioTracks = this.localStream.getAudioTracks();
        console.log('Updating audio state:', {
          tracks: audioTracks.length,
          isEnabled
        });

        // Update all audio tracks
        audioTracks.forEach(track => {
          track.enabled = isEnabled;
          
          // Set up track monitoring
          track.onmute = () => {
            console.warn('Audio track muted unexpectedly');
            if (isEnabled) {
              track.enabled = true;
            }
          };

          track.onunmute = () => {
            console.log('Audio track unmuted');
          };

          track.onended = async () => {
            console.warn('Audio track ended unexpectedly');
            try {
              // Attempt to recover the audio track
              const newStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }
              });
              const newAudioTrack = newStream.getAudioTracks()[0];
              this.localStream.removeTrack(track);
              this.localStream.addTrack(newAudioTrack);
              newAudioTrack.enabled = isEnabled;
            } catch (error) {
              console.error('Failed to recover audio track:', error);
            }
          };
        });

        // Update all peer connections
        this.peerConnections.forEach((pc, peerId) => {
          const audioSender = pc.getSenders().find(sender => 
            sender.track && sender.track.kind === 'audio'
          );
          
          if (audioSender && audioSender.track) {
            audioSender.track.enabled = isEnabled;
            
            // Monitor sender stats
            const monitorSenderStats = async () => {
              try {
                const stats = await audioSender.getStats();
                stats.forEach(report => {
                  if (report.type === 'outbound-rtp') {
                    console.log(`Audio sender stats for peer ${peerId}:`, {
                      bytesSent: report.bytesSent,
                      packetsSent: report.packetsSent,
                      timestamp: report.timestamp
                    });
                  }
                });
              } catch (error) {
                console.error('Error getting audio sender stats:', error);
              }
            };

            // Monitor stats periodically
            const statsInterval = setInterval(monitorSenderStats, 5000);
            this.unsubscribers.add(() => clearInterval(statsInterval));

            console.log(`Updated audio sender for peer ${peerId}:`, {
              enabled: audioSender.track.enabled,
              muted: audioSender.track.muted,
              readyState: audioSender.track.readyState
            });
          }
        });

        // Update participant document if we're a student
        if (this.role === 'student' && this.participantId && this.roomId) {
          const participantRef = this.firestore
            .collection('classrooms')
            .doc(this.roomId)
            .collection('participants')
            .doc(this.participantId);

          await participantRef.update({
            isAudioEnabled: isEnabled,
            lastAudioUpdate: firebase.firestore.FieldValue.serverTimestamp(),
            audioState: {
              enabled: isEnabled,
              timestamp: Date.now(),
              trackInfo: audioTracks.map(track => ({
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState
              }))
            }
          });
        }
      }
    } catch (error) {
      console.error('Error updating audio state:', error);
      throw error;
    }
  }

  cleanup() {
    // Clean up peer connections
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();

    // Clean up local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    // Clean up Firestore listeners
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers.clear();

    // Update room status if teacher
    if (this.role === 'teacher' && this.roomId) {
      this.firestore
        .collection('classrooms')
        .doc(this.roomId)
        .update({ active: false })
        .catch(console.error);
    }
  }
} 