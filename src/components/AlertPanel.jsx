import React, { useState, useEffect } from 'react';
import { db } from '../firebase-config';
import { Bell, AlertTriangle } from 'lucide-react';

const AlertPanel = ({ roomId, isTeacher }) => {
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isTeacher || !roomId) return;

    const alertsRef = db.collection('classrooms').doc(roomId).collection('alerts');
    const unsubscribe = alertsRef
      .orderBy('timestamp', 'desc')
      .onSnapshot((snapshot) => {
        const alertsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate()
        }));
        setAlerts(alertsList);
        setUnreadCount(alertsList.filter(alert => alert.status === 'unread').length);
      });

    return () => unsubscribe();
  }, [roomId, isTeacher]);

  const markAsRead = async (alertId) => {
    try {
      const alertRef = db.collection('classrooms').doc(roomId).collection('alerts').doc(alertId);
      await alertRef.update({
        status: 'read'
      });
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  if (!isTeacher) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-gray-700 transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-800 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-4">Student Alerts</h3>
            {alerts.length === 0 ? (
              <p className="text-gray-400">No alerts</p>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg ${
                      alert.status === 'unread' ? 'bg-gray-700' : 'bg-gray-900'
                    }`}
                    onClick={() => markAsRead(alert.id)}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`w-5 h-5 ${
                        alert.type === 'sleeping' ? 'text-yellow-500' : 'text-blue-500'
                      }`} />
                      <div>
                        <p className="font-medium">
                          {alert.studentName} is {alert.type}
                        </p>
                        <p className="text-sm text-gray-400">
                          {alert.timestamp?.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertPanel; 