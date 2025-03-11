import React, { useEffect, useRef } from 'react';
import { Hand } from 'lucide-react';

const StudentVideo = ({ student, emotionData }) => {
  const videoRef = useRef(null);
  const isSleeping = emotionData?.[student.id]?.sleeping || !emotionData?.[student.id]?.faceDetected;

  useEffect(() => {
    const setupVideo = async () => {
      if (videoRef.current && student.stream) {
        try {
          console.log(`Setting up video for student ${student.id}:`, 
            student.stream.getTracks().map(track => ({
              kind: track.kind,
              enabled: track.enabled,
              id: track.id,
              label: track.label
            }))
          );

          videoRef.current.srcObject = student.stream;
          await videoRef.current.play();
          console.log(`Video playing for student ${student.id}`);
        } catch (error) {
          console.error(`Error setting up video for student ${student.id}:`, error);
        }
      }
    };

    setupVideo();

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [student.stream, student.id]);

  return (
    <div className={`relative aspect-video bg-gray-800 rounded-lg overflow-hidden ${
      isSleeping ? 'ring-4 ring-red-500 ring-opacity-75' : ''
    }`}>
      <video
        ref={videoRef}
        data-student-id={student.id}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }} // Mirror the video
      />
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-white text-sm flex items-center gap-2">
        <span>{student.name || 'Student'}</span>
        {student.isHandRaised && (
          <div className="bg-yellow-500 text-white p-1 rounded-full flex items-center">
            <Hand className="w-4 h-4" />
          </div>
        )}
      </div>

      {student.isHandRaised && (
        <div className="absolute bottom-2 right-2 bg-yellow-500 text-white p-2 rounded-lg flex items-center gap-2 animate-pulse shadow-lg">
          <Hand className="w-6 h-6" />
          <span className="font-medium">Hand Raised</span>
        </div>
      )}
    </div>
  );
};

const StudentGrid = ({ students, isTeacher, emotionData }) => {
  console.log('StudentGrid render:', { 
    isTeacher, 
    studentCount: students.length,
    students: students.map(s => ({
      id: s.id,
      hasStream: !!s.stream,
      trackCount: s.stream?.getTracks().length
    }))
  });

  if (!isTeacher || students.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">No students in the classroom</p>
      </div>
    );
  }

  const gridCols = Math.min(Math.ceil(Math.sqrt(students.length)), 4);
  
  return (
    <div 
      className="grid gap-2 h-full p-2" 
      style={{
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
      }}
    >
      {students.map((student) => (
        <StudentVideo 
          key={student.id} 
          student={student} 
          emotionData={emotionData}
        />
      ))}
    </div>
  );
};

export default StudentGrid; 