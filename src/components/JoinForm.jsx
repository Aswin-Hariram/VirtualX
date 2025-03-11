import React, { useState } from 'react';

const JoinForm = ({ onCreateRoom, onJoinRoom, setParticipantRole, setParticipantName }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [roomId, setRoomId] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Please enter your name');
      return;
    }

    setParticipantName(name);
    setParticipantRole(role);

    if (role === 'student') {
      if (!roomId.trim()) {
        alert('Please enter a room ID');
        return;
      }
      onJoinRoom(roomId);
    } else {
      onCreateRoom();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Join Virtual Classroom
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="Enter your name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>

          {role === 'student' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Room ID
              </label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:outline-none focus:border-blue-500"
                placeholder="Enter room ID"
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            {role === 'student' ? 'Join Classroom' : 'Create Classroom'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default JoinForm; 