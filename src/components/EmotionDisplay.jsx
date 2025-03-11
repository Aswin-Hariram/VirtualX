import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

const EmotionDisplay = ({ emotionData, students, trendData, attentionData }) => {
  if (!emotionData || students.length === 0) return null;

  const emotions = ['angry', 'disgusted', 'fearful', 'happy', 'neutral', 'sad', 'surprised'];
  const colors = {
    angry: '#ef4444',
    disgusted: '#84cc16',
    fearful: '#a855f7',
    happy: '#eab308',
    neutral: '#64748b',
    sad: '#ef4444',
    surprised: '#ec4899'
  };

  // Calculate class average emotions
  const classAverages = emotions.map(emotion => {
    const sum = Object.values(emotionData).reduce((acc, studentEmotions) => {
      return acc + (studentEmotions.emotions?.[emotion] || 0);
    }, 0);
    let displayName = emotion.charAt(0).toUpperCase() + emotion.slice(1);
    if (emotion === 'neutral') displayName = 'Listening';
    if (emotion === 'sad') displayName = 'Sleeping';
    return {
      name: displayName,
      value: (sum / students.length).toFixed(2)
    };
  });

  // Get dominant emotions for each student with attention status
  const studentEmotions = students.map(student => {
    const data = emotionData[student.id];
    if (!data) return null;

    // Check if face is detected
    const isFaceDetected = data.faceDetected ?? true;
    if (!isFaceDetected) {
      return {
        id: student.id,
        name: student.name || 'Student',
        faceDetected: false
      };
    }

    const dominantEmotion = Object.entries(data.emotions || {}).reduce(
      (max, [emotion, value]) => (value > max.value ? { emotion, value } : max),
      { emotion: 'neutral', value: 0 }
    );

    // Ensure we have valid attention data with defaults
    const attention = data.attention || {};
    const isAttentive = attention.isAttentive ?? false;
    const attentionConfidence = attention.confidence ?? 0;

    return {
      id: student.id,
      name: student.name || 'Student',
      emotion: dominantEmotion.emotion,
      value: dominantEmotion.value,
      isAttentive,
      attentionConfidence,
      faceDetected: true
    };
  }).filter(Boolean);

  // Format trend data for charts
  const trendChartData = trendData ? emotions.map(emotion => {
    let displayName = emotion.charAt(0).toUpperCase() + emotion.slice(1);
    if (emotion === 'neutral') displayName = 'Listening';
    if (emotion === 'sad') displayName = 'Sleeping';
    return {
      name: displayName,
      current: trendData[emotion]?.current || 0,
      average: trendData[emotion]?.average || 0,
      trend: trendData[emotion]?.trend || 'stable'
    };
  }) : [];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Class Emotions</h3>
      
      {/* Class average chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={classAverages}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            barSize={30}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={60}
              interval={0}
              tick={{ fill: '#9ca3af', fontSize: 12 }}
            />
            <YAxis 
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              domain={[0, 1]}
              tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
            />
            <Tooltip 
              cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
              contentStyle={{ 
                backgroundColor: '#1f2937',
                border: 'none',
                borderRadius: '8px',
                padding: '8px'
              }}
              formatter={(value) => [`${(value * 100).toFixed(1)}%`]}
            />
            <Bar dataKey="value">
              {classAverages.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={colors[emotions[index]]} 
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Emotion trends */}
      {trendData && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Emotion Trends</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={trendChartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                barSize={20}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  interval={0}
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                />
                <YAxis 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                  contentStyle={{ 
                    backgroundColor: '#1f2937',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px'
                  }}
                  formatter={(value) => [`${(value * 100).toFixed(1)}%`]}
                />
                <Legend />
                <Bar dataKey="current" name="Current" fill="#3b82f6" fillOpacity={0.8} />
                <Bar dataKey="average" name="Average" fill="#64748b" fillOpacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Class attention metrics */}
      {attentionData && (
        <div className="bg-gray-700 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-medium">Class Attention</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400">Attention Rate</p>
              <p className="text-2xl font-semibold">
                {((attentionData.attentionRate || 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Average Confidence</p>
              <p className="text-2xl font-semibold">
                {((attentionData.averageConfidence || 0) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Individual student emotions */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Individual Students</h4>
        {studentEmotions.map(student => (
          <div
            key={student.id}
            className={`bg-gray-700 rounded-lg p-2 flex items-center justify-between ${
              !student.faceDetected ? 'border-l-4 border-red-500' :
              student.emotion === 'neutral' ? 'border-l-4 border-green-500' : 
              (student.emotion === 'sad') ? 'border-l-4 border-red-500' : 'border-l-4 border-yellow-500'
            }`}
          >
            <span className="text-sm">{student.name}</span>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {!student.faceDetected ? (
                  <>
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-md text-red-500">Face Not Detected</span>
                  </>
                ) : (
                  <>
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: colors[student.emotion] }}
                    />
                    <span className="text-md">
                      {student.emotion === 'sad' ? 'Sleeping' : 
                       student.emotion === 'neutral' ? 'Listening' :
                       student.emotion.charAt(0).toUpperCase() + student.emotion.slice(1)}
                    </span>
                  </>
                )}
              </div>
            
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmotionDisplay; 