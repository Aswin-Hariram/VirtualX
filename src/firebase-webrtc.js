import firebase from 'firebase/app';
import 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC32Ue5WAMQ0SCL0BwKkdrCnz3BGcoTjMU",
    authDomain: "videocall-6d485.firebaseapp.com",
    projectId: "videocall-6d485",
    storageBucket: "videocall-6d485.appspot.com",
    messagingSenderId: "338090343580",
    appId: "1:338090343580:web:420094ceb23553891e8159",
    measurementId: "G-LBEC7L80Q5"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

export const firestore = firebase.firestore();

// WebRTC configuration
export const servers = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302',
                'stun:stun.l.google.com:19302'
            ],
        },
        {
            urls: [
                'turn:openrelay.metered.ca:80',
                'turn:openrelay.metered.ca:80?transport=tcp',
                'turn:openrelay.metered.ca:443',
                'turn:openrelay.metered.ca:443?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject',
        },
        {
            urls: [
                'turn:global.turn.twilio.com:3478?transport=udp',
                'turn:global.turn.twilio.com:3478?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject',
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// WebRTC utility functions
export const createCall = async (pc, setCallId) => {
    try {
        const callDoc = firestore.collection('calls').doc();
        const offerCandidates = callDoc.collection('offerCandidates');
        const answerCandidates = callDoc.collection('answerCandidates');

        setCallId(callDoc.id);

        // Set up ICE candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('New ICE candidate:', event.candidate.type, event.candidate.protocol);
                offerCandidates.add(event.candidate.toJSON());
            }
        };

        // Set up ICE connection state monitoring
        pc.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed') {
                console.log('ICE connection failed, attempting restart...');
                pc.restartIce();
            }
        };

        // Create and set local description
        const offerDescription = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            voiceActivityDetection: true
        });
        await pc.setLocalDescription(offerDescription);

        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };

        await callDoc.set({ offer });

        return { callDoc, answerCandidates };
    } catch (error) {
        console.error('Error creating call:', error);
        throw new Error('Failed to create call');
    }
};

export const answerCall = async (pc, callId) => {
    try {
        const callDoc = firestore.collection('calls').doc(callId);
        const answerCandidates = callDoc.collection('answerCandidates');
        const offerCandidates = callDoc.collection('offerCandidates');

        pc.onicecandidate = (event) => {
            event.candidate && answerCandidates.add(event.candidate.toJSON());
        };

        const callData = (await callDoc.get()).data();
        if (!callData) {
            throw new Error('Call not found');
        }

        const offerDescription = callData.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);

        const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
        };

        await callDoc.update({ answer });

        return { callDoc, offerCandidates };
    } catch (error) {
        console.error('Error answering call:', error);
        throw new Error('Failed to answer call');
    }
};