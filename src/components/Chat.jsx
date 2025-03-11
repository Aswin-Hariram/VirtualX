import React, { useRef, useEffect, useState } from 'react';
import { Send, FileText, Download, Upload } from 'lucide-react';

const Chat = ({
  showChat,
  setShowChat,
  participantName,
  chatMessages,
  newMessage,
  setNewMessage,
  sendMessage,
  participantRole,
  handleKeyPress,
  onSendPDF,
  unreadCount,
  onMarkAsRead
}) => {
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isScrolledToBottom) {
      scrollToBottom();
    }
  }, [chatMessages, isScrolledToBottom]);

  useEffect(() => {
    if (showChat && onMarkAsRead) {
      onMarkAsRead();
    }
  }, [showChat, onMarkAsRead]);

  const handleScroll = (e) => {
    const { scrollHeight, scrollTop, clientHeight } = e.target;
    const isBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
    setIsScrolledToBottom(isBottom);
  };

  const handleSendPDF = async () => {
    try {
      await onSendPDF();
    } catch (error) {
      console.error('Error sending PDF:', error);
      alert('Failed to send PDF. Please try again.');
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file.');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target.result;
        await onSendPDF(base64Data, file.name);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Failed to read the PDF file. Please try again.');
    }
  };

  const handleDownloadPDF = (pdfData, filename) => {
    try {
      // Convert base64 to blob
      const byteString = atob(pdfData.split(',')[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      
      const blob = new Blob([ab], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF. Please try again.');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Chat</h3>
          {!showChat && unreadCount > 0 && (
            <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowChat(false)}
          className="p-1 hover:bg-gray-700 rounded"
        >
          <span className="sr-only">Close chat</span>
          ×
        </button>
      </div>

      <div 
        className="flex-1 overflow-y-auto space-y-4 mb-4"
        onScroll={handleScroll}
      >
        {chatMessages.map((message, index) => {
          const isCurrentUser = message.senderName === participantName && message.role === participantRole;
          
          return (
            <div
              key={index}
              className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  isCurrentUser
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-200'
                }`}
              >
                <div className="text-xs mb-1 opacity-75">
                  {message.senderName} ({message.role})
                </div>
                
                {message.type === 'pdf' ? (
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    <span>{message.filename}</span>
                    <button
                      onClick={() => handleDownloadPDF(message.pdfData, message.filename)}
                      className="ml-2 text-blue-300 hover:text-blue-200"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{message.text}</div>
                )}
                
                <div className="text-xs mt-1 opacity-75">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex items-center gap-2">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          className="flex-1 bg-gray-700 rounded-lg p-2 text-sm resize-none"
          rows="1"
        />
        <>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".pdf"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg"
            title="Upload PDF"
          >
            <Upload className="w-5 h-5" />
          </button>
          {participantRole === 'teacher' && (
            <button
              onClick={handleSendPDF}
              className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg"
              title="Send Recorded PDF"
            >
              <FileText className="w-5 h-5" />
            </button>
          )}
        </>
        <button
          onClick={() => {
            if (newMessage.trim()) {
              sendMessage(newMessage);
              setNewMessage('');
            }
          }}
          className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg"
          title="Send message"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default Chat; 