import { db } from '../firebase-config';

export class ChatManager {
  constructor(roomId) {
    this.roomId = roomId;
    this.messagesRef = db.collection('classrooms').doc(roomId).collection('messages');
    this.unsubscribe = null;
    this.lastReadTimestamp = new Date().toISOString();
    this.unreadCount = 0;
    this.processedMessageIds = new Set();
  }

  // Send a new message
  async sendMessage(messageData) {
    try {
      const messageId = Date.now().toString();
      await this.messagesRef.add({
        ...messageData,
        id: messageId,
        timestamp: new Date().toISOString(),
        read: false
      });
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async sendPDF(pdfData, senderInfo) {
    try {
      const timestamp = new Date().toISOString();
      const messageId = Date.now().toString();
      const filename = senderInfo.filename || `lecture-transcript-${timestamp.replace(/[:.]/g, '-')}.pdf`;

      await this.messagesRef.add({
        type: 'pdf',
        id: messageId,
        filename,
        pdfData,
        sender: senderInfo.sender,
        senderName: senderInfo.senderName,
        role: senderInfo.role,
        timestamp: timestamp,
        read: false
      });

      return true;
    } catch (error) {
      console.error('Error sending PDF:', error);
      throw error;
    }
  }

  // Mark messages as read
  async markMessagesAsRead() {
    try {
      const unreadMessages = await this.messagesRef
        .where('timestamp', '>', this.lastReadTimestamp)
        .get();

      const batch = db.batch();
      unreadMessages.docs.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();

      this.lastReadTimestamp = new Date().toISOString();
      this.unreadCount = 0;
      this.processedMessageIds.clear();
      return true;
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw error;
    }
  }

  // Get unread message count
  getUnreadCount() {
    return this.unreadCount;
  }

  base64ToBlob(base64, type) {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([ab], { type });
  }

  // Listen for new messages
  subscribeToMessages(callback, currentUser) {
    this.unsubscribe = this.messagesRef
      .orderBy('timestamp', 'asc')
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const messageData = change.doc.data();
            const messageId = messageData.id || change.doc.id;

            // Check if we've already processed this message
            if (this.processedMessageIds.has(messageId)) {
              return;
            }

            // Add message to processed set
            this.processedMessageIds.add(messageId);

            // Increment unread count for messages from others that haven't been read
            if (messageData.sender !== currentUser && !messageData.read) {
              this.unreadCount++;
            }

            callback({
              ...messageData,
              id: messageId
            });
          }
        });
      });
  }

  // Cleanup
  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.processedMessageIds.clear();
    this.unreadCount = 0;
  }
} 